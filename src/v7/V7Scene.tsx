/**
 * V7 — Retarded World  (rev 3)
 *
 * Tout est soumis à Lorentz + retard lumineux :
 *   avancer → objets devant contractés (plus proches) + bleu
 *   reculer → objets devant étirés (plus loin) + rouge
 *
 * Lorentz asymétrique :
 *   rPar > 0 (dans le sens du mouvement)  → rPar / γ  (contraction)
 *   rPar < 0 (contre le mouvement)        → rPar * γ  (expansion)
 *
 * Lune à 3 phases (très loin → effet retardé maximal) :
 *   t < 60  Accrétion  : petites pierres en orbite spiralante
 *   t < 90  Fusion     : sphère incandescente pulsante
 *   t ≥ 90  Figée      : sphère gris-argent
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls, Environment } from '@react-three/drei'
import { EffectComposer, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { ScenePanel } from '../components/ScenePanel'

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE_SPEED    = 13
const SPRINT_MUL    = 3.2
const START         = new THREE.Vector3(0, 6, 130)
const VOL_POS       = new THREE.Vector3(0, 0, -180)
const CRYST_CENTER  = new THREE.Vector3(200, 0, -60)
const TREE_CENTER   = new THREE.Vector3(-195, 0, -50)
const MOON_POS      = new THREE.Vector3(140, 90, -420)   // lointaine — effet retardé maximal

const VOL_CYCLE     = 22
const LAVA_DUR      = 10
const LAVA_PERIOD   = 24
const N_LAVA        = 12
const CRYST_GROW    = 16
const N_CRYST       = 20
const TREE_GROW     = 80
const N_TREES       = 18
const N_ROCKS       = 14

const T_ACCRETION   = 60   // fin de l'accrétion
const T_FUSION      = 90   // fin de la fusion → figée
const N_MOON_PARTS  = 10

// ─── Physique ─────────────────────────────────────────────────────────────────
const _rPar = new THREE.Vector3()
const _ctr  = new THREE.Vector3()
const _rel  = new THREE.Vector3()
const _col  = new THREE.Color()
const _col2 = new THREE.Color()
const _vHat = new THREE.Vector3()
const _lp   = new THREE.Vector3()
const _wp   = new THREE.Vector3()

/**
 * Lorentz asymétrique :
 *   Objets dans le sens du mouvement (rPar > 0) → contractés (rPar / γ)
 *   Objets contre le mouvement        (rPar < 0) → étirés   (rPar * γ)
 * → avancer = zoom avant, reculer = zoom arrière
 */
function lorentzOffset(rel: THREE.Vector3, vHat: THREE.Vector3, gamma: number, out: THREE.Vector3) {
  const rPar = rel.dot(vHat)
  _rPar.copy(vHat).multiplyScalar(rPar)
  const rPerp = out.copy(rel).sub(_rPar)
  const newRPar = rPar >= 0 ? rPar / gamma : rPar * gamma
  out.addScaledVector(vHat, newRPar)
}

function doppler(cosT: number, b: number, g: number) {
  const d = 1 - b * cosT; return d < 1e-6 ? 50 : 1 / (g * d)
}

const _BLUE = new THREE.Color('#88ccff')
const _RED  = new THREE.Color('#ff2200')
function dopplerTint(k: number, base: THREE.Color, out: THREE.Color) {
  if (k >= 1) out.copy(base).lerp(_BLUE, Math.min((k - 1) / 2.5, 1) ** 2 * 0.80)
  else        out.copy(base).lerp(_RED,  Math.min((1 - k) / 0.7, 1) * 0.78)
}

// ─── État du volcan ───────────────────────────────────────────────────────────
function getVolState(t: number) {
  const p = ((t % VOL_CYCLE) + VOL_CYCLE) % VOL_CYCLE / VOL_CYCLE
  if (p < 0.40) {
    const u = p / 0.40, pulse = 0.5 + 0.5 * Math.sin(t * 1.2)
    return { scale: 0.85 + u * 0.22 + pulse * 0.04, heat: 0.05 + u * 0.12 + pulse * 0.04 }
  }
  if (p < 0.62) {
    const u = (p - 0.40) / 0.22
    return { scale: 1.07 + u * u * 0.45, heat: 0.17 + u * 0.83 }
  }
  if (p < 0.70) {
    const u = (p - 0.62) / 0.08
    return { scale: 1.52 * (1 - Math.sin(u * Math.PI * 0.5) * 0.50), heat: 1.0 }
  }
  const u = (p - 0.70) / 0.30
  return { scale: 0.76 + (1 - (1 - u) ** 2) * 0.12, heat: 1 - u * 0.92 }
}

const _COLD = new THREE.Color('#8b2200')
const _MID  = new THREE.Color('#ff5500')
const _HOT  = new THREE.Color('#ffee88')
function heatCol(heat: number, out: THREE.Color) {
  if (heat < 0.5) out.copy(_COLD).lerp(_MID, heat * 2)
  else            out.copy(_MID).lerp(_HOT, (heat - 0.5) * 2)
}

// ─── Lave ─────────────────────────────────────────────────────────────────────
function makeFlowPath(angle: number): THREE.Vector3[] {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [
    new THREE.Vector3(c * 3.5, 19, s * 3.5),
    new THREE.Vector3(c * 9, 13, s * 9),
    new THREE.Vector3(c * 15, 6, s * 15),
    new THREE.Vector3(c * 23, 1.5, s * 23),
    new THREE.Vector3(c * 32, 0.1, s * 32),
  ]
}
const LAVA_PATHS = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5].map(makeFlowPath)

function samplePath(path: THREE.Vector3[], frac: number, out: THREE.Vector3) {
  const f = Math.max(0, Math.min(1, frac))
  const n = path.length - 1
  const seg = Math.min(Math.floor(f * n), n - 1)
  out.lerpVectors(path[seg], path[seg + 1], f * n - seg)
}

// ─── Phase lune ───────────────────────────────────────────────────────────────
function getMoonPhase(tEmit: number) {
  if (tEmit < T_ACCRETION) return { phase: 'accretion' as const, progress: tEmit / T_ACCRETION }
  if (tEmit < T_FUSION)    return { phase: 'fusion'    as const, progress: (tEmit - T_ACCRETION) / (T_FUSION - T_ACCRETION) }
  return { phase: 'frozen' as const, progress: 1 }
}

// ─── PRNG ─────────────────────────────────────────────────────────────────────
let _seed = 0
function sr() { _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff; return _seed / 0x7fffffff }

// ─── Objets ───────────────────────────────────────────────────────────────────
type LavaBlob = { pathIdx: number; phaseOffset: number; mesh: THREE.Mesh | null }

function makeCrystals() {
  const list: { restPos: THREE.Vector3; birthT: number; maxH: number; mesh: THREE.Mesh | null }[] = []
  const N_SIDE = N_CRYST / 2
  for (let i = 0; i < N_SIDE; i++) {
    const zOff = (i - (N_SIDE - 1) / 2) * 20
    const t01  = i / (N_SIDE - 1)
    const maxH = 14 + 34 * Math.pow(Math.sin(Math.PI * t01), 1.4)
    for (const side of [-1, 1]) {
      list.push({
        restPos: new THREE.Vector3(CRYST_CENTER.x + side * 20, 0, CRYST_CENTER.z + zOff),
        birthT: i * 5,
        maxH,
        mesh: null,
      })
    }
  }
  return list
}

function makeTrees() {
  _seed = 777
  return Array.from({ length: N_TREES }, () => {
    const a = sr() * Math.PI * 2, d = 12 + sr() * 60
    return {
      restPos: new THREE.Vector3(TREE_CENTER.x + Math.cos(a) * d, 0, TREE_CENTER.z + Math.sin(a) * d),
      birthT: sr() * 30, maxR: 3 + sr() * 5,
      trunk: null as THREE.Mesh | null, crown: null as THREE.Mesh | null,
    }
  })
}

function makeRocks() {
  _seed = 333
  return Array.from({ length: N_ROCKS }, () => {
    const a = sr() * Math.PI * 2, d = 30 + sr() * 140
    return { restPos: new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), mesh: null as THREE.Mesh | null }
  })
}

function makeLavas(): LavaBlob[] {
  return Array.from({ length: N_LAVA }, (_, i) => ({
    pathIdx: i % 4,
    phaseOffset: Math.floor(i / 4) * (LAVA_PERIOD / 3),
    mesh: null,
  }))
}

// ─── Terrain ──────────────────────────────────────────────────────────────────
function TerrainEnv() {
  const volPts = useMemo(() => [
    new THREE.Vector2(0.3, 0), new THREE.Vector2(30, 0),  new THREE.Vector2(24, 5),
    new THREE.Vector2(18, 10), new THREE.Vector2(11, 15), new THREE.Vector2(6.5, 18.5),
    new THREE.Vector2(5.5, 19.5), new THREE.Vector2(4.2, 19), new THREE.Vector2(3.5, 17.5),
    new THREE.Vector2(0.3, 17.5),
  ], [])
  const volGeo = useMemo(() => { const g = new THREE.LatheGeometry(volPts, 14); g.computeVertexNormals(); return g }, [volPts])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[1800, 1800]} />
        <meshStandardMaterial color="#4a2c18" roughness={0.93} />
      </mesh>
      <gridHelper args={[700, 70, '#7a4a28', '#5a3418']} position={[0, 0.01, 0]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CRYST_CENTER.x, 0.03, CRYST_CENTER.z]}>
        <circleGeometry args={[90, 40]} />
        <meshStandardMaterial color="#12181f" roughness={0.94} />
      </mesh>
      <gridHelper args={[180, 18, '#1e304a', '#182538']} position={[CRYST_CENTER.x, 0.04, CRYST_CENTER.z]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TREE_CENTER.x, 0.03, TREE_CENTER.z]}>
        <circleGeometry args={[80, 40]} />
        <meshStandardMaterial color="#0e1a09" roughness={0.96} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[VOL_POS.x, 0.03, VOL_POS.z]}>
        <circleGeometry args={[70, 32]} />
        <meshStandardMaterial color="#1a0702" roughness={0.98} />
      </mesh>

      {/* Volcan — position et scale animées impérativement dans Simulation */}
      <group position={VOL_POS.toArray()} name="vol-group">
        <mesh geometry={volGeo} receiveShadow castShadow name="volcano-body">
          <meshStandardMaterial color="#8a3a12" roughness={0.80} metalness={0.08} flatShading />
        </mesh>
        <mesh position={[0, 19, 0]} rotation={[-Math.PI / 2, 0, 0]} name="lava-pool">
          <circleGeometry args={[3.2, 14]} />
          <meshStandardMaterial color="#ff4400" emissive="#ff3300" emissiveIntensity={8} roughness={0.25} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Sky() {
  // Couche 1 — étoiles lointaines froides
  const geoFar = useMemo(() => {
    const n = 3000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3)
    const palette = [
      [0.85, 0.90, 1.00], [1.00, 0.92, 0.80], [0.80, 0.85, 1.00],
      [1.00, 0.70, 0.55], [0.70, 0.80, 1.00],
    ]
    for (let i = 0; i < n; i++) {
      const r = 900 + Math.random() * 400
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1)
      pos[i*3]   = r * Math.sin(ph) * Math.cos(th)
      pos[i*3+1] = Math.abs(r * Math.cos(ph)) + 20
      pos[i*3+2] = r * Math.sin(ph) * Math.sin(th)
      const c = palette[Math.floor(Math.random() * palette.length)]
      col[i*3] = c[0]; col[i*3+1] = c[1]; col[i*3+2] = c[2]
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color',    new THREE.BufferAttribute(col, 3))
    return g
  }, [])

  // Couche 2 — quelques étoiles brillantes (bloom les fera luire)
  const geoBright = useMemo(() => {
    const n = 80, pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 850 + Math.random() * 200
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1)
      pos[i*3]   = r * Math.sin(ph) * Math.cos(th)
      pos[i*3+1] = Math.abs(r * Math.cos(ph)) + 40
      pos[i*3+2] = r * Math.sin(ph) * Math.sin(th)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g
  }, [])

  return (
    <group>
      <points geometry={geoFar}>
        <pointsMaterial vertexColors size={0.9} sizeAttenuation transparent opacity={0.75} />
      </points>
      <points geometry={geoBright}>
        <pointsMaterial color="#ffffff" size={2.2} sizeAttenuation transparent opacity={0.95} />
      </points>
    </group>
  )
}

// ─── Simulation ───────────────────────────────────────────────────────────────
interface SimProps {
  cSim: number; locked: boolean
  betaRef:    React.RefObject<HTMLSpanElement | null>
  phaseRef:   React.RefObject<HTMLSpanElement | null>
  zoneRef:    React.RefObject<HTMLSpanElement | null>
  sprintRef:  React.RefObject<HTMLSpanElement | null>
  moonRef:    React.RefObject<HTMLSpanElement | null>
  resetRef:   React.MutableRefObject<(() => void) | null>
}

function Simulation({ cSim, locked, betaRef, phaseRef, zoneRef, sprintRef, moonRef, resetRef }: SimProps) {
  const { scene, camera } = useThree()
  const tRef      = useRef(0)
  const cRef      = useRef(cSim); cRef.current = cSim
  const locRef    = useRef(locked); locRef.current = locked
  const keys      = useRef<Set<string>>(new Set())
  const velRef    = useRef(new THREE.Vector3(0, 0, -1))
  const betaLive  = useRef(0)

  const lavas    = useRef(makeLavas())
  const crystals = useRef(makeCrystals())
  const trees    = useRef(makeTrees())
  const rocks    = useRef(makeRocks())

  // Volcano
  const volGroupRef    = useRef<THREE.Group | null>(null)
  const lavaPoolRef    = useRef<THREE.Mesh | null>(null)
  const craterLightRef = useRef<THREE.PointLight | null>(null)

  // Moon
  const moonGroup  = useRef<THREE.Group | null>(null)
  const moonSphere = useRef<THREE.Mesh | null>(null)
  const moonParts  = useRef<THREE.Mesh[]>([])
  const moonLight  = useRef<THREE.PointLight | null>(null)

  useEffect(() => {
    resetRef.current = () => {
      camera.position.copy(START)
      camera.rotation.set(0, 0, 0)
      tRef.current     = 0
      betaLive.current = 0
      velRef.current.set(0, 0, -1)
    }
    camera.position.copy(START)

    // ── Lave ──────────────────────────────────────────────────────────────
    for (const l of lavas.current) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 10, 8),
        new THREE.MeshStandardMaterial({
          color: '#ff4400', emissive: '#ff3300', emissiveIntensity: 6,
          roughness: 0.55, metalness: 0.0, flatShading: false,
          toneMapped: false,  // les emissives sortent du range HDR → bloom
        }),
      )
      m.visible = false; scene.add(m); l.mesh = m
    }

    // ── Cristaux ──────────────────────────────────────────────────────────
    for (const cr of crystals.current) {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 1, 6),
        new THREE.MeshStandardMaterial({
          color: '#3366ff', emissive: '#1133cc', emissiveIntensity: 3.5,
          roughness: 0.04, metalness: 0.92, flatShading: true,
          toneMapped: false,
        }),
      )
      m.visible = false; scene.add(m); cr.mesh = m
    }

    // ── Arbres ────────────────────────────────────────────────────────────
    for (const tr of trees.current) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.35, 1, 7),
        new THREE.MeshStandardMaterial({ color: '#3d1f0a', roughness: 0.92 }),
      )
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(1, 1, 8),
        new THREE.MeshStandardMaterial({ color: '#204a0e', emissive: '#0d2206', emissiveIntensity: 0.35, roughness: 0.82, flatShading: true }),
      )
      trunk.visible = false; crown.visible = false
      scene.add(trunk); scene.add(crown)
      tr.trunk = trunk; tr.crown = crown
    }

    // ── Rochers (positions initiales — seront overridées chaque frame) ───
    _seed = 333
    for (const rk of rocks.current) {
      sr(); sr()  // skip a, d
      const s = 1.5 + sr() * 3
      const m = new THREE.Mesh(
        new THREE.DodecahedronGeometry(s, 0),
        new THREE.MeshStandardMaterial({ color: '#6a3820', roughness: 0.94, flatShading: true }),
      )
      m.position.copy(rk.restPos); m.position.y = s * 0.4
      m.rotation.set(sr() * Math.PI, sr() * Math.PI, sr() * Math.PI)
      scene.add(m); rk.mesh = m
    }

    // ── Lune ──────────────────────────────────────────────────────────────
    const mg = new THREE.Group()
    mg.position.copy(MOON_POS)
    scene.add(mg)
    moonGroup.current = mg

    const ms = new THREE.Mesh(
      new THREE.SphereGeometry(12, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.85, metalness: 0.1 }),
    )
    mg.add(ms); moonSphere.current = ms

    const parts: THREE.Mesh[] = []
    for (let i = 0; i < N_MOON_PARTS; i++) {
      const p = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.5 + Math.random() * 2, 0),
        new THREE.MeshStandardMaterial({ color: '#5a4428', roughness: 0.9, flatShading: true }),
      )
      p.visible = false; mg.add(p); parts.push(p)
    }
    moonParts.current = parts

    const ml = new THREE.PointLight('#ff8844', 0, 0, 1.2)
    ml.position.copy(MOON_POS)
    scene.add(ml); moonLight.current = ml

    // ── Lumière cratère ───────────────────────────────────────────────────
    const cl = new THREE.PointLight('#ff5500', 8, 80, 1.2)
    cl.position.set(VOL_POS.x, VOL_POS.y + 20, VOL_POS.z)
    scene.add(cl); craterLightRef.current = cl

    // Trouver meshes volcan
    scene.traverse(obj => {
      if (obj.name === 'vol-group')    volGroupRef.current   = obj as THREE.Group
      if (obj.name === 'lava-pool')    lavaPoolRef.current   = obj as THREE.Mesh
    })

    return () => {
      lavas.current.forEach(l => l.mesh && scene.remove(l.mesh))
      crystals.current.forEach(cr => cr.mesh && scene.remove(cr.mesh))
      trees.current.forEach(tr => { tr.trunk && scene.remove(tr.trunk); tr.crown && scene.remove(tr.crown) })
      rocks.current.forEach(rk => rk.mesh && scene.remove(rk.mesh))
      scene.remove(mg); scene.remove(ml); scene.remove(cl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useFrame((_s, delta) => {
    const dt  = Math.min(delta, 0.05)
    tRef.current += dt
    const t   = tRef.current
    const c   = cRef.current
    const cam = camera

    // ── Mouvement ─────────────────────────────────────────────────────────
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
      if (cam.position.y < 1.5) cam.position.y = 1.5
      beta = Math.min(speed / c, 0.999)
    }
    betaLive.current += (beta - betaLive.current) * Math.min(dt * 8, 1)
    const b = betaLive.current
    const g = b > 0.001 ? 1 / Math.sqrt(1 - b * b) : 1
    _vHat.copy(velRef.current)

    // ── Helper : Lorentz + Doppler → position + couleur ───────────────────
    const applyRelativistic = (
      restPos: THREE.Vector3,
      outPos: THREE.Vector3,
      mat: THREE.MeshStandardMaterial,
      baseColor: THREE.Color,
    ) => {
      _rel.subVectors(restPos, cam.position)
      if (b > 0.005 && _vHat.lengthSq() > 0.5) {
        lorentzOffset(_rel, _vHat, g, _ctr)
        outPos.copy(cam.position).add(_ctr)
        const dist = _rel.length()
        const cosT = dist > 0.1 ? _rel.dot(_vHat) / dist : 0
        dopplerTint(doppler(cosT, b, g), baseColor, _col)
        mat.color.copy(_col)
        mat.emissive.copy(_col).multiplyScalar(0.25)
      } else {
        outPos.copy(restPos)
        mat.color.copy(baseColor)
      }
    }

    // ── Volcan ────────────────────────────────────────────────────────────
    const distVol  = cam.position.distanceTo(VOL_POS)
    const tEmitVol = Math.max(0, t - distVol / c)
    const vs       = getVolState(tEmitVol)

    if (volGroupRef.current) {
      // Position Lorentz
      _rel.subVectors(VOL_POS, cam.position)
      if (b > 0.005 && _vHat.lengthSq() > 0.5) {
        lorentzOffset(_rel, _vHat, g, _ctr)
        volGroupRef.current.position.copy(cam.position).add(_ctr)
      } else {
        volGroupRef.current.position.copy(VOL_POS)
      }
      volGroupRef.current.scale.setScalar(vs.scale)
    }
    if (lavaPoolRef.current) {
      heatCol(vs.heat, _col)
      const m = lavaPoolRef.current.material as THREE.MeshStandardMaterial
      m.color.copy(_col); m.emissive.copy(_col); m.emissiveIntensity = 2 + vs.heat * 6
    }
    if (craterLightRef.current) {
      heatCol(vs.heat, _col)
      craterLightRef.current.position.copy(volGroupRef.current?.position ?? VOL_POS)
      craterLightRef.current.position.y += 20 * vs.scale
      craterLightRef.current.color.copy(_col)
      craterLightRef.current.intensity = 8 + vs.heat * 50
      craterLightRef.current.distance  = 45 + vs.heat * 100
    }

    // ── Rochers (tous soumis à Lorentz) ───────────────────────────────────
    const ROCK_COL = new THREE.Color('#6a3820')
    for (const rk of rocks.current) {
      if (!rk.mesh) continue
      const mat = rk.mesh.material as THREE.MeshStandardMaterial
      const savedY = rk.mesh.position.y
      applyRelativistic(rk.restPos, rk.mesh.position, mat, ROCK_COL)
      rk.mesh.position.y = savedY   // garder la hauteur du sol
    }

    // ── Lave ──────────────────────────────────────────────────────────────
    const LAVA_BASE = new THREE.Color('#ff5500')
    for (const l of lavas.current) {
      if (!l.mesh) continue
      const tEmit  = Math.max(0, t - distVol / c)
      const cycleT = ((tEmit - l.phaseOffset) % LAVA_PERIOD + LAVA_PERIOD) % LAVA_PERIOD
      if (cycleT >= LAVA_DUR) { l.mesh.visible = false; continue }
      const frac = cycleT / LAVA_DUR
      samplePath(LAVA_PATHS[l.pathIdx], frac, _lp)
      _wp.copy(_lp).add(volGroupRef.current?.position ?? VOL_POS)  // suit le volcan contracté
      const mat = l.mesh.material as THREE.MeshStandardMaterial
      applyRelativistic(_wp, l.mesh.position, mat, LAVA_BASE)
      l.mesh.visible = true
      heatCol(Math.max(0, 1 - frac * 0.85), _col2)
      mat.emissive.copy(_col2); mat.emissiveIntensity = 2.5 - frac * 2.0
    }

    // ── Cristaux ──────────────────────────────────────────────────────────
    const CRYST_BASE = new THREE.Color('#2255dd')
    for (const cr of crystals.current) {
      if (!cr.mesh) continue
      const dist  = cam.position.distanceTo(cr.restPos)
      const tEmit = Math.max(0, t - dist / c)
      const age   = tEmit - cr.birthT
      if (age < 0) { cr.mesh.visible = false; continue }
      const h = Math.min(cr.maxH, age / CRYST_GROW * cr.maxH)
      if (h < 0.3) { cr.mesh.visible = false; continue }
      const mat = cr.mesh.material as THREE.MeshStandardMaterial
      applyRelativistic(cr.restPos, cr.mesh.position, mat, CRYST_BASE)
      cr.mesh.position.y += h / 2
      const w = h * 0.12
      cr.mesh.scale.set(w / 0.08, h, w / 0.08)
      cr.mesh.visible = true
      mat.emissiveIntensity = 0.6 + Math.min(age / CRYST_GROW, 1) * 2.5
    }

    // ── Arbres ────────────────────────────────────────────────────────────
    const TRUNK_COL = new THREE.Color('#3d1f0a')
    const CROWN_COL = new THREE.Color('#204a0e')
    for (const tr of trees.current) {
      if (!tr.trunk || !tr.crown) continue
      const dist  = cam.position.distanceTo(tr.restPos)
      const tEmit = Math.max(0, t - dist / c)
      const age   = tEmit - tr.birthT
      if (age < 0) { tr.trunk.visible = false; tr.crown.visible = false; continue }
      const s = Math.min(tr.maxR, age / TREE_GROW * tr.maxR)
      if (s < 0.08) { tr.trunk.visible = false; tr.crown.visible = false; continue }
      const tH  = s * 1.6
      const tMat = tr.trunk.material as THREE.MeshStandardMaterial
      const cMat = tr.crown.material as THREE.MeshStandardMaterial
      applyRelativistic(tr.restPos, tr.trunk.position, tMat, TRUNK_COL)
      tr.trunk.position.y += tH / 2; tr.trunk.scale.set(s * 0.28, tH, s * 0.28); tr.trunk.visible = true
      tr.crown.position.copy(tr.trunk.position)
      tr.crown.position.y += tH / 2 + s * 0.55
      tr.crown.scale.set(s, s * 1.35, s); tr.crown.visible = true
      if (b > 0.005 && _vHat.lengthSq() > 0.5) {
        _rel.subVectors(tr.restPos, cam.position)
        const d2 = _rel.length()
        dopplerTint(doppler(d2 > 0.1 ? _rel.dot(_vHat) / d2 : 0, b, g), CROWN_COL, _col)
        cMat.color.copy(_col)
      } else cMat.color.copy(CROWN_COL)
    }

    // ── Lune ──────────────────────────────────────────────────────────────
    if (moonGroup.current && moonSphere.current) {
      const distMoon  = cam.position.distanceTo(MOON_POS)
      const tEmitMoon = Math.max(0, t - distMoon / c)
      const { phase, progress } = getMoonPhase(tEmitMoon)

      // Position Lorentz du groupe lune
      _rel.subVectors(MOON_POS, cam.position)
      if (b > 0.005 && _vHat.lengthSq() > 0.5) {
        lorentzOffset(_rel, _vHat, g, _ctr)
        moonGroup.current.position.copy(cam.position).add(_ctr)
      } else {
        moonGroup.current.position.copy(MOON_POS)
      }

      const sMat = moonSphere.current.material as THREE.MeshStandardMaterial
      const pulse = 0.5 + 0.5 * Math.sin(tEmitMoon * 2.5)

      if (phase === 'accretion') {
        const r = (1 - progress) * 32 + 2
        moonSphere.current.scale.setScalar(0.15 + progress * 0.85)
        sMat.color.set('#5a3a22'); sMat.emissive.set('#000'); sMat.emissiveIntensity = 0
        sMat.roughness = 0.9; sMat.metalness = 0.05
        for (let i = 0; i < moonParts.current.length; i++) {
          const p = moonParts.current[i]
          const angle = (i / N_MOON_PARTS) * Math.PI * 2 + tEmitMoon * 0.6
          const yFactor = Math.sin(angle * 0.7) * 0.3
          p.position.set(Math.cos(angle) * r, yFactor * r, Math.sin(angle) * r)
          p.rotation.set(tEmitMoon * 0.4 + i, tEmitMoon * 0.5 + i, 0)
          p.visible = true
        }
        if (moonLight.current) moonLight.current.intensity = 0

      } else if (phase === 'fusion') {
        moonSphere.current.scale.setScalar(1)
        heatCol(progress * 0.7 + pulse * 0.3, _col)
        sMat.color.copy(_col); sMat.emissive.copy(_col)
        sMat.emissiveIntensity = 3 + pulse * 8 + progress * 6
        sMat.roughness = 0.3; sMat.metalness = 0.2
        moonParts.current.forEach(p => { p.visible = false })
        if (moonLight.current) {
          heatCol(progress * 0.8 + pulse * 0.2, _col)
          moonLight.current.color.copy(_col)
          moonLight.current.position.copy(moonGroup.current.position)
          moonLight.current.intensity = 20 + pulse * 30 + progress * 40
          moonLight.current.distance  = 400
        }

      } else {  // frozen
        moonSphere.current.scale.setScalar(1)
        sMat.color.set('#9090a8'); sMat.emissive.set('#0a0a14')
        sMat.emissiveIntensity = 0.15; sMat.roughness = 0.75; sMat.metalness = 0.3
        moonParts.current.forEach(p => { p.visible = false })
        if (moonLight.current) {
          moonLight.current.color.set('#aabbcc')
          moonLight.current.position.copy(moonGroup.current.position)
          moonLight.current.intensity = 4
          moonLight.current.distance  = 350
        }
      }

      // Doppler sur la lune
      if (b > 0.005 && _vHat.lengthSq() > 0.5 && phase !== 'accretion') {
        _rel.subVectors(MOON_POS, cam.position)
        const dM = _rel.length()
        const cosT = dM > 0.1 ? _rel.dot(_vHat) / dM : 0
        const k = doppler(cosT, b, g)
        const baseCol = phase === 'frozen' ? new THREE.Color('#9090a8') : _col
        dopplerTint(k, baseCol, _col2)
        sMat.color.lerp(_col2, 0.5)
      }

      // HUD lune
      if (moonRef.current) {
        const dt_moon = (distMoon / c).toFixed(1)
        const phaseLabel = phase === 'accretion' ? `Accrétion ${(progress*100).toFixed(0)}%`
          : phase === 'fusion' ? `Fusion ${(progress*100).toFixed(0)}%`
          : 'Figée ❄'
        moonRef.current.textContent = `${phaseLabel}  (Δt=${dt_moon}s)`
        moonRef.current.style.color = phase === 'accretion' ? '#aa8855'
          : phase === 'fusion' ? '#ffaa44' : '#aabbcc'
      }
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    if (betaRef.current) betaRef.current.textContent =
      `β ${b.toFixed(3)}   γ ${g.toFixed(2)}   Δ${(100/g).toFixed(0)}%`
    if (sprintRef.current) {
      sprintRef.current.textContent = sprint ? `×${SPRINT_MUL}  (${speed.toFixed(0)} u/s)` : `${speed.toFixed(0)} u/s`
      sprintRef.current.style.color = sprint ? '#ffee44' : '#a08060'
    }
    const dV = cam.position.distanceTo(VOL_POS)
    const dC = cam.position.distanceTo(CRYST_CENTER)
    const dT = cam.position.distanceTo(TREE_CENTER)
    const minD = Math.min(dV, dC, dT)
    if (zoneRef.current) {
      if (minD === dV)      zoneRef.current.textContent = `lave  ${dV.toFixed(0)}u → Δt=${(dV/c).toFixed(1)}s`
      else if (minD === dC) zoneRef.current.textContent = `cristaux  ${dC.toFixed(0)}u → Δt=${(dC/c).toFixed(1)}s`
      else                  zoneRef.current.textContent = `forêt  ${dT.toFixed(0)}u → Δt=${(dT/c).toFixed(1)}s`
    }
    const cycP = ((tEmitVol % VOL_CYCLE) + VOL_CYCLE) % VOL_CYCLE / VOL_CYCLE
    let ph = 'REPOS', phCol = '#cc8855'
    if (cycP > 0.70) { ph = 'CONTRACTION'; phCol = '#cc6633' }
    else if (cycP > 0.62) { ph = 'ÉRUPTION ⚡'; phCol = '#ffee44' }
    else if (cycP > 0.40) { ph = 'GONFLE'; phCol = '#ff7733' }
    if (phaseRef.current) { phaseRef.current.textContent = ph; phaseRef.current.style.color = phCol }
  })

  useEffect(() => {
    const dn = (e: KeyboardEvent) => keys.current.add(e.code)
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  return null
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function HUD({ cSim, setCSim, onBack, locked, containerRef, betaRef, phaseRef, zoneRef, sprintRef, moonRef, resetRef }: {
  cSim: number; setCSim: (v: number) => void
  onBack: () => void; locked: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  betaRef:   React.RefObject<HTMLSpanElement | null>
  phaseRef:  React.RefObject<HTMLSpanElement | null>
  zoneRef:   React.RefObject<HTMLSpanElement | null>
  sprintRef: React.RefObject<HTMLSpanElement | null>
  moonRef:   React.RefObject<HTMLSpanElement | null>
  resetRef:  React.MutableRefObject<(() => void) | null>
}) {
  const beta0 = Math.min(BASE_SPEED / cSim, 0.999)
  const g0    = 1 / Math.sqrt(1 - beta0 * beta0)
  const bSp   = Math.min(BASE_SPEED * SPRINT_MUL / cSim, 0.999)
  const gSp   = 1 / Math.sqrt(1 - bSp * bSp)

  return (
    <div style={{ fontFamily: "'SF Mono','Fira Code',monospace", position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <ScenePanel title="V7 — Retarded World" onBack={onBack} containerRef={containerRef}
        theme="orange" filename="v7-retarded-world.webm" width={355}>

        {/* c_sim */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 14 }}>
            <span style={{ color: '#b08060' }}>c<sub>sim</sub></span>
            <span style={{ color: '#ffcc88', fontWeight: 700, fontSize: 16 }}>{cSim.toFixed(0)} u/s</span>
          </div>
          <input type="range" min={6} max={80} step={1} value={cSim}
            onChange={e => setCSim(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#ff8833', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5a3818', marginTop: 3 }}>
            <span style={{ color: '#ff8844' }}>c=6 → ultra-relat.</span>
            <span>c=80 → classique</span>
          </div>
        </div>

        {/* Physique live */}
        <div style={{ background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: '10px 13px', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#5a3818', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 7 }}>Physique en temps réel</div>
          <Row label="β · γ · contraction" ref={betaRef} def="β 0.000   γ 1.00   Δ100%" col="#ffcc88" />
          <Row label="vitesse"              ref={sprintRef} def={`${BASE_SPEED} u/s`} col="#a08060" />
          <Row label="zone proche"          ref={zoneRef}   def="—" col="#d0a060" />
          <Row label="volcan vu"            ref={phaseRef}  def="—" col="#ff9966" bold />
          <Row label="lune vue"             ref={moonRef}   def="—" col="#aabbcc" />
        </div>

        {/* Stats statiques */}
        <div style={{ background: 'rgba(255,100,20,0.08)', borderRadius: 8, padding: '10px 13px', marginBottom: 12, fontSize: 13 }}>
          <div style={{ fontSize: 11, color: '#5a3818', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>À vitesse constante</div>
          <StatRow l="β marche"     v={`${beta0.toFixed(3)}  γ=${g0.toFixed(2)}`} vc="#ffaa66" />
          <StatRow l="β sprint"     v={`${Math.min(bSp,0.999).toFixed(3)}  γ=${gSp.toFixed(2)}`} vc="#ffee44" />
          <StatRow l="Δ marche"     v={`${(100/g0).toFixed(0)}% de la distance`} vc="#ffcc44" />
          <StatRow l="Δ sprint"     v={`${(100/gSp).toFixed(0)}% de la distance`} vc="#ffee44" />
          <StatRow l="Lune à repos" v={`Δt = ${(MOON_POS.distanceTo(new THREE.Vector3(0,6,130))/cSim).toFixed(0)}s dans le passé`} vc="#aabbcc" />
        </div>

        {/* Légende */}
        <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 8, padding: '10px 13px', marginBottom: 12, fontSize: 12, lineHeight: 2.0 }}>
          <div style={{ fontSize: 11, color: '#5a3818', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Biomes · effet retardé</div>
          <div><span style={{ color: '#ff5500' }}>● Lave</span>  <span style={{ color: '#5a3818' }}>remonte de loin, descend de près</span></div>
          <div><span style={{ color: '#4488ff' }}>● Cristaux</span>  <span style={{ color: '#5a3818' }}>bébés de loin, grands de près</span></div>
          <div><span style={{ color: '#44aa22' }}>● Forêt</span>  <span style={{ color: '#5a3818' }}>pousses de loin, adultes de près</span></div>
          <div><span style={{ color: '#bbccdd' }}>● Lune</span>  <span style={{ color: '#5a3818' }}>accrétion → fusion → figée</span></div>
        </div>

        {/* Contrôles + Reset */}
        <div style={{ background: 'rgba(0,0,0,0.30)', borderRadius: 8, padding: '10px 13px', marginBottom: 10, fontSize: 12, color: '#5a3418', lineHeight: 1.95 }}>
          <div style={{ fontSize: 11, color: '#7a5030', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Contrôles</div>
          <div><span style={{ color: '#cc8844' }}>WASD</span> · <span style={{ color: '#ffee44' }}>Shift</span> sprint ×{SPRINT_MUL}</div>
          <div><span style={{ color: '#88cc44' }}>Espace</span> monter · <span style={{ color: '#88cc44' }}>Ctrl</span> descendre · <span style={{ color: '#cc8888' }}>ESC</span> libérer</div>
        </div>

        <button
          onClick={() => resetRef.current?.()}
          style={{ width: '100%', padding: '9px 0', cursor: 'pointer', background: 'rgba(180,80,10,0.15)', border: '1px solid rgba(255,120,40,0.45)', borderRadius: 8, color: '#ffaa66', fontSize: 13, fontFamily: 'inherit', letterSpacing: '0.08em', transition: 'all 0.15s' }}
          onMouseEnter={e => { const b = e.target as HTMLButtonElement; b.style.background = 'rgba(220,100,20,0.32)'; b.style.color = '#ffddaa' }}
          onMouseLeave={e => { const b = e.target as HTMLButtonElement; b.style.background = 'rgba(180,80,10,0.15)'; b.style.color = '#ffaa66' }}
        >
          ↺ Réinitialiser la scène
        </button>
      </ScenePanel>

      {locked && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
          <div style={{ width: 1, height: 18, background: 'rgba(255,180,80,0.6)', margin: '0 auto' }} />
          <div style={{ width: 18, height: 1, background: 'rgba(255,180,80,0.6)', marginTop: -9.5 }} />
        </div>
      )}
      {!locked && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(6,3,0,0.94)', border: '1px solid rgba(255,130,40,0.5)', borderRadius: 16, padding: '30px 60px', textAlign: 'center', backdropFilter: 'blur(20px)' }}>
            <div style={{ color: '#ff7722', fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: 12 }}>Retarded World — V7</div>
            <div style={{ color: '#f0d0a0', fontSize: 24, fontWeight: 700, marginBottom: 10 }}>Cliquer pour explorer</div>
            <div style={{ color: '#6a4020', fontSize: 13, lineHeight: 1.8 }}>WASD · Shift sprint · Espace/Ctrl haut-bas<br />Baisser c<sub>sim</sub> pour amplifier les effets</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sous-composants HUD ──────────────────────────────────────────────────────
function Row({ label, def, col, bold, ref: fwdRef }: {
  label: string; def: string; col: string; bold?: boolean
  ref?: React.RefObject<HTMLSpanElement | null>
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
      <span style={{ color: '#7a5030' }}>{label}</span>
      <span ref={fwdRef as React.RefObject<HTMLSpanElement>} style={{ color: col, fontWeight: bold ? 700 : 400 }}>{def}</span>
    </div>
  )
}
function StatRow({ l, v, vc }: { l: string; v: string; vc: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
      <span style={{ color: '#7a5030' }}>{l}</span>
      <span style={{ color: vc }}>{v}</span>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function V7Scene({ onBack }: { onBack: () => void }) {
  const [cSim, setCSim]     = useState(22)
  const [locked, setLocked] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const betaRef      = useRef<HTMLSpanElement>(null)
  const phaseRef     = useRef<HTMLSpanElement>(null)
  const zoneRef      = useRef<HTMLSpanElement>(null)
  const sprintRef    = useRef<HTMLSpanElement>(null)
  const moonRef      = useRef<HTMLSpanElement>(null)
  const resetRef     = useRef<(() => void) | null>(null)
  const onLock       = useCallback(() => setLocked(true),  [])
  const onUnlock     = useCallback(() => setLocked(false), [])

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', background: '#0a0a12', position: 'relative' }}>
      <Canvas camera={{ position: START.toArray(), fov: 70, near: 0.1, far: 1600 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.NoToneMapping }} shadows
        dpr={[1, 1.5]}>
        <color attach="background" args={['#0a0c14']} />
        <fog attach="fog" args={['#0e1020', 250, 950]} />

        {/* Éclairage ambiant IBL — preset "night" pour reflets sur cristaux et lave */}
        <Environment preset="night" />

        <hemisphereLight args={['#2a3866', '#5a2a10', 0.8]} />
        <ambientLight intensity={0.4} color="#cc8844" />
        <directionalLight position={[80, 120, 60]} intensity={1.4} color="#ffe8c0"
          castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-far={700} shadow-camera-left={-300} shadow-camera-right={300}
          shadow-camera-top={300} shadow-camera-bottom={-20} />
        <pointLight position={[CRYST_CENTER.x, 40, CRYST_CENTER.z]} intensity={30} color="#2244ee" distance={160} decay={1.6} />
        <pointLight position={[TREE_CENTER.x, 25, TREE_CENTER.z]}   intensity={14} color="#336622" distance={130} decay={1.4} />

        <Sky />
        <TerrainEnv />
        <Simulation cSim={cSim} locked={locked}
          betaRef={betaRef} phaseRef={phaseRef} zoneRef={zoneRef}
          sprintRef={sprintRef} moonRef={moonRef} resetRef={resetRef} />
        <PointerLockControls onLock={onLock} onUnlock={onUnlock} />

        {/* Post-processing : bloom cinématique + tone mapping ACES + vignette */}
        <EffectComposer>
          <Bloom
            intensity={1.4}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.4}
            mipmapBlur
          />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette eskil={false} offset={0.3} darkness={0.6} />
        </EffectComposer>
      </Canvas>
      <HUD cSim={cSim} setCSim={setCSim} onBack={onBack} locked={locked}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
        betaRef={betaRef} phaseRef={phaseRef} zoneRef={zoneRef}
        sprintRef={sprintRef} moonRef={moonRef} resetRef={resetRef} />
    </div>
  )
}
