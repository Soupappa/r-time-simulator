/**
 * V4 — Volcanic Retardation
 *
 * t_emit = t_now − distance / c_sim
 *
 * Pré-simulation de 3 cycles au démarrage → history buffers pleins dès le début.
 * À tout c, on voit immédiatement des effets.
 *
 * Avancer → t_emit monte → volcan gonfle, lave descend (futur se rapproche)
 * Reculer  → t_emit baisse → volcan rétrécit, lave remonte (passé s'approfondit)
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { HistoryBuffer, solveRetardedPosition } from '../v2/RetardedPosition'
import { ScenePanel } from '../components/ScenePanel'

// ─── Config ───────────────────────────────────────────────────────────────────
const CYCLE          = 16
const ERUPT_FRAC     = 0.63
const ERUPT_TIME     = ERUPT_FRAC * CYCLE          // ~10.1 s dans le cycle
const N_FIRE         = 12
const GRAVITY        = 4.5
const N_FLOWS        = 3
const FLOW_DUR       = 12
const MOVE_SPEED     = 12
const START_Z        = 40                          // départ plus proche
const PRE_SIM_DUR    = CYCLE * 3                   // 48 s pré-simulés

// ─── Géométrie du volcan ──────────────────────────────────────────────────────
const VOL_POINTS = [
  new THREE.Vector2(0.3,  0   ),
  new THREE.Vector2(26,   0   ),
  new THREE.Vector2(21,   4   ),
  new THREE.Vector2(15,   9.5 ),
  new THREE.Vector2(9,    14.5),
  new THREE.Vector2(5.8,  17  ),
  new THREE.Vector2(4.8,  17.8),  // bord ext cratère
  new THREE.Vector2(3.8,  17.5),  // bord int cratère
  new THREE.Vector2(3.1,  16  ),  // paroi
  new THREE.Vector2(0.3,  16  ),  // fond
]

// ─── Chemins de lave (3 × 120°) ──────────────────────────────────────────────
function makeFlowPath(angle: number): THREE.Vector3[] {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [
    new THREE.Vector3(c * 4.2, 17.5, s * 4.2),
    new THREE.Vector3(c * 8,   14,   s * 8  ),
    new THREE.Vector3(c * 14,  8,    s * 14 ),
    new THREE.Vector3(c * 20,  2,    s * 20 ),
    new THREE.Vector3(c * 27,  0.1,  s * 27 ),
    new THREE.Vector3(c * 34,  0,    s * 34 ),
  ]
}
const FLOW_PATHS = [0, Math.PI * 2 / 3, Math.PI * 4 / 3].map(makeFlowPath)

function samplePath(path: THREE.Vector3[], frac: number, out: THREE.Vector3) {
  const f = Math.max(0, Math.min(1, frac))
  const n = path.length - 1
  const seg = Math.min(Math.floor(f * n), n - 1)
  out.lerpVectors(path[seg], path[seg + 1], f * n - seg)
}

// ─── État du volcan ───────────────────────────────────────────────────────────
type VolState = { scale: number; heat: number }

function getVolState(t: number): VolState {
  const p = ((t % CYCLE) + CYCLE) % CYCLE / CYCLE
  if (p < 0.40) {
    const u = p / 0.40
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4)
    return { scale: 0.88 + u * 0.20 + pulse * 0.04, heat: 0.05 + u * 0.10 + pulse * 0.04 }
  }
  if (p < ERUPT_FRAC) {
    const u = (p - 0.40) / (ERUPT_FRAC - 0.40)
    return { scale: 1.08 + u * u * 0.42, heat: 0.15 + u * 0.85 }
  }
  if (p < ERUPT_FRAC + 0.08) {
    const u = (p - ERUPT_FRAC) / 0.08
    const collapse = 1 - Math.sin(u * Math.PI * 0.5) * 0.52
    return { scale: 1.50 * collapse, heat: 1.0 }
  }
  const u = (p - ERUPT_FRAC - 0.08) / (1 - ERUPT_FRAC - 0.08)
  return { scale: 0.78 + (1 - (1 - u) * (1 - u)) * 0.10, heat: 1 - u * 0.93 }
}

const C_COLD = new THREE.Color('#8b2200')
const C_MID  = new THREE.Color('#ff5500')
const C_HOT  = new THREE.Color('#ffee88')
function heatToColor(heat: number, out: THREE.Color) {
  if (heat < 0.5) out.copy(C_COLD).lerp(C_MID,  heat * 2)
  else            out.copy(C_MID).lerp(C_HOT, (heat - 0.5) * 2)
}

// ─── Types objets dynamiques ──────────────────────────────────────────────────
// Fireballs : pool multi-générations — chaque éruption recycle la génération la plus ancienne
// avec une history fraîche → trajectoire toujours monotone, pas de "remontée"
const N_GEN_FIRE = 3   // générations simultanées (couvre ~3 cycles visibles à bas c)
type Fireball = { genIdx: number; dir: THREE.Vector3; speed: number; tLaunch: number; history: HistoryBuffer; mesh: THREE.Mesh | null }

// Pool de blobs à usage unique : chaque blob descend UNE SEULE fois avec une history fraîche.
// Jamais de "remontée" possible dans les données — le buffer est monotone descendant.
const POOL_PER_FLOW = 26   // slots par canal (couvre ~PRE_SIM_DUR / SPAWN_MIN_INTERVAL)
type LavaBlob = { flowIdx: number; slotIdx: number; tBirth: number; history: HistoryBuffer; mesh: THREE.Mesh | null }

const CRATER = new THREE.Vector3(0, 18, 0)

// Intervalle de spawn dépend de la phase du cycle :
// REST → rare (4s), SWELL → modéré (1.8s), post-ÉRUPTION → intense (0.7s)
function spawnInterval(cyclePhase: number): number {
  if (cyclePhase > ERUPT_FRAC && cyclePhase < ERUPT_FRAC + 0.40) return 0.7
  if (cyclePhase > 0.38) return 1.8
  return 4.0
}

function makeFireballs(): Fireball[] {
  // N_GEN_FIRE générations × N_FIRE éclats — chaque génération a ses propres directions
  return Array.from({ length: N_GEN_FIRE * N_FIRE }, (_, i) => {
    const fi   = i % N_FIRE
    const ga   = Math.PI * (3 - Math.sqrt(5)) * fi
    const elev = 0.38 + 0.52 * (fi / (N_FIRE - 1))
    const hor  = Math.sqrt(1 - elev * elev)
    return {
      genIdx:  Math.floor(i / N_FIRE),
      dir:     new THREE.Vector3(hor * Math.cos(ga), elev, hor * Math.sin(ga)).normalize(),
      speed:   8 + Math.abs(Math.sin(fi * 1.9)) * 6,
      tLaunch: -9999,
      history: new HistoryBuffer(256),   // ~8s à 30fps — une seule trajectoire
      mesh:    null,
    }
  })
}

// Recycle la génération la plus ancienne avec une history fraîche
function activateFireGen(fires: Fireball[], tErupt: number) {
  // Trouve la génération avec le tLaunch le plus ancien
  let oldestGen = 0, oldestT = Infinity
  for (let g = 0; g < N_GEN_FIRE; g++) {
    const t = fires.find(f => f.genIdx === g)?.tLaunch ?? -9999
    if (t < oldestT) { oldestT = t; oldestGen = g }
  }
  for (const f of fires) {
    if (f.genIdx === oldestGen) {
      f.tLaunch = tErupt
      f.history = new HistoryBuffer(256)
    }
  }
}

function makeLavaBlobs(): LavaBlob[] {
  const out: LavaBlob[] = []
  for (let f = 0; f < N_FLOWS; f++)
    for (let s = 0; s < POOL_PER_FLOW; s++)
      out.push({ flowIdx: f, slotIdx: s, tBirth: -9999, history: new HistoryBuffer(512), mesh: null })
  return out
}

// Active le prochain slot libre d'un canal — history fraîche garantie
function activateBlobSlot(blobs: LavaBlob[], flowIdx: number, tBirth: number, t: number) {
  // Cherche un slot inactif (expiré ou jamais utilisé)
  for (const l of blobs) {
    if (l.flowIdx !== flowIdx) continue
    const expired = l.tBirth < -9000 || (t - l.tBirth) > FLOW_DUR + 1
    if (expired) {
      l.tBirth  = tBirth
      l.history = new HistoryBuffer(512)   // history fraîche — pas de données passées
      return
    }
  }
}

// ─── Pré-simulation : remplit les history buffers avant t=0 affiché ───────────
const _preTmp = new THREE.Vector3()

function preSim(fires: Fireball[], lavas: LavaBlob[]) {
  const DT = 1 / 30
  let lastEruptCycle = -1
  const nextSpawnT = [0, 0, 0]  // prochain temps de spawn par canal

  for (let t = 0; t <= PRE_SIM_DUR; t += DT) {
    // Trigger éruptions (fireballs)
    const cycleIdx = Math.floor(t / CYCLE)
    const tErupt   = cycleIdx * CYCLE + ERUPT_TIME
    if (tErupt <= t && cycleIdx !== lastEruptCycle) {
      lastEruptCycle = cycleIdx
      activateFireGen(fires, tErupt)
    }

    // Spawn de lave continu avec débit variable
    const cyclePhase = ((t % CYCLE) + CYCLE) % CYCLE / CYCLE
    const interval   = spawnInterval(cyclePhase)
    for (let f = 0; f < N_FLOWS; f++) {
      if (t >= nextSpawnT[f]) {
        activateBlobSlot(lavas, f, t, t)
        nextSpawnT[f] = t + interval
      }
    }

    // Push positions
    for (const f of fires) {
      if (f.tLaunch > -9000 && t >= f.tLaunch) {
        const dt = t - f.tLaunch
        _preTmp.set(
          CRATER.x + f.dir.x * f.speed * dt,
          CRATER.y + f.dir.y * f.speed * dt - 0.5 * GRAVITY * dt * dt,
          CRATER.z + f.dir.z * f.speed * dt,
        )
        if (_preTmp.y >= 0) f.history.push(_preTmp, t)
      }
    }
    for (const l of lavas) {
      if (l.tBirth > -9000 && t >= l.tBirth && (t - l.tBirth) <= FLOW_DUR) {
        const frac = (t - l.tBirth) / FLOW_DUR
        samplePath(FLOW_PATHS[l.flowIdx], frac, _preTmp)
        l.history.push(_preTmp, t)
      }
    }
  }
}

// ─── Volcan mesh ──────────────────────────────────────────────────────────────
function VolcanoMesh({ groupRef }: { groupRef: React.RefObject<THREE.Group | null> }) {
  const bodyGeo = useMemo(() => {
    const g = new THREE.LatheGeometry(VOL_POINTS, 10)
    g.computeVertexNormals()
    return g
  }, [])
  const flowTubes = useMemo(() =>
    FLOW_PATHS.map(path => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 28, 0.40, 5, false))
  , [])

  return (
    <group ref={groupRef as React.RefObject<THREE.Group>}>
      {/* Corps */}
      <mesh geometry={bodyGeo} receiveShadow castShadow>
        <meshStandardMaterial color="#7a3515" roughness={0.82} metalness={0.05} flatShading />
      </mesh>
      {/* Bord cratère */}
      <mesh position={[0, 17.85, 0]} rotation={[-Math.PI/2,0,0]}>
        <ringGeometry args={[3.1, 5.0, 10]} />
        <meshStandardMaterial color="#4a1e08" roughness={0.9} flatShading />
      </mesh>
      {/* Pool de lave */}
      <mesh position={[0, 16.1, 0]} rotation={[-Math.PI/2,0,0]} name="lava-pool">
        <circleGeometry args={[3.0, 10]} />
        <meshStandardMaterial color="#ff4400" emissive="#ff3300" emissiveIntensity={3} roughness={0.3} />
      </mesh>
      {/* Canaux de lave sur la pente */}
      {flowTubes.map((geo, i) => (
        <mesh key={i} geometry={geo} receiveShadow>
          <meshStandardMaterial color="#882200" emissive="#550800" emissiveIntensity={1.2} roughness={0.65} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Environnement ────────────────────────────────────────────────────────────
function Environment() {
  const hills = [
    { p: [-95,0,-65] as [number,number,number], r:20, h:13 },
    { p: [ 85,0,-75] as [number,number,number], r:16, h:10 },
    { p: [-65,0, 85] as [number,number,number], r:24, h:15 },
    { p: [110,0, 45] as [number,number,number], r:13, h: 8 },
    { p: [-35,0,-100] as [number,number,number], r:22, h:14 },
    { p: [ 60,0, 90] as [number,number,number], r:18, h:11 },
  ]
  const rocks = useMemo(() => Array.from({length:32}, (_,i) => {
    const a = i/32*Math.PI*2 + Math.sin(i*1.7)*1.2
    const d = 32 + Math.abs(Math.sin(i*2.1))*55
    return { p:[Math.cos(a)*d, 0, Math.sin(a)*d] as [number,number,number], s:[0.9+Math.sin(i)*0.6, 0.5+Math.cos(i*1.3)*0.4, 0.8+Math.sin(i*0.9)*0.7] as [number,number,number] }
  }), [])

  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.05,0]} receiveShadow>
        <planeGeometry args={[700,700]} />
        <meshStandardMaterial color="#6b2e10" roughness={0.95} />
      </mesh>
      {hills.map((h,i) => (
        <mesh key={i} position={h.p} castShadow>
          <coneGeometry args={[h.r, h.h, 8, 1]} />
          <meshStandardMaterial color="#5a2410" roughness={0.9} flatShading />
        </mesh>
      ))}
      {rocks.map((r,i) => (
        <mesh key={i} position={r.p} scale={r.s} castShadow>
          <dodecahedronGeometry args={[1.4, 0]} />
          <meshStandardMaterial color="#5e2810" roughness={0.95} flatShading />
        </mesh>
      ))}
      {/* Fissures au sol */}
      {[0.4,1.3,2.2,3.8,5.1].map((a,i) => {
        const d = 26+i*4
        return (
          <mesh key={i} position={[Math.cos(a)*d, 0.02, Math.sin(a)*d]} rotation={[-Math.PI/2,0,a]}>
            <planeGeometry args={[0.6, 10]} />
            <meshBasicMaterial color="#ff2200" transparent opacity={0.55} />
          </mesh>
        )
      })}
    </group>
  )
}

function Stars() {
  const geo = useMemo(() => {
    const n = 2200, pos = new Float32Array(n*3)
    for (let i = 0; i < n; i++) {
      const r=280+Math.random()*400, t=Math.random()*Math.PI*2, p=Math.acos(2*Math.random()-1)
      pos[i*3]=r*Math.sin(p)*Math.cos(t); pos[i*3+1]=r*Math.sin(p)*Math.sin(t); pos[i*3+2]=r*Math.cos(p)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos,3))
    return g
  }, [])
  return <points geometry={geo}><pointsMaterial color="#bbaa99" size={0.55} sizeAttenuation transparent opacity={0.7} /></points>
}

// ─── Simulation ───────────────────────────────────────────────────────────────
const _ret   = new THREE.Vector3()
const _pos   = new THREE.Vector3()
const _col   = new THREE.Color()
const ORIGIN = new THREE.Vector3(0,0,0)

interface SimProps {
  cSim: number
  volcanoRef: React.RefObject<THREE.Group | null>
  craterRef:  React.RefObject<THREE.PointLight | null>
  distRef:    React.RefObject<HTMLSpanElement | null>
  emitRef:    React.RefObject<HTMLSpanElement | null>
  phaseRef:   React.RefObject<HTMLSpanElement | null>
}

function Simulation({ cSim, volcanoRef, craterRef, distRef, emitRef, phaseRef }: SimProps) {
  const { camera, scene } = useThree()
  // Démarre après la pré-sim
  const tRef      = useRef(PRE_SIM_DUR)
  const cRef      = useRef(cSim); cRef.current = cSim
  const fires      = useRef(makeFireballs())
  const lavas      = useRef(makeLavaBlobs())
  const lastErupt  = useRef(-1)
  const nextSpawnT = useRef([PRE_SIM_DUR, PRE_SIM_DUR, PRE_SIM_DUR])  // prochain spawn par canal

  const keys = useRef<Set<string>>(new Set())
  useEffect(() => {
    const dn = (e: KeyboardEvent) => keys.current.add(e.code)
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  useEffect(() => {
    // Pré-simulation : remplit les history buffers
    preSim(fires.current, lavas.current)
    lastErupt.current = Math.floor(PRE_SIM_DUR / CYCLE) - 1

    // Build meshes
    for (const f of fires.current) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.65, 8, 6),
        new THREE.MeshStandardMaterial({ color:'#ff8800', emissive:'#ff6600', emissiveIntensity:2.5, roughness:0.35 })
      )
      m.visible = false; scene.add(m); f.mesh = m
    }
    for (const l of lavas.current) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 8, 6),
        new THREE.MeshStandardMaterial({ color:'#ff4400', emissive:'#ff2200', emissiveIntensity:2.0, roughness:0.45, flatShading:true })
      )
      m.visible = false; scene.add(m); l.mesh = m
    }
    return () => {
      fires.current.forEach(f => f.mesh && scene.remove(f.mesh))
      lavas.current.forEach(l => l.mesh && scene.remove(l.mesh))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useFrame((state, delta) => {
    tRef.current += Math.min(delta, 0.05)
    const t  = tRef.current
    const c  = cRef.current
    const cam = state.camera

    // ── WASD ─────────────────────────────────────────────────────────────────
    const mv = new THREE.Vector3()
    if (keys.current.has('KeyW') || keys.current.has('ArrowUp'))    mv.z -= 1
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown'))  mv.z += 1
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft'))  mv.x -= 1
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) mv.x += 1
    if (mv.lengthSq() > 0) {
      mv.normalize().applyQuaternion(cam.quaternion); mv.y = 0
      cam.position.addScaledVector(mv, MOVE_SPEED * delta)
      if (cam.position.y < 2) cam.position.y = 2
    }

    // ── Temps retardé volcan (stationnaire → direct) ──────────────────────────
    const dist  = cam.position.distanceTo(ORIGIN)
    const tEmit = Math.max(0, t - dist / c)
    const seen  = getVolState(tEmit)

    if (volcanoRef.current) {
      volcanoRef.current.scale.setScalar(seen.scale)
      const pool = volcanoRef.current.getObjectByName('lava-pool') as THREE.Mesh | undefined
      if (pool) {
        heatToColor(seen.heat, _col)
        const mat = pool.material as THREE.MeshStandardMaterial
        mat.color.copy(_col); mat.emissive.copy(_col); mat.emissiveIntensity = 2 + seen.heat * 5
      }
    }
    if (craterRef.current) {
      heatToColor(seen.heat, _col)
      craterRef.current.color.copy(_col)
      craterRef.current.intensity = 4 + seen.heat * 36
      craterRef.current.distance  = 28 + seen.heat * 100
    }

    // ── Trigger éruption (fireballs seulement) ────────────────────────────────
    const cycleIdx = Math.floor(t / CYCLE)
    const tErupt   = cycleIdx * CYCLE + ERUPT_TIME
    if (tErupt <= t && cycleIdx !== lastErupt.current) {
      lastErupt.current = cycleIdx
      activateFireGen(fires.current, tErupt)
    }

    // ── Spawn lave continu (débit selon phase réelle) ─────────────────────────
    const cyclePhase = ((t % CYCLE) + CYCLE) % CYCLE / CYCLE
    const interval   = spawnInterval(cyclePhase)
    for (let f = 0; f < N_FLOWS; f++) {
      if (t >= nextSpawnT.current[f]) {
        activateBlobSlot(lavas.current, f, t, t)
        nextSpawnT.current[f] = t + interval
      }
    }

    // ── Accumulation historique ───────────────────────────────────────────────
    for (const f of fires.current) {
      if (f.tLaunch > -9000 && t >= f.tLaunch) {
        const dt = t - f.tLaunch
        _pos.set(
          CRATER.x + f.dir.x * f.speed * dt,
          CRATER.y + f.dir.y * f.speed * dt - 0.5 * GRAVITY * dt * dt,
          CRATER.z + f.dir.z * f.speed * dt,
        )
        // Ne push que si encore en l'air — trajectory monotone garantie
        if (_pos.y >= 0) f.history.push(_pos, t)
      }
    }
    for (const l of lavas.current) {
      // Ne push que pendant la durée de vie active — blob monotone descendant garanti
      if (l.tBirth > -9000 && t >= l.tBirth && (t - l.tBirth) <= FLOW_DUR) {
        const frac = (t - l.tBirth) / FLOW_DUR
        samplePath(FLOW_PATHS[l.flowIdx], frac, _pos)
        l.history.push(_pos, t)
      }
    }

    // ── Positions retardées ───────────────────────────────────────────────────
    const tEmitOrigin = t - dist / c
    for (const f of fires.current) {
      if (!f.mesh) continue
      if (f.history.newestT <= f.history.oldestT || tEmitOrigin < f.history.oldestT) { f.mesh.visible = false; continue }
      const ok = solveRetardedPosition(f.history, cam.position, t, c, _ret)
      if (!ok || _ret.y < -1) { f.mesh.visible = false; continue }
      f.mesh.visible = true; f.mesh.position.copy(_ret)
    }
    for (const l of lavas.current) {
      if (!l.mesh) continue
      // Visible seulement si t_emit tombe dans la fenêtre de vie du blob
      if (l.tBirth < -9000
        || l.history.newestT <= l.history.oldestT
        || tEmitOrigin < l.history.oldestT
        || tEmitOrigin > l.history.newestT + 0.2) {
        l.mesh.visible = false; continue
      }
      const ok = solveRetardedPosition(l.history, cam.position, t, c, _ret)
      if (!ok) { l.mesh.visible = false; continue }
      l.mesh.visible = true; l.mesh.position.copy(_ret)
      // Couleur : brûlant en haut (tBirth), refroidi en bas (tBirth+FLOW_DUR)
      const fracSeen = Math.max(0, Math.min((tEmitOrigin - l.tBirth) / FLOW_DUR, 1))
      heatToColor(Math.max(0, 1 - fracSeen * 0.80), _col)
      const mat = l.mesh.material as THREE.MeshStandardMaterial
      mat.color.copy(_col); mat.emissive.copy(_col); mat.emissiveIntensity = 1.8 - fracSeen * 1.4
    }

    // ── HUD ───────────────────────────────────────────────────────────────────
    if (distRef.current)  distRef.current.textContent  = dist.toFixed(1)
    if (emitRef.current)  emitRef.current.textContent  = tEmit.toFixed(1)
    if (phaseRef.current) {
      const p = ((tEmit % CYCLE) + CYCLE) % CYCLE / CYCLE
      let name = 'REST 🌋', col = '#ff9966'
      if      (p > ERUPT_FRAC + 0.08) { name = 'CONTRACT';   col = '#cc6633' }
      else if (p > ERUPT_FRAC)         { name = 'ÉRUPTION ⚡'; col = '#ffee44' }
      else if (p > 0.40)               { name = 'GONFLE 🔺';  col = '#ff7733' }
      phaseRef.current.textContent = name; phaseRef.current.style.color = col
    }
  })

  return null
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function HUD({ cSim, setCSim, onBack, locked, distRef, emitRef, phaseRef, containerRef }: {
  cSim:number; setCSim:(v:number)=>void; onBack:()=>void; locked:boolean
  distRef:React.RefObject<HTMLSpanElement|null>
  emitRef:React.RefObject<HTMLSpanElement|null>
  phaseRef:React.RefObject<HTMLSpanElement|null>
  containerRef:React.RefObject<HTMLDivElement|null>
}) {
  const delay  = (START_Z / Math.max(cSim, 0.5)).toFixed(1)
  const lagPct = Math.round(parseFloat(delay) / CYCLE * 100)

  return (
    <div style={{ fontFamily:"'SF Mono','Fira Code',monospace", position:'fixed', inset:0, pointerEvents:'none', zIndex:10 }}>

      <ScenePanel
        title="V4 — Volcanic Retardation"
        onBack={onBack}
        containerRef={containerRef}
        theme="orange"
        filename="v4-volcanic-retardation.webm"
      >
        {/* ── c_sim slider ──────────────────────────────── */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13 }}>
            <span style={{ color:'#c09070' }}>c<sub>sim</sub></span>
            <span style={{ color:'#ff9955', fontWeight:700, fontSize:15 }}>
              {cSim.toFixed(1)}<span style={{ fontSize:11, color:'#604020' }}> u/s</span>
            </span>
          </div>
          <input type="range" min={1} max={40} step={0.5} value={cSim}
            onChange={e=>setCSim(parseFloat(e.target.value))}
            style={{ width:'100%', accentColor:'#ff7733', cursor:'pointer' }} />
        </div>

        {/* ── Indicateurs live ──────────────────────────── */}
        <div style={{ padding:'10px 12px', background:'rgba(0,0,0,0.45)', borderRadius:7, fontSize:13, lineHeight:2.4, marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ color:'#5a3020' }}>distance</span>
            <span style={{ color:'#d0b090' }}><span ref={distRef as React.RefObject<HTMLSpanElement>}>—</span> u</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ color:'#5a3020' }}>t_emit</span>
            <span style={{ color:'#d0b090' }}><span ref={emitRef as React.RefObject<HTMLSpanElement>}>—</span> s</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ color:'#5a3020' }}>phase vue</span>
            <span ref={phaseRef as React.RefObject<HTMLSpanElement>} style={{ fontWeight:700 }}>—</span>
          </div>
        </div>

        {/* ── Info retard + hints ───────────────────────── */}
        <div style={{ padding:'9px 11px', background:'rgba(255,60,0,0.07)', borderRadius:7, fontSize:12, color:'#7a4020', lineHeight:2.0 }}>
          Retard depuis départ : <span style={{ color:'#ff9955' }}>{delay}s</span>
          {' = '}<span style={{ color:'#ff9955' }}>{lagPct}%</span> du cycle<br/>
          <span style={{ color:'#ff9955' }}>Avancer</span> → volcan gonfle, lave descend<br/>
          <span style={{ color:'#cc6633' }}>Reculer</span> → volcan rétrécit, lave remonte<br/>
          <span style={{ color:'#ff7733' }}>↓ c</span> = décalage temporel plus profond<br/>
          <span style={{ color:'#3a1a08', fontSize:11 }}>
            {locked ? 'ESC pour libérer la souris' : 'Cliquer pour entrer · WASD'}
          </span>
        </div>
      </ScenePanel>

      {/* ── Réticule ────────────────────────────────────────────── */}
      {locked && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none' }}>
          <div style={{ width:1, height:14, background:'rgba(255,160,80,0.6)', margin:'0 auto' }} />
          <div style={{ width:14, height:1, background:'rgba(255,160,80,0.6)', marginTop:-7.5 }} />
        </div>
      )}

      {/* ── Overlay "cliquer pour entrer" ───────────────────────── */}
      {!locked && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ background:'rgba(12,4,1,0.93)', border:'1px solid rgba(255,110,40,0.5)', borderRadius:14, padding:'24px 50px', textAlign:'center', backdropFilter:'blur(16px)' }}>
            <div style={{ color:'#ff7733', fontSize:12, letterSpacing:'0.2em', textTransform:'uppercase', marginBottom:8 }}>Volcanic Retardation</div>
            <div style={{ color:'#f0d0a0', fontSize:22, fontWeight:700, marginBottom:8 }}>Cliquer pour explorer</div>
            <div style={{ color:'#604030', fontSize:13 }}>WASD · Souris · ESC pour sortir</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function V4Scene({ onBack }: { onBack: () => void }) {
  const [cSim, setCSim]     = useState(10)
  const [locked, setLocked] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const volcanoRef   = useRef<THREE.Group>(null)
  const craterRef    = useRef<THREE.PointLight>(null)
  const distRef      = useRef<HTMLSpanElement>(null)
  const emitRef      = useRef<HTMLSpanElement>(null)
  const phaseRef     = useRef<HTMLSpanElement>(null)
  const onLock       = useCallback(() => setLocked(true),  [])
  const onUnlock     = useCallback(() => setLocked(false), [])

  return (
    <div ref={containerRef} style={{ width:'100vw', height:'100vh', background:'#110400', position:'relative' }}>
      <Canvas
        camera={{ position:[0, 4, START_Z], fov:70, near:0.1, far:1000 }}
        gl={{ antialias:true, preserveDrawingBuffer:true }}
        shadows
      >
        <color attach="background" args={['#110400']} />
        <fog attach="fog" args={['#1a0500', 120, 400]} />

        {/* Éclairage fort — scène visible */}
        <hemisphereLight args={['#ff8833', '#441100', 0.9]} />
        <ambientLight intensity={1.2} color="#ffcc88" />
        <directionalLight position={[30,60,40]} intensity={2.0} color="#ffddaa" castShadow shadow-mapSize={[1024,1024]} />
        {/* Fill depuis le devant pour voir le volcan de loin */}
        <pointLight position={[0,10,55]}  intensity={3.0} color="#ffaa66" distance={100} />
        <pointLight position={[-30,5,30]} intensity={1.5} color="#ff8844" distance={70} />
        <pointLight position={[ 30,5,30]} intensity={1.5} color="#ff8844" distance={70} />

        {/* Lumière dynamique du cratère */}
        <pointLight ref={craterRef as React.RefObject<THREE.PointLight>} position={[0,18,0]} intensity={5} color="#ff5500" distance={60} decay={1.4} castShadow />

        <Stars />
        <Environment />
        <VolcanoMesh groupRef={volcanoRef as React.RefObject<THREE.Group | null>} />
        <Simulation cSim={cSim} volcanoRef={volcanoRef as React.RefObject<THREE.Group | null>} craterRef={craterRef as React.RefObject<THREE.PointLight | null>} distRef={distRef} emitRef={emitRef} phaseRef={phaseRef} />
        <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
      </Canvas>

      <HUD cSim={cSim} setCSim={setCSim} onBack={onBack} locked={locked}
        distRef={distRef} emitRef={emitRef} phaseRef={phaseRef}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>} />
    </div>
  )
}
