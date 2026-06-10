/**
 * V8 — Interstellar Black Hole
 *
 * Trou noir de Schwarzschild, navigation libre.
 *
 * Physique combinée :
 *   v_orb(r)  = c × √(Rs/2r)          vitesse orbitale relativiste
 *   ω(r)      = c × √(Rs/2r³)         vitesse angulaire
 *   k_grav(r) = √(1 − Rs/r)           redshift gravitationnel
 *   k_orb     = 1/(γ_orb(1−β_orb cosθ)) Doppler orbital
 *   k_obs     = 1/(γ_obs(1−β_obs cosθ)) Doppler observateur
 *   t_emit    ≈ t − dist/c             retard lumineux (2 itérations)
 *   θ_E       = √(2Rs/D)              rayon angulaire anneau d'Einstein
 *
 * Ce qu'on voit :
 *   • Côté approchant du disque : bleu-blanc aveuglant (k > 3)
 *   • Côté fuyant : rouge sombre (k < 0.3)
 *   • Particules intérieures (3Rs) : fortement redshiftées par gravité
 *   • En s'approchant : anneau d'Einstein grossit, ciel se comprime
 *   • Jets polaires bleus émergent des pôles
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { ScenePanel } from '../components/ScenePanel'

// ─── Config ───────────────────────────────────────────────────────────────────
const Rs           = 30                                    // Schwarzschild radius
const SHADOW_R     = Rs * 2.6                              // rayon apparent de l'ombre
const BH_POS       = new THREE.Vector3(0, 0, 0)
const START        = new THREE.Vector3(0, 80, 560)
const MIN_DIST     = Rs * 1.35                             // ne pas franchir l'horizon
const BASE_SPEED   = 15
const SPRINT_MUL   = 3.0
const N_STARS      = 2200

// Anneaux du disque d'accrétion
const DISK_RINGS = [
  { r: 3.0 * Rs, n: 48 },   // ISCO — orbite la plus interne stable
  { r: 4.2 * Rs, n: 56 },
  { r: 5.8 * Rs, n: 64 },
  { r: 8.0 * Rs, n: 72 },
  { r: 11.0 * Rs, n: 80 },
  { r: 14.0 * Rs, n: 88 },
]
const N_DISK = DISK_RINGS.reduce((s, r) => s + r.n, 0)   // 408 particules

// Couleurs de base des anneaux (gradient thermique : intérieur chaud → extérieur froid)
const RING_COLORS = [
  new THREE.Color('#aaddff'),   // 3Rs : bleu-blanc intense
  new THREE.Color('#eeffee'),   // 4.2Rs : blanc chaud
  new THREE.Color('#ffeecc'),   // 5.8Rs : jaune-blanc
  new THREE.Color('#ffcc66'),   // 8Rs : orange-jaune
  new THREE.Color('#ff8822'),   // 11Rs : orange
  new THREE.Color('#ff3300'),   // 14Rs : rouge-orange
]

// ─── Physique ─────────────────────────────────────────────────────────────────
const _rPar = new THREE.Vector3()
const _rel  = new THREE.Vector3()
const _ctr  = new THREE.Vector3()
const _vHat = new THREE.Vector3()

/** Lorentz asymétrique : avancer contracte, reculer étire */
function lorentzOff(rel: THREE.Vector3, vHat: THREE.Vector3, gamma: number, out: THREE.Vector3) {
  const rPar = rel.dot(vHat)
  _rPar.copy(vHat).multiplyScalar(rPar)
  out.copy(rel).sub(_rPar)
  out.addScaledVector(vHat, rPar >= 0 ? rPar / gamma : rPar * gamma)
}

function dopplerK(cosT: number, beta: number, gamma: number) {
  const d = 1 - beta * cosT; return d < 1e-6 ? 50 : 1 / (gamma * d)
}

// ─── Données disk (pré-calculées, indépendantes de c) ────────────────────────
// omBase[i] = √(Rs / (2 r³))   → omega = omBase * c
// betaOrb[i] = √(Rs / (2 r))   → vitesse relative, fixe (indépendant de c)
const diskR       = new Float32Array(N_DISK)
const diskPhi0    = new Float32Array(N_DISK)
const diskYOff    = new Float32Array(N_DISK)
const diskOmBase  = new Float32Array(N_DISK)
const diskBetaOrb = new Float32Array(N_DISK)
const diskRingIdx = new Uint8Array(N_DISK)

;(() => {
  let idx = 0
  for (let ri = 0; ri < DISK_RINGS.length; ri++) {
    const { r, n } = DISK_RINGS[ri]
    for (let j = 0; j < n; j++) {
      diskR[idx]       = r
      diskPhi0[idx]    = (j / n) * Math.PI * 2 + ri * 0.47   // décalage aléatoire par anneau
      diskYOff[idx]    = (Math.random() - 0.5) * r * 0.04     // légère épaisseur de disque
      diskOmBase[idx]  = Math.sqrt(Rs / (2 * r * r * r))
      diskBetaOrb[idx] = Math.sqrt(Rs / (2 * r))
      diskRingIdx[idx] = ri
      idx++
    }
  }
})()

// ─── Étoiles (positions de repos — distordues par lentille chaque frame) ─────
const starRestPos = (() => {
  const arr = new Float32Array(N_STARS * 3)
  for (let i = 0; i < N_STARS; i++) {
    const r = 1200 + Math.random() * 2000
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    arr[i*3]   = r * Math.sin(ph) * Math.cos(th)
    arr[i*3+1] = r * Math.sin(ph) * Math.sin(th)
    arr[i*3+2] = r * Math.cos(ph)
  }
  return arr
})()

// ─── Scène statique ───────────────────────────────────────────────────────────
function BlackHoleModel({ einsteinRef }: { einsteinRef: React.RefObject<THREE.Mesh | null> }) {
  return (
    <group>
      {/* Ombre — sphère noire (rayon visuel = 2.6 Rs) */}
      <mesh>
        <sphereGeometry args={[SHADOW_R, 48, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Halo de l'horizon — lueur très sombre */}
      <mesh>
        <sphereGeometry args={[SHADOW_R * 1.04, 32, 24]} />
        <meshBasicMaterial color="#110400" transparent opacity={0.55} depthWrite={false} />
      </mesh>

      {/* Anneau d'Einstein — mis à l'échelle dynamiquement par Simulation */}
      <mesh ref={einsteinRef as React.RefObject<THREE.Mesh>} position={BH_POS.toArray()}>
        <torusGeometry args={[1, 0.04, 8, 120]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false}
          blending={THREE.AdditiveBlending} transparent depthWrite={false} />
      </mesh>

      {/* Anneau de photons : lueur fixe à 1.5 Rs */}
      <mesh position={BH_POS.toArray()}>
        <torusGeometry args={[Rs * 1.5, Rs * 0.04, 8, 80]} />
        <meshBasicMaterial color="#ffaa44" toneMapped={false}
          blending={THREE.AdditiveBlending} transparent depthWrite={false} opacity={0.6} />
      </mesh>

      {/* Jets relativistes polaires */}
      {([-1, 1] as const).map(sign => (
        <mesh key={sign} position={[0, sign * (SHADOW_R + 200), 0]}
          rotation={sign > 0 ? [0,0,0] : [Math.PI,0,0]}>
          <cylinderGeometry args={[60, 4, 400, 12, 1, true]} />
          <meshBasicMaterial color="#2255ff" side={THREE.BackSide} toneMapped={false}
            blending={THREE.AdditiveBlending} transparent opacity={0.12} depthWrite={false} />
        </mesh>
      ))}
      {/* Cœur des jets */}
      {([-1, 1] as const).map(sign => (
        <mesh key={`c${sign}`} position={[0, sign * (SHADOW_R + 200), 0]}
          rotation={sign > 0 ? [0,0,0] : [Math.PI,0,0]}>
          <cylinderGeometry args={[10, 1.5, 400, 8, 1, true]} />
          <meshBasicMaterial color="#88bbff" toneMapped={false}
            blending={THREE.AdditiveBlending} transparent opacity={0.25} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Simulation ───────────────────────────────────────────────────────────────
// Vecteurs temporaires réutilisés (évite le GC)
const _t0  = new THREE.Vector3()
const _t1  = new THREE.Vector3()
const _t2  = new THREE.Vector3()
const _col = new THREE.Color()
const _dum = new THREE.Object3D()

interface SimProps {
  cSim: number; locked: boolean
  einsteinRef: React.RefObject<THREE.Mesh | null>
  betaRef:    React.RefObject<HTMLSpanElement | null>
  dilRef:     React.RefObject<HTMLSpanElement | null>
  distRef:    React.RefObject<HTMLSpanElement | null>
  dopFwdRef:  React.RefObject<HTMLSpanElement | null>
  dopBwdRef:  React.RefObject<HTMLSpanElement | null>
  sprintRef:  React.RefObject<HTMLSpanElement | null>
  warnRef:    React.RefObject<HTMLDivElement | null>
  resetRef:   React.MutableRefObject<(() => void) | null>
}

function Simulation({
  cSim, locked, einsteinRef,
  betaRef, dilRef, distRef, dopFwdRef, dopBwdRef, sprintRef, warnRef, resetRef,
}: SimProps) {
  const { scene, camera } = useThree()
  const tRef      = useRef(0)
  const cRef      = useRef(cSim); cRef.current = cSim
  const locRef    = useRef(locked); locRef.current = locked
  const keys      = useRef<Set<string>>(new Set())
  const velRef    = useRef(new THREE.Vector3(0, 0, -1))
  const betaLive  = useRef(0)

  // InstancedMesh disk
  const diskRef   = useRef<THREE.InstancedMesh | null>(null)

  // Star lensed positions (mutable buffer)
  const starBuf   = useRef(new Float32Array(starRestPos))
  const starGeo   = useRef<THREE.BufferGeometry | null>(null)
  const starPoints = useRef<THREE.Points | null>(null)

  useEffect(() => {
    resetRef.current = () => {
      camera.position.copy(START)
      camera.rotation.set(0, 0, 0)
      tRef.current = 0; betaLive.current = 0; velRef.current.set(0, 0, -1)
    }
    camera.position.copy(START)

    // ── Disk InstancedMesh ──────────────────────────────────────────────
    const geo = new THREE.SphereGeometry(1.8, 6, 4)
    const mat = new THREE.MeshBasicMaterial({
      toneMapped:  false,
      blending:    THREE.AdditiveBlending,
      transparent: true,
      depthWrite:  false,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, N_DISK)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N_DISK * 3), 3)
    // Init au repos
    const dummy = new THREE.Object3D()
    for (let i = 0; i < N_DISK; i++) {
      dummy.position.set(diskR[i] * Math.cos(diskPhi0[i]), diskYOff[i], diskR[i] * Math.sin(diskPhi0[i]))
      dummy.scale.setScalar(1); dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, new THREE.Color(0.5, 0.3, 0.1))
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
    scene.add(mesh); diskRef.current = mesh

    // ── Starfield avec lensing ──────────────────────────────────────────
    const sg = new THREE.BufferGeometry()
    starBuf.current.set(starRestPos)
    sg.setAttribute('position', new THREE.BufferAttribute(starBuf.current, 3))
    const smat = new THREE.PointsMaterial({
      color: '#ddeeff', size: 1.2, sizeAttenuation: true,
      transparent: true, opacity: 0.7,
    })
    const pts = new THREE.Points(sg, smat)
    scene.add(pts); starGeo.current = sg; starPoints.current = pts

    return () => {
      scene.remove(mesh); geo.dispose(); mat.dispose()
      scene.remove(pts); sg.dispose(); smat.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useEffect(() => {
    const dn = (e: KeyboardEvent) => keys.current.add(e.code)
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  useFrame((_s, delta) => {
    const dt  = Math.min(delta, 0.05)
    tRef.current += dt
    const t   = tRef.current
    const c   = cRef.current
    const cam = camera

    // ── Mouvement ─────────────────────────────────────────────────────
    const mv     = new THREE.Vector3()
    const sprint = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight')
    if (locRef.current) {
      if (keys.current.has('KeyW') || keys.current.has('ArrowUp'))    mv.z -= 1
      if (keys.current.has('KeyS') || keys.current.has('ArrowDown'))  mv.z += 1
      if (keys.current.has('KeyA') || keys.current.has('ArrowLeft'))  mv.x -= 1
      if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) mv.x += 1
      if (keys.current.has('Space'))                                   mv.y += 0.5
      if (keys.current.has('ControlLeft') || keys.current.has('ControlRight')) mv.y -= 0.5
    }

    const speed = BASE_SPEED * (sprint ? SPRINT_MUL : 1)
    let beta = 0
    if (mv.lengthSq() > 0) {
      mv.normalize().applyQuaternion(cam.quaternion); mv.y *= 0.35
      if (mv.lengthSq() > 0.01) { mv.normalize(); velRef.current.copy(mv) }
      cam.position.addScaledVector(mv, speed * dt)
    }
    // Répulsion horizon
    const distBH = cam.position.length()
    if (distBH < MIN_DIST) cam.position.normalize().multiplyScalar(MIN_DIST)

    betaLive.current += (beta - betaLive.current) * Math.min(dt * 8, 1)
    if (mv.lengthSq() > 0) betaLive.current = Math.min(speed / c, 0.999)

    const b  = betaLive.current
    const g  = b > 0.001 ? 1 / Math.sqrt(1 - b * b) : 1
    _vHat.copy(velRef.current)

    // ── Disk ──────────────────────────────────────────────────────────
    const disk = diskRef.current
    if (disk) {
      let maxDopFwd = 1, minDopBwd = 1  // pour HUD

      for (let i = 0; i < N_DISK; i++) {
        const r      = diskR[i]
        const phi0   = diskPhi0[i]
        const yOff   = diskYOff[i]
        const omBase = diskOmBase[i]
        const betaO  = diskBetaOrb[i]
        const ri     = diskRingIdx[i]

        const omega = omBase * c

        // Retard lumineux — 2 itérations
        _t0.set(r * Math.cos(phi0), yOff, r * Math.sin(phi0))
        let tEmit = t - _t0.distanceTo(cam.position) / c
        for (let it = 0; it < 2; it++) {
          const phE = phi0 + omega * tEmit
          _t1.set(r * Math.cos(phE), yOff, r * Math.sin(phE))
          tEmit = t - _t1.distanceTo(cam.position) / c
        }

        const phiEmit = phi0 + omega * tEmit
        const px = r * Math.cos(phiEmit)
        const pz = r * Math.sin(phiEmit)
        _t1.set(px, yOff, pz)  // position d'émission (dans le référentiel BH)

        // Doppler orbital (vitesse tangentielle)
        const vx = -Math.sin(phiEmit), vz = Math.cos(phiEmit)   // tangente orbit (CCW)
        _t2.copy(cam.position).sub(_t1).normalize()
        const cosOr  = _t2.x * vx + _t2.z * vz
        const gamOr  = 1 / Math.sqrt(1 - betaO * betaO)
        const kOrbit = 1 / (gamOr * (1 - betaO * cosOr))

        // Redshift gravitationnel
        const kGrav = Math.sqrt(Math.max(1e-4, 1 - Rs / r))

        // Doppler observateur
        _rel.subVectors(_t1, cam.position)
        const dObs = _rel.length()
        const cosO = dObs > 0.1 ? _rel.dot(_vHat) / dObs : 0
        const kObs = dopplerK(cosO, b, g)

        const kTotal = kOrbit * kGrav * kObs

        // HUD: doppler fwd/bwd
        if (kTotal > maxDopFwd) maxDopFwd = kTotal
        if (kTotal < minDopBwd) minDopBwd = kTotal

        // Position de la particule contractée (Lorentz observateur)
        if (b > 0.005 && _vHat.lengthSq() > 0.5) {
          lorentzOff(_rel, _vHat, g, _ctr)
          _t2.copy(cam.position).add(_ctr)
        } else {
          _t2.copy(_t1)
        }

        // Taille: plus grande pour l'anneau intérieur, visible même de loin
        const sz = 1 + (1 - ri / (DISK_RINGS.length - 1)) * 2.5

        _dum.position.copy(_t2)
        _dum.scale.setScalar(sz)
        _dum.updateMatrix()
        disk.setMatrixAt(i, _dum.matrix)

        // Couleur = gradient thermique × k_total
        const base = RING_COLORS[ri]
        const k    = kTotal
        const br   = Math.min(k * k * 0.35, 1.0)   // luminosité non-linéaire
        if (k >= 1) {
          // blueshift → vers blanc-bleu
          _col.copy(base).lerp(new THREE.Color(1.5, 1.5, 2.0), Math.min((k-1)/3, 1) * 0.8)
        } else {
          // redshift → vers rouge sombre
          _col.copy(base).multiply(new THREE.Color(k*0.9, k*0.3, k*0.1))
        }
        _col.multiplyScalar(br)
        disk.setColorAt(i, _col)
      }

      disk.instanceMatrix.needsUpdate = true
      disk.instanceColor!.needsUpdate = true

      if (dopFwdRef.current) {
        dopFwdRef.current.textContent = `k ×${maxDopFwd.toFixed(2)}`
        dopFwdRef.current.style.color = `hsl(${220-Math.min(maxDopFwd*40,220)},100%,75%)`
      }
      if (dopBwdRef.current) {
        dopBwdRef.current.textContent = `k ×${minDopBwd.toFixed(2)}`
        dopBwdRef.current.style.color = `hsl(${Math.min(minDopBwd*30,30)},100%,55%)`
      }
    }

    // ── Lentille gravitationnelle (étoiles) ───────────────────────────
    if (starGeo.current) {
      const BH_dir = _t0.copy(BH_POS).sub(cam.position)
      const D_cam  = BH_dir.length()
      BH_dir.divideScalar(D_cam)
      const buf    = starBuf.current
      const rest   = starRestPos

      for (let i = 0; i < N_STARS; i++) {
        const sx = rest[i*3], sy = rest[i*3+1], sz = rest[i*3+2]
        // Direction vers l'étoile
        const dx = sx - cam.position.x, dy = sy - cam.position.y, dz = sz - cam.position.z
        const sLen = Math.sqrt(dx*dx + dy*dy + dz*dz)
        const sdx = dx/sLen, sdy = dy/sLen, sdz = dz/sLen
        // Angle entre direction-étoile et direction-BH
        const cosPsi = sdx*BH_dir.x + sdy*BH_dir.y + sdz*BH_dir.z
        const sinPsi = Math.sqrt(Math.max(0, 1 - cosPsi*cosPsi))
        const b_phys = D_cam * sinPsi                     // paramètre d'impact physique
        if (b_phys < SHADOW_R * 1.1) {
          // Étoile dans l'ombre → invisible
          buf[i*3] = cam.position.x + BH_dir.x * 9999
          buf[i*3+1] = cam.position.y + BH_dir.y * 9999
          buf[i*3+2] = cam.position.z + BH_dir.z * 9999
          continue
        }
        if (b_phys < D_cam * 0.3 && D_cam > Rs * 2) {    // zone de lentille
          const defl  = Math.min(2 * Rs / b_phys, 0.8)   // angle de déflexion (rad)
          // Composante perpendiculaire (de l'étoile vers le BH sur la sphère céleste)
          const px = BH_dir.x - sdx * cosPsi
          const py = BH_dir.y - sdy * cosPsi
          const pz = BH_dir.z - sdz * cosPsi
          const pLen = Math.sqrt(px*px + py*py + pz*pz) + 1e-9
          // Nouvelle direction apparente
          const ndx = sdx + (px/pLen) * defl
          const ndy = sdy + (py/pLen) * defl
          const ndz = sdz + (pz/pLen) * defl
          buf[i*3]   = cam.position.x + ndx * sLen
          buf[i*3+1] = cam.position.y + ndy * sLen
          buf[i*3+2] = cam.position.z + ndz * sLen
        } else {
          buf[i*3] = sx; buf[i*3+1] = sy; buf[i*3+2] = sz
        }
      }
      starGeo.current.attributes.position.needsUpdate = true
    }

    // ── Anneau d'Einstein ─────────────────────────────────────────────
    if (einsteinRef.current) {
      const D_cam = cam.position.distanceTo(BH_POS)
      const ringR = Math.sqrt(2 * Rs * D_cam)              // rayon physique au plan du BH
      einsteinRef.current.scale.set(ringR, ringR, ringR)
      // Orienter le tore pour faire face à la caméra
      const dir = _t0.copy(cam.position).sub(BH_POS).normalize()
      einsteinRef.current.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), dir
      )
      // Luminosité inversement proportionnelle à la distance (effet Einstein)
      const mat = einsteinRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = Math.min(1.0, (800 / D_cam) ** 2 * 0.8)
    }

    // ── HUD ───────────────────────────────────────────────────────────
    const r = cam.position.length()
    const kG = r > Rs ? Math.sqrt(1 - Rs / r) : 0
    const distH = r - Rs

    if (betaRef.current) betaRef.current.textContent = `β ${b.toFixed(3)}  γ ${g.toFixed(2)}`
    if (sprintRef.current) {
      sprintRef.current.textContent = sprint ? `sprint ×${SPRINT_MUL}  (${speed.toFixed(0)} u/s)` : `${speed.toFixed(0)} u/s`
      sprintRef.current.style.color = sprint ? '#ffee44' : '#888888'
    }
    if (dilRef.current) {
      const pct = (kG * 100).toFixed(1)
      dilRef.current.textContent = `${pct}% (τ/t)`
      dilRef.current.style.color = kG < 0.7 ? '#ff4444' : kG < 0.9 ? '#ffaa44' : '#88ff88'
    }
    if (distRef.current) {
      distRef.current.textContent = `${distH.toFixed(0)} u`
      distRef.current.style.color = distH < Rs * 2 ? '#ff3333' : distH < Rs * 5 ? '#ffaa22' : '#88cc88'
    }
    if (warnRef.current) {
      const show = distH < Rs * 3
      warnRef.current.style.opacity = show ? '1' : '0'
      warnRef.current.style.color = distH < Rs * 1.5 ? '#ff2222' : '#ffaa22'
    }
  })

  return null
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function HUD({ cSim, setCSim, onBack, locked, containerRef, betaRef, dilRef, distRef,
               dopFwdRef, dopBwdRef, sprintRef, warnRef, resetRef }: {
  cSim: number; setCSim: (v: number) => void
  onBack: () => void; locked: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  betaRef:   React.RefObject<HTMLSpanElement | null>
  dilRef:    React.RefObject<HTMLSpanElement | null>
  distRef:   React.RefObject<HTMLSpanElement | null>
  dopFwdRef: React.RefObject<HTMLSpanElement | null>
  dopBwdRef: React.RefObject<HTMLSpanElement | null>
  sprintRef: React.RefObject<HTMLSpanElement | null>
  warnRef:   React.RefObject<HTMLDivElement | null>
  resetRef:  React.MutableRefObject<(() => void) | null>
}) {
  const R = (label: string, ref: React.RefObject<HTMLSpanElement | null>, def: string, col = '#aaaaaa') => (
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:13 }}>
      <span style={{ color:'#445566' }}>{label}</span>
      <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ color: col, fontWeight: 600 }}>{def}</span>
    </div>
  )

  return (
    <div style={{ fontFamily:"'SF Mono','Fira Code',monospace", position:'fixed', inset:0, pointerEvents:'none', zIndex:10 }}>
      <ScenePanel title="V8 — Black Hole" onBack={onBack} containerRef={containerRef}
        theme="blue" filename="v8-black-hole.webm" width={355}>

        {/* c_sim */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:14 }}>
            <span style={{ color:'#6688aa' }}>c<sub>sim</sub></span>
            <span style={{ color:'#88ccff', fontWeight:700, fontSize:16 }}>{cSim.toFixed(0)} u/s</span>
          </div>
          <input type="range" min={8} max={80} step={1} value={cSim}
            onChange={e => setCSim(parseFloat(e.target.value))}
            style={{ width:'100%', accentColor:'#4488cc', cursor:'pointer' }} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#223344', marginTop:3 }}>
            <span style={{ color:'#4488cc' }}>c=8 → ultra-relat.</span>
            <span>c=80 → classique</span>
          </div>
        </div>

        {/* Physique live */}
        <div style={{ background:'rgba(0,0,0,0.6)', borderRadius:8, padding:'10px 13px', marginBottom:12 }}>
          <div style={{ fontSize:11, color:'#223344', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:7 }}>Physique temps réel</div>
          {R('observateur β / γ', betaRef, 'β 0.000  γ 1.00', '#88ccff')}
          {R('vitesse', sprintRef, `${BASE_SPEED} u/s`, '#888888')}
          {R('dist. horizon', distRef, '—', '#88cc88')}
          {R('dilatation τ/t', dilRef, '100%', '#88ff88')}
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:13, borderTop:'1px solid #112233', paddingTop:7, marginTop:4 }}>
            <span style={{ color:'#445566' }}>Doppler fwd (bleu)</span>
            <span ref={dopFwdRef as React.RefObject<HTMLSpanElement>} style={{ color:'#88ccff', fontWeight:600 }}>—</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
            <span style={{ color:'#445566' }}>Doppler bwd (rouge)</span>
            <span ref={dopBwdRef as React.RefObject<HTMLSpanElement>} style={{ color:'#ff6644', fontWeight:600 }}>—</span>
          </div>
        </div>

        {/* Physique BH */}
        <div style={{ background:'rgba(0,50,100,0.18)', borderRadius:8, padding:'10px 13px', marginBottom:12, fontSize:12, lineHeight:1.9 }}>
          <div style={{ fontSize:11, color:'#223344', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:5 }}>Structure</div>
          <div><span style={{ color:'#222' }}>R<sub>s</sub> (horizon)</span> <span style={{ color:'#66aadd', float:'right' }}>{Rs} u</span></div>
          <div><span style={{ color:'#222' }}>Sphère de photons</span> <span style={{ color:'#ffaa44', float:'right' }}>1.5 Rs = {Rs*1.5} u</span></div>
          <div><span style={{ color:'#222' }}>ISCO</span> <span style={{ color:'#88ddff', float:'right' }}>3 Rs = {Rs*3} u</span></div>
          <div><span style={{ color:'#222' }}>v<sub>orb</sub>(3Rs)</span> <span style={{ color:'#aaccee', float:'right' }}>0.41 c</span></div>
          <div><span style={{ color:'#222' }}>Étoiles lentillées</span> <span style={{ color:'#aaaaaa', float:'right' }}>{N_STARS}</span></div>
          <div><span style={{ color:'#222' }}>Particules disque</span> <span style={{ color:'#aaaaaa', float:'right' }}>{N_DISK}</span></div>
        </div>

        {/* Légende */}
        <div style={{ background:'rgba(0,0,0,0.35)', borderRadius:8, padding:'10px 13px', marginBottom:12, fontSize:12, lineHeight:2.0 }}>
          <div style={{ fontSize:11, color:'#223344', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:5 }}>Effets visibles</div>
          <div><span style={{ color:'#aaddff' }}>■</span> <span style={{ color:'#334455' }}>Doppler orbital — côté approchant bleu</span></div>
          <div><span style={{ color:'#ff4422' }}>■</span> <span style={{ color:'#334455' }}>Redshift gravitationnel + fuyant rouge</span></div>
          <div><span style={{ color:'#ffffff' }}>○</span> <span style={{ color:'#334455' }}>Anneau d'Einstein — θ<sub>E</sub>=√(2Rs/D)</span></div>
          <div><span style={{ color:'#aaaaff' }}>|</span> <span style={{ color:'#334455' }}>Jets polaires relativistes</span></div>
          <div style={{ color:'#223344', marginTop:4, fontSize:11 }}>Étoiles déformées vers le centre (lentille)</div>
        </div>

        {/* Contrôles */}
        <div style={{ background:'rgba(0,0,0,0.3)', borderRadius:8, padding:'10px 13px', marginBottom:10, fontSize:12, color:'#334455', lineHeight:1.95 }}>
          <div style={{ fontSize:11, color:'#445566', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:5 }}>Contrôles</div>
          <div><span style={{ color:'#6699bb' }}>WASD</span> voler · <span style={{ color:'#ffee44' }}>Shift</span> sprint ×{SPRINT_MUL}</div>
          <div><span style={{ color:'#66bb66' }}>Espace</span> monter · <span style={{ color:'#66bb66' }}>Ctrl</span> descendre</div>
        </div>

        <button onClick={() => resetRef.current?.()}
          style={{ width:'100%', padding:'9px 0', cursor:'pointer', background:'rgba(20,60,100,0.25)', border:'1px solid rgba(80,150,220,0.4)', borderRadius:8, color:'#88bbdd', fontSize:13, fontFamily:'inherit', letterSpacing:'0.08em', transition:'all 0.15s' }}
          onMouseEnter={e => { const b=e.target as HTMLButtonElement; b.style.background='rgba(40,100,160,0.4)'; b.style.color='#cceeFF' }}
          onMouseLeave={e => { const b=e.target as HTMLButtonElement; b.style.background='rgba(20,60,100,0.25)'; b.style.color='#88bbdd' }}>
          ↺ Réinitialiser
        </button>
      </ScenePanel>

      {/* Avertissement horizon */}
      <div ref={warnRef as React.RefObject<HTMLDivElement>} style={{
        position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -160px)',
        fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', opacity:0,
        transition:'opacity 0.4s', pointerEvents:'none', textAlign:'center',
        textShadow:'0 0 20px currentColor',
      }}>
        ⚠ HORIZON PROCHE — POINT DE NON-RETOUR
      </div>

      {/* Viseur */}
      {locked && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none' }}>
          <div style={{ width:1, height:16, background:'rgba(100,180,255,0.5)', margin:'0 auto' }} />
          <div style={{ width:16, height:1, background:'rgba(100,180,255,0.5)', marginTop:-8.5 }} />
        </div>
      )}

      {/* Splash */}
      {!locked && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ background:'rgba(0,4,10,0.96)', border:'1px solid rgba(80,150,255,0.45)', borderRadius:18, padding:'34px 66px', textAlign:'center', backdropFilter:'blur(22px)' }}>
            <div style={{ color:'#4488cc', fontSize:11, letterSpacing:'0.3em', textTransform:'uppercase', marginBottom:14 }}>V8 — Interstellar</div>
            <div style={{ color:'#cce8ff', fontSize:26, fontWeight:700, marginBottom:12 }}>Black Hole</div>
            <div style={{ color:'#223344', fontSize:14, lineHeight:1.9 }}>
              Doppler orbital · Redshift gravitationnel<br />
              Lentille d'Einstein · Jets relativistes<br /><br />
              <span style={{ color:'#336688', fontSize:12 }}>WASD · Shift sprint · Espace/Ctrl · Baisser c pour amplifier</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function V8Scene({ onBack }: { onBack: () => void }) {
  const [cSim, setCSim]     = useState(30)
  const [locked, setLocked] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const einsteinRef  = useRef<THREE.Mesh>(null)
  const betaRef      = useRef<HTMLSpanElement>(null)
  const dilRef       = useRef<HTMLSpanElement>(null)
  const distRef      = useRef<HTMLSpanElement>(null)
  const dopFwdRef    = useRef<HTMLSpanElement>(null)
  const dopBwdRef    = useRef<HTMLSpanElement>(null)
  const sprintRef    = useRef<HTMLSpanElement>(null)
  const warnRef      = useRef<HTMLDivElement>(null)
  const resetRef     = useRef<(() => void) | null>(null)
  const onLock       = useCallback(() => setLocked(true),  [])
  const onUnlock     = useCallback(() => setLocked(false), [])

  return (
    <div ref={containerRef} style={{ width:'100vw', height:'100vh', background:'#000008', position:'relative' }}>
      <Canvas camera={{ position: START.toArray(), fov: 65, near: 0.5, far: 8000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.NoToneMapping }} shadows={false}>

        <color attach="background" args={['#000008']} />
        <fog attach="fog" args={['#00000a', 1200, 5000]} />

        {/* Lumières : très sombres — le disque est la principale source */}
        <ambientLight intensity={0.04} color="#112233" />
        <pointLight position={[0, 0, 0]} intensity={12} color="#226688" distance={600} decay={1.2} />
        {/* Lumières jets */}
        <pointLight position={[0,  450, 0]} intensity={6} color="#2244aa" distance={400} decay={1.4} />
        <pointLight position={[0, -450, 0]} intensity={6} color="#2244aa" distance={400} decay={1.4} />

        <BlackHoleModel einsteinRef={einsteinRef as React.RefObject<THREE.Mesh | null>} />
        <Simulation cSim={cSim} locked={locked}
          einsteinRef={einsteinRef as React.RefObject<THREE.Mesh | null>}
          betaRef={betaRef} dilRef={dilRef} distRef={distRef}
          dopFwdRef={dopFwdRef} dopBwdRef={dopBwdRef}
          sprintRef={sprintRef} warnRef={warnRef} resetRef={resetRef} />
        <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
      </Canvas>
      <HUD cSim={cSim} setCSim={setCSim} onBack={onBack} locked={locked}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
        betaRef={betaRef} dilRef={dilRef} distRef={distRef}
        dopFwdRef={dopFwdRef} dopBwdRef={dopBwdRef}
        sprintRef={sprintRef} warnRef={warnRef} resetRef={resetRef} />
    </div>
  )
}
