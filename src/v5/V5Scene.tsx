/**
 * V5 — Temporal Construction
 *
 * 4 seeds aux coins d'un grand cadre creux (160 × 52 × 160 u).
 * Les cubes popent près de chaque seed et glissent vers leur cible.
 *
 * Physique retardée (objets lents → formule directe) :
 *   t_emit = t_now − ‖observer − target‖ / c_sim
 *
 * • Démarrage à t=8 → construction tout juste commencée
 * • De loin : on voit un stade antérieur (peu ou pas de cubes)
 * • En s'approchant : les cubes « apparaissent » (on rattrape leur futur)
 * • Cubes orange = en transit vu de là ; cubes bleu = posés et froids
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { ScenePanel } from '../components/ScenePanel'

// ─── Config ───────────────────────────────────────────────────────────────────
const L          = 72     // demi-taille XZ du cadre (cube total = 144 u de côté)
const H          = 52     // hauteur du cadre
const STEP       = 12     // espacement entre cubes sur les arêtes
const CUBE_R     = 2.2    // demi-côté du cube rendu
const MOVE_SPEED = 14     // vitesse WASD
const START_Z    = 160    // position joueur au démarrage
const T_START    = 8      // t initial — structure à peine commencée
const BASE_TRAVEL = 4.0   // durée de trajet (speed = 1)
const BUILD_TOTAL = 80    // durée totale pour remplir tous les cubes (speed=1)

// 4 seeds (coins du cadre, au sol)
const SEEDS = [
  new THREE.Vector3(+L, 0, +L),
  new THREE.Vector3(-L, 0, +L),
  new THREE.Vector3(-L, 0, -L),
  new THREE.Vector3(+L, 0, -L),
]

// ─── Génération des positions cibles ─────────────────────────────────────────
function buildFramePositions(): THREE.Vector3[] {
  const seen = new Set<string>()
  const out: THREE.Vector3[] = []

  const add = (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`
    if (!seen.has(key)) { seen.add(key); out.push(new THREE.Vector3(x, y, z)) }
  }

  const xs: number[] = [], zs: number[] = [], ys: number[] = []
  for (let v = -L; v <= L + 0.5; v += STEP) { xs.push(Math.round(v)); zs.push(Math.round(v)) }
  for (let v = 0;  v <= H + 0.5; v += STEP) ys.push(Math.round(v))

  // 4 piliers verticaux aux coins
  for (const x of [-L, L]) for (const z of [-L, L]) for (const y of ys) add(x, y, z)
  // 4 arêtes supérieures (y = H)
  for (const x of xs) for (const z of [-L, L]) add(x, H, z)
  for (const x of [-L, L]) for (const z of zs) add(x, H, z)
  // 4 arêtes inférieures (y = 0)
  for (const x of xs) for (const z of [-L, L]) add(x, 0, z)
  for (const x of [-L, L]) for (const z of zs) add(x, 0, z)

  return out
}

// ─── Type BuildCube ───────────────────────────────────────────────────────────
type BuildCube = {
  targetPos:     THREE.Vector3
  spawnPos:      THREE.Vector3
  seedIdx:       number
  baseSpawnT:    number    // temps de pop à speed=1
  baseTravelDur: number    // durée trajet à speed=1
  mesh:          THREE.Mesh | null
}

/**
 * Retourne la chaleur perçue (0=froid/posé, 1=chaud/en route)
 * ou -1 si pas encore apparu à tEmit.
 */
function sampleCube(
  c: BuildCube, tEmit: number, speed: number, out: THREE.Vector3,
): number {
  const spawnT    = c.baseSpawnT    / speed
  const travelDur = c.baseTravelDur / speed
  if (tEmit < spawnT) return -1
  const age = tEmit - spawnT
  if (age >= travelDur) { out.copy(c.targetPos); return 0 }
  const ease = 1 - Math.pow(1 - age / travelDur, 3)
  out.lerpVectors(c.spawnPos, c.targetPos, ease)
  return 1 - age / travelDur  // 1 = juste né, 0 = juste arrivé
}

// ─── PRNG déterministe ────────────────────────────────────────────────────────
let _seed = 0
function sRand(): number {
  _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff
  return _seed / 0x7fffffff
}

// ─── Initialisation du pool ───────────────────────────────────────────────────
function makeBuildCubes(): BuildCube[] {
  _seed = 31  // seed déterministe
  const positions = buildFramePositions()

  // Trier par distance au seed le plus proche → les cubes proches du seed popent d'abord
  return positions.map(target => {
    let seedIdx = 0, seedDist = Infinity
    SEEDS.forEach((s, i) => {
      const d = s.distanceTo(target); if (d < seedDist) { seedDist = d; seedIdx = i }
    })
    const seed = SEEDS[seedIdx]

    // Spawn au-dessus du seed avec gigue
    const spawnPos = new THREE.Vector3(
      seed.x + (sRand() - 0.5) * 14,
      seed.y + sRand() * 8 + 2,
      seed.z + (sRand() - 0.5) * 14,
    )

    // Temps de pop : distance depuis le seed → cubes proches en premier
    // Plage : 0.5s (pilier du coin) → BUILD_TOTAL (arête opposée)
    const distFromSeed = seed.distanceTo(target)
    const maxDist      = Math.sqrt((2 * L) ** 2 + H ** 2)
    const baseSpawnT   = 0.5 + (distFromSeed / maxDist) * BUILD_TOTAL * 0.85 + sRand() * 8

    return {
      targetPos:     target.clone(),
      spawnPos,
      seedIdx,
      baseSpawnT,
      baseTravelDur: BASE_TRAVEL + sRand() * 2.5,
      mesh:          null,
    }
  })
}

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const C_COLD  = new THREE.Color('#2277cc')
const C_WARM  = new THREE.Color('#66aaff')
const C_HOT   = new THREE.Color('#ffaa22')
const C_EMI_COLD = new THREE.Color('#112255')
const C_EMI_HOT  = new THREE.Color('#ffcc66')

function heatToColor(heat: number, col: THREE.Color, emi: THREE.Color) {
  if (heat < 0.5) {
    col.copy(C_COLD).lerp(C_WARM, heat * 2)
    emi.copy(C_EMI_COLD)
  } else {
    col.copy(C_WARM).lerp(C_HOT, (heat - 0.5) * 2)
    emi.copy(C_EMI_COLD).lerp(C_EMI_HOT, (heat - 0.5) * 2)
  }
}

// ─── Environnement ────────────────────────────────────────────────────────────
function SeedMarker({ pos }: { pos: THREE.Vector3 }) {
  return (
    <group position={pos.toArray()}>
      {/* Balise basse */}
      <mesh>
        <cylinderGeometry args={[0.5, 1.2, 4, 8]} />
        <meshStandardMaterial color="#0a1c40" emissive="#1144cc" emissiveIntensity={1.2} />
      </mesh>
      {/* Halo lumineux */}
      <pointLight color="#2255ff" intensity={14} distance={35} decay={2} position={[0, 3, 0]} />
      {/* Anneau au sol */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[6, 7.5, 32]} />
        <meshBasicMaterial color="#1133aa" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

function Environment() {
  return (
    <group>
      {/* Sol infini */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#04070e" roughness={0.97} />
      </mesh>
      {/* Grille fine */}
      <gridHelper args={[400, 80, '#0d1a30', '#0a1428']} position={[0, 0.01, 0]} />
      {/* 4 balises aux seeds */}
      {SEEDS.map((s, i) => <SeedMarker key={i} pos={s} />)}
    </group>
  )
}

function Stars() {
  const geo = useMemo(() => {
    const n = 3000, pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 500 + Math.random() * 600
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      pos[i*3]   = r * Math.sin(ph) * Math.cos(th)
      pos[i*3+1] = r * Math.sin(ph) * Math.sin(th) + 30
      pos[i*3+2] = r * Math.cos(ph)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  return (
    <points geometry={geo}>
      <pointsMaterial color="#9aaccc" size={0.7} sizeAttenuation transparent opacity={0.7} />
    </points>
  )
}

// ─── Simulation ───────────────────────────────────────────────────────────────
const _pos = new THREE.Vector3()
const _col = new THREE.Color()
const _emi = new THREE.Color()

interface SimProps {
  cSim:     number
  speed:    number
  distRef:  React.RefObject<HTMLSpanElement | null>
  builtRef: React.RefObject<HTMLSpanElement | null>
  phaseRef: React.RefObject<HTMLSpanElement | null>
}

function Simulation({ cSim, speed, distRef, builtRef, phaseRef }: SimProps) {
  const { scene, camera } = useThree()
  const tRef   = useRef(T_START)
  const cRef   = useRef(cSim);    cRef.current = cSim
  const spdRef = useRef(speed);   spdRef.current = speed
  const cubes  = useRef(makeBuildCubes())
  const keys   = useRef<Set<string>>(new Set())

  useEffect(() => {
    const dn = (e: KeyboardEvent) => keys.current.add(e.code)
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', dn)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    // Géométrie partagée pour tous les cubes
    const geo = new THREE.BoxGeometry(CUBE_R * 2, CUBE_R * 2, CUBE_R * 2)
    for (const c of cubes.current) {
      const mat = new THREE.MeshStandardMaterial({
        color:             C_COLD.clone(),
        emissive:          C_EMI_COLD.clone(),
        emissiveIntensity: 0.5,
        roughness:         0.35,
        metalness:         0.75,
      })
      const m = new THREE.Mesh(geo, mat)
      m.castShadow  = true
      m.receiveShadow = true
      m.visible     = false
      scene.add(m)
      c.mesh = m
    }
    return () => { cubes.current.forEach(c => c.mesh && scene.remove(c.mesh)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useFrame((_state, delta) => {
    tRef.current += Math.min(delta, 0.05)
    const t   = tRef.current
    const c   = cRef.current
    const spd = spdRef.current
    const cam = camera

    // ── Mouvement WASD + Espace/Shift ────────────────────────────────────
    const mv = new THREE.Vector3()
    if (keys.current.has('KeyW') || keys.current.has('ArrowUp'))    mv.z -= 1
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown'))  mv.z += 1
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft'))  mv.x -= 1
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) mv.x += 1

    if (mv.lengthSq() > 0) {
      // Mouvement horizontal seulement (appliquer orientation caméra puis annuler Y)
      mv.normalize().applyQuaternion(cam.quaternion)
      mv.y = 0
      if (mv.lengthSq() > 0) mv.normalize()
      cam.position.addScaledVector(mv, MOVE_SPEED * delta)
    }
    // Vertical séparé
    if (keys.current.has('Space'))                                cam.position.y += MOVE_SPEED * 0.5 * delta
    if (keys.current.has('ShiftLeft') || keys.current.has('ShiftRight')) cam.position.y -= MOVE_SPEED * 0.5 * delta
    if (cam.position.y < 1.8) cam.position.y = 1.8

    // ── Mise à jour des cubes ─────────────────────────────────────────────
    let nVisible = 0, nTotal = cubes.current.length

    for (const cube of cubes.current) {
      if (!cube.mesh) continue

      // Retard : distance à la position cible (excellente approx pour objets lents)
      const dist  = cam.position.distanceTo(cube.targetPos)
      const tEmit = Math.max(0, t - dist / c)
      const heat  = sampleCube(cube, tEmit, spd, _pos)

      if (heat < 0) { cube.mesh.visible = false; continue }

      cube.mesh.visible = true
      cube.mesh.position.copy(_pos)
      nVisible++

      // Couleur selon chaleur perçue
      heatToColor(heat, _col, _emi)
      const mat = cube.mesh.material as THREE.MeshStandardMaterial
      mat.color.copy(_col)
      mat.emissive.copy(_emi)
      mat.emissiveIntensity = heat > 0.05
        ? 0.5 + heat * 3.0   // cubes en transit : très lumineux
        : 0.4                  // cubes posés : lueur froide subtile
      mat.roughness  = 0.3 + (1 - heat) * 0.25
      mat.metalness  = 0.7 + heat * 0.2
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    const distC = new THREE.Vector3(0, H / 2, 0).distanceTo(cam.position)
    if (distRef.current)  distRef.current.textContent  = distC.toFixed(0)
    if (builtRef.current) {
      const pct = Math.round(nVisible / nTotal * 100)
      builtRef.current.textContent = `${nVisible} / ${nTotal}  (${pct}%)`
    }
    if (phaseRef.current) {
      const pct = nTotal > 0 ? nVisible / nTotal : 0
      let label = 'VIDE', col = '#1a2a50'
      if      (pct > 0.95) { label = 'COMPLET ◈';  col = '#88ccff' }
      else if (pct > 0.65) { label = 'ASSEMBLAGE'; col = '#55aaff' }
      else if (pct > 0.35) { label = 'CROISSANCE'; col = '#ffaa44' }
      else if (pct > 0.05) { label = 'ÉMERGENCE';  col = '#ff7733' }
      phaseRef.current.textContent  = label
      phaseRef.current.style.color  = col
    }
  })

  return null
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function HUD({
  cSim, setCSim, speed, setSpeed,
  onBack, locked,
  distRef, builtRef, phaseRef, containerRef,
}: {
  cSim: number; setCSim: (v: number) => void
  speed: number; setSpeed: (v: number) => void
  onBack: () => void; locked: boolean
  distRef:  React.RefObject<HTMLSpanElement | null>
  builtRef: React.RefObject<HTMLSpanElement | null>
  phaseRef: React.RefObject<HTMLSpanElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const lag = (START_Z / Math.max(cSim, 0.5)).toFixed(1)

  return (
    <div style={{ fontFamily: "'SF Mono','Fira Code',monospace", position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <ScenePanel
        title="V5 — Temporal Construction"
        onBack={onBack}
        containerRef={containerRef}
        theme="blue"
        filename="v5-temporal-construction.webm"
      >
        {/* ── c_sim ─────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: '#a0b4d8' }}>c<sub>sim</sub> — vitesse lumière</span>
            <span style={{ color: '#66aaff', fontWeight: 700, fontSize: 15 }}>
              {cSim.toFixed(1)}<span style={{ fontSize: 11, color: '#2a4070' }}> u/s</span>
            </span>
          </div>
          <input type="range" min={1} max={80} step={0.5} value={cSim}
            onChange={e => setCSim(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#4488ff', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#1e2e50', marginTop: 3 }}>
            <span>lent — décalage profond</span>
            <span>rapide — quasi-instantané</span>
          </div>
        </div>

        {/* ── Vitesse construction ──────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: '#a0b4d8' }}>vitesse construction</span>
            <span style={{ color: '#ffaa44', fontWeight: 700, fontSize: 15 }}>×{speed.toFixed(1)}</span>
          </div>
          <input type="range" min={0.2} max={5} step={0.1} value={speed}
            onChange={e => setSpeed(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#ffaa44', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#1e2e50', marginTop: 3 }}>
            <span>lente — émergence douce</span>
            <span>rapide — cristallisation</span>
          </div>
        </div>

        {/* ── Indicateurs live ──────────────────────────── */}
        <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.45)', borderRadius: 7, fontSize: 13, lineHeight: 2.5, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#1e3060' }}>dist. centre</span>
            <span style={{ color: '#b0c8e8' }}><span ref={distRef as React.RefObject<HTMLSpanElement>}>—</span> u</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#1e3060' }}>cubes perçus</span>
            <span style={{ color: '#b0c8e8' }}><span ref={builtRef as React.RefObject<HTMLSpanElement>}>—</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#1e3060' }}>phase perçue</span>
            <span ref={phaseRef as React.RefObject<HTMLSpanElement>} style={{ fontWeight: 700 }}>—</span>
          </div>
        </div>

        {/* ── Notes ─────────────────────────────────────── */}
        <div style={{ padding: '9px 11px', background: 'rgba(40,80,160,0.07)', borderRadius: 7, fontSize: 12, color: '#2a4070', lineHeight: 2.2 }}>
          Retard départ : <span style={{ color: '#66aaff' }}>{lag}s</span><br />
          <span style={{ color: '#55aaff' }}>Avancer</span> → structure s'assemble<br />
          <span style={{ color: '#4477cc' }}>Reculer</span> → structure se défait<br />
          <span style={{ color: '#ffaa44' }}>Orange</span> = cube en route (passé vu)<br />
          <span style={{ color: '#66aaff' }}>Bleu</span> = cube posé (présent vu)<br />
          <span style={{ color: '#1a2a40', fontSize: 11 }}>
            {locked ? 'ESC — libérer souris' : 'Cliquer · WASD · Espace/Shift'}
          </span>
        </div>
      </ScenePanel>

      {locked && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
          <div style={{ width: 1, height: 16, background: 'rgba(80,150,255,0.55)', margin: '0 auto' }} />
          <div style={{ width: 16, height: 1, background: 'rgba(80,150,255,0.55)', marginTop: -8.5 }} />
        </div>
      )}

      {!locked && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(2,5,14,0.94)', border: '1px solid rgba(60,120,255,0.42)', borderRadius: 14, padding: '26px 54px', textAlign: 'center', backdropFilter: 'blur(18px)' }}>
            <div style={{ color: '#4488ff', fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 10 }}>Temporal Construction</div>
            <div style={{ color: '#c8d8ff', fontSize: 23, fontWeight: 700, marginBottom: 10 }}>Cliquer pour explorer</div>
            <div style={{ color: '#2a4060', fontSize: 13 }}>WASD · Souris · Espace / Shift · ESC</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function V5Scene({ onBack }: { onBack: () => void }) {
  const [cSim,  setCSim]  = useState(15)
  const [speed, setSpeed] = useState(1.2)
  const [locked, setLocked] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const distRef      = useRef<HTMLSpanElement>(null)
  const builtRef     = useRef<HTMLSpanElement>(null)
  const phaseRef     = useRef<HTMLSpanElement>(null)
  const onLock   = useCallback(() => setLocked(true),  [])
  const onUnlock = useCallback(() => setLocked(false), [])

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', background: '#020408', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 8, START_Z], fov: 68, near: 0.1, far: 1500 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        shadows
      >
        <color attach="background" args={['#020408']} />
        <fog attach="fog" args={['#05090f', 250, 700]} />

        {/* Éclairage */}
        <hemisphereLight args={['#0c1f50', '#000000', 0.7]} />
        <ambientLight intensity={0.5} color="#1a2a60" />
        <directionalLight
          position={[60, 80, 40]} intensity={1.1} color="#c0d0ff"
          castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-far={600} shadow-camera-left={-200} shadow-camera-right={200}
          shadow-camera-top={200} shadow-camera-bottom={-200}
        />
        {/* Fill léger depuis devant */}
        <pointLight position={[0, 20, START_Z * 0.6]} intensity={2.5} color="#2244aa" distance={200} />
        {/* Lumière centrale du cadre — pulsation douce */}
        <pointLight position={[0, H / 2, 0]} intensity={5} color="#3366cc" distance={120} decay={1.6} />

        <Stars />
        <Environment />

        <Simulation
          cSim={cSim} speed={speed}
          distRef={distRef} builtRef={builtRef} phaseRef={phaseRef}
        />

        <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
      </Canvas>

      <HUD
        cSim={cSim} setCSim={setCSim}
        speed={speed} setSpeed={setSpeed}
        onBack={onBack} locked={locked}
        distRef={distRef} builtRef={builtRef} phaseRef={phaseRef}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
      />
    </div>
  )
}
