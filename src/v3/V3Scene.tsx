/**
 * V3 — Cyclic Aggregates
 *
 * Same retarded-position physics as V2 (bisection solver + history ring buffer).
 * Objects follow a scripted cycle:
 *   SCATTER → GATHER → MERGE → EXPLODE → SCATTER → …
 *
 * The key insight: the observer sees each object at its RETARDED position.
 * A distant object is seen at an earlier phase of the cycle.
 * Moving the camera closer "advances" what you observe; moving away "goes back in time".
 *
 * ‖ pos(t_emit) − observer ‖ = c_sim × (t_now − t_emit)   [bisection, 24 iter]
 */

import { useRef, useState, useEffect, useMemo } from 'react'
import { ScenePanel } from '../components/ScenePanel'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { HistoryBuffer, solveRetardedPosition } from '../v2/RetardedPosition'

// ─── Config ───────────────────────────────────────────────────────────────────
const NUM_OBJECTS    = 32
const CYCLE          = 18      // seconds per full cycle
const SPREAD         = 22      // world-unit radius of scene
const TRAIL_NODES    = 14

// Cycle phase boundaries (fraction of CYCLE)
const P_GATHER_START = 0.13
const P_GATHER_END   = 0.50
const P_MERGE_END    = 0.63
// EXPLODE:  0.63 → 1.00

// ─── Maths helpers ────────────────────────────────────────────────────────────
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// ─── Per-object scripted params ────────────────────────────────────────────────
type ObjParams = {
  homeDir:  THREE.Vector3   // unit vector toward home (SCATTER target)
  blastDir: THREE.Vector3   // unit vector toward explosion target
  homeR:    number          // radius of home position
  phaseOff: number          // [0, 0.08] timing offset — slight desync between objects
}

/**
 * Scripted position at simulation time t.
 * Purely deterministic: same t → same pos. No integration needed.
 */
function scriptedPos(p: ObjParams, t: number, out: THREE.Vector3): void {
  // Each object is slightly offset in the cycle so they don't move in perfect lockstep
  const cycleT = ((t / CYCLE + p.phaseOff) % 1 + 1) % 1

  const homeX = p.homeDir.x * p.homeR
  const homeY = p.homeDir.y * p.homeR * 0.55   // flatten vertically
  const homeZ = p.homeDir.z * p.homeR
  const blastX = p.blastDir.x * p.homeR * 1.15
  const blastY = p.blastDir.y * p.homeR * 0.55
  const blastZ = p.blastDir.z * p.homeR * 1.15

  if (cycleT < P_GATHER_START) {
    // ── SCATTER ── at home position, gentle breathing
    const breath = 1 + Math.sin(t * 0.8 + p.phaseOff * 30) * 0.04
    out.set(homeX * breath, homeY * breath, homeZ * breath)

  } else if (cycleT < P_GATHER_END) {
    // ── GATHER ── spiral inward toward center
    const u = smoothstep(P_GATHER_START, P_GATHER_END, cycleT)
    // Smooth cubic ease-in (accelerates toward center)
    const ease = u * u * (3 - 2 * u)
    const remaining = 1 - ease
    // Orbital spiral during infall (fades as they get close)
    const spiral = Math.sin(u * Math.PI) * 5 * remaining
    out.set(
      homeX * remaining + Math.sin(u * Math.PI * 2.5 + p.phaseOff * Math.PI * 4) * spiral,
      homeY * remaining,
      homeZ * remaining + Math.cos(u * Math.PI * 2.5 + p.phaseOff * Math.PI * 4) * spiral,
    )

  } else if (cycleT < P_MERGE_END) {
    // ── MERGE ── dense oscillation at center
    const inner = 1.6
    out.set(
      Math.sin(t * 5.3 + p.phaseOff * 22) * inner,
      Math.cos(t * 4.1 + p.phaseOff * 17) * inner,
      Math.sin(t * 6.7 + p.phaseOff * 28) * inner,
    )

  } else {
    // ── EXPLODE ── blast outward to explosion target, cubic ease-out
    const u = smoothstep(P_MERGE_END, 1.0, cycleT)
    const ease = 1 - Math.pow(1 - u, 3)
    out.set(blastX * ease, blastY * ease, blastZ * ease)
  }
}

// Current phase name + accent color (for HUD display)
function phaseMeta(t: number): { name: string; color: string; pct: number } {
  const cycleT = (t / CYCLE) % 1
  if (cycleT < P_GATHER_START) return { name: 'SCATTER', color: '#6b8cff', pct: cycleT / P_GATHER_START }
  if (cycleT < P_GATHER_END)   return { name: 'GATHER',  color: '#ffcc44', pct: (cycleT - P_GATHER_START) / (P_GATHER_END - P_GATHER_START) }
  if (cycleT < P_MERGE_END)    return { name: 'MERGE',   color: '#ff44aa', pct: (cycleT - P_GATHER_END)   / (P_MERGE_END  - P_GATHER_END) }
  return                              { name: 'EXPLODE', color: '#ff7744', pct: (cycleT - P_MERGE_END)   / (1            - P_MERGE_END) }
}

// ─── Object state ─────────────────────────────────────────────────────────────
type Obj = {
  actualPos:   THREE.Vector3
  retardedPos: THREE.Vector3
  tEmit:       number
  color:       THREE.Color
  history:     HistoryBuffer
  params:      ObjParams
}

function makeObjects(): Obj[] {
  return Array.from({ length: NUM_OBJECTS }, (_, i) => {
    // Evenly spread on sphere via golden angle (no clustering at poles)
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const y     = 1 - (i / (NUM_OBJECTS - 1)) * 2     // -1..1
    const r     = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = goldenAngle * i

    const homeDir = new THREE.Vector3(r * Math.cos(theta), y * 0.5, r * Math.sin(theta)).normalize()

    // Blast direction — different hemisphere so explosion is visually distinct from home
    const blastTheta = theta + Math.PI * (0.5 + 0.7 * ((i * 11 + 5) % NUM_OBJECTS) / NUM_OBJECTS)
    const blastY     = -y * 0.4 + Math.sin(i * 1.9) * 0.4
    const blastR     = Math.sqrt(Math.max(0, 1 - blastY * blastY))
    const blastDir   = new THREE.Vector3(blastR * Math.cos(blastTheta), blastY * 0.5, blastR * Math.sin(blastTheta)).normalize()

    const homeR    = SPREAD * (0.65 + 0.35 * Math.abs(Math.sin(i * 2.1)))
    const phaseOff = (i / NUM_OBJECTS) * 0.07   // ≤7% stagger across all objects

    const params: ObjParams = { homeDir, blastDir, homeR, phaseOff }

    const startPos = new THREE.Vector3()
    scriptedPos(params, 0, startPos)

    return {
      actualPos:   startPos.clone(),
      retardedPos: startPos.clone(),
      tEmit:       0,
      color:       new THREE.Color().setHSL(i / NUM_OBJECTS, 0.88, 0.60),
      history:     new HistoryBuffer(1024),
      params,
    }
  })
}

// ─── Three.js handles ─────────────────────────────────────────────────────────
type ObjHandle = {
  solid: THREE.Mesh
  ghost: THREE.Mesh
  trail: THREE.Mesh[]
}

function buildHandle(color: THREE.Color, scene: THREE.Scene): ObjHandle {
  const solid = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 14, 10),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.1,
    })
  )
  scene.add(solid)

  const ghost = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 12, 8),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  )
  scene.add(ghost)

  const trail: THREE.Mesh[] = []
  for (let k = 0; k < TRAIL_NODES; k++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 10, 7),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    )
    scene.add(dot)
    trail.push(dot)
  }

  return { solid, ghost, trail }
}

// ─── Environment ──────────────────────────────────────────────────────────────
function Starfield() {
  const geo = useMemo(() => {
    const n   = 2400
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r     = 180 + Math.random() * 260
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  return (
    <points geometry={geo}>
      <pointsMaterial color="#8898cc" size={0.45} sizeAttenuation transparent opacity={0.65} />
    </points>
  )
}

function GridFloor() {
  return (
    <gridHelper
      args={[SPREAD * 2.4, 28, '#0d1630', '#0a1020']}
      position={[0, -SPREAD * 0.56, 0]}
    />
  )
}

// ─── Simulation ───────────────────────────────────────────────────────────────
const _ret  = new THREE.Vector3()
const _samp = new THREE.Vector3()

interface SimProps {
  cSim: number
  phaseRef: React.RefObject<HTMLSpanElement | null>
  barRef:   React.RefObject<HTMLDivElement | null>
}

function Simulation({ cSim, phaseRef, barRef }: SimProps) {
  const { camera, scene } = useThree()
  const objs    = useRef<Obj[]>(makeObjects())
  const handles = useRef<ObjHandle[]>([])
  const tRef    = useRef(0)
  const cSimRef = useRef(cSim)
  cSimRef.current = cSim

  useEffect(() => {
    const built = objs.current.map(o => buildHandle(o.color, scene))
    handles.current = built
    return () => {
      for (const h of built) {
        scene.remove(h.solid)
        scene.remove(h.ghost)
        for (const d of h.trail) scene.remove(d)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useFrame((_, delta) => {
    tRef.current += Math.min(delta, 0.05)
    const t   = tRef.current
    const c   = cSimRef.current
    const obs = camera.position
    const os  = objs.current
    const hs  = handles.current
    if (hs.length === 0) return

    for (let i = 0; i < os.length; i++) {
      const o = os[i]
      const h = hs[i]

      // ── Scripted actual position ───────────────────────────────────────────
      scriptedPos(o.params, t, o.actualPos)
      o.history.push(o.actualPos, t)

      // ── Retarded position (bisection solver) ──────────────────────────────
      const ok = solveRetardedPosition(o.history, obs, t, c, _ret)
      if (ok) {
        o.retardedPos.copy(_ret)
        const dist = obs.distanceTo(o.retardedPos)
        o.tEmit = t - dist / c
      } else {
        o.retardedPos.copy(o.actualPos)
        o.tEmit = t
      }

      const gap    = o.actualPos.distanceTo(o.retardedPos)
      const tDelay = Math.max(t - o.tEmit, 0)

      const relGap   = gap / Math.max(c, 0.5)
      const THRESH   = 0.04
      const strength = Math.min(Math.max((relGap - THRESH) / 0.35, 0), 1)
      const showTrail = ok && relGap > THRESH

      // ── Emissive boost during MERGE phase (all objects glow brighter) ──────
      const { name: phase } = phaseMeta(t)
      const mergeGlow = phase === 'MERGE' ? 0.6 : 0
      ;(h.solid.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.4 + strength * 0.45 + mergeGlow

      // ── Solid sphere — perceived / retarded position ───────────────────────
      h.solid.position.copy(o.retardedPos)

      // ── Ghost sphere — actual position ────────────────────────────────────
      h.ghost.position.copy(o.actualPos)
      ;(h.ghost.material as THREE.MeshBasicMaterial).opacity = strength * 0.42

      // ── Trail — ghost copies from perceived → actual ───────────────────────
      for (let k = 0; k < TRAIL_NODES; k++) {
        const frac    = k / (TRAIL_NODES - 1)
        const tSample = o.tEmit + frac * tDelay
        const ok2     = o.history.sampleAt(tSample, _samp)

        const dot = h.trail[k]
        if (!ok2 || !showTrail) { dot.visible = false; continue }
        dot.visible = true
        dot.position.copy(_samp)
        dot.scale.setScalar(1)
        const opacity = (1 - frac) * (1 - frac) * strength * 0.50
        ;(dot.material as THREE.MeshBasicMaterial).opacity = Math.max(0, opacity)
      }
    }

    // ── Update HUD phase indicator (imperative — no React re-render) ──────────
    if (phaseRef.current || barRef.current) {
      const { name, color, pct } = phaseMeta(t)
      if (phaseRef.current) {
        phaseRef.current.textContent = name
        phaseRef.current.style.color = color
      }
      if (barRef.current) {
        barRef.current.style.width    = `${Math.round(pct * 100)}%`
        barRef.current.style.background = color
      }
    }
  })

  return null
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function HUD({ cSim, setCSim, onBack, phaseRef, barRef, containerRef }: {
  cSim: number; setCSim: (v: number) => void
  onBack: () => void
  phaseRef: React.RefObject<HTMLSpanElement | null>
  barRef:   React.RefObject<HTMLDivElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div style={{ fontFamily: "'SF Mono','Fira Code',monospace", position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <ScenePanel
        title="V3 — Cyclic Aggregates"
        onBack={onBack}
        containerRef={containerRef}
        theme="blue"
        filename="v3-cyclic-aggregates.webm"
      >
        {/* ── Indicateur de phase (mis à jour impérativement) ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#4a5888' }}>
            <span>Phase actuelle</span>
            <span ref={phaseRef as React.RefObject<HTMLSpanElement>} style={{ fontWeight: 700, letterSpacing: '0.08em' }}>SCATTER</span>
          </div>
          <div style={{ height: 4, background: 'rgba(100,120,200,0.15)', borderRadius: 2, overflow: 'hidden' }}>
            <div ref={barRef as React.RefObject<HTMLDivElement>} style={{ height: '100%', width: '0%', borderRadius: 2, transition: 'background 0.4s' }} />
          </div>
          <div style={{ fontSize: 11, color: '#2a3550', marginTop: 5 }}>
            SCATTER → GATHER → MERGE → EXPLODE
          </div>
        </div>

        {/* ── c_sim slider ──────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span style={{ color: '#b0bcde' }}>c<sub>sim</sub></span>
            <span style={{ color: '#ff8c6b', fontWeight: 700, fontSize: 15 }}>
              {cSim.toFixed(1)}<span style={{ fontSize: 11, color: '#5a6080' }}> u/s</span>
            </span>
          </div>
          <input type="range" min={1} max={60} step={0.5} value={cSim}
            onChange={e => setCSim(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#6b8cff', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#3a4a60', marginTop: 3 }}>
            <span>lent — retard profond</span>
            <span>rapide — pas de traînée</span>
          </div>
        </div>

        {/* ── Légende ───────────────────────────────────── */}
        <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.35)', borderRadius: 7, marginBottom: 12 }}>
          {[
            { icon: '●', color: '#aabbff', text: 'Position perçue (retardée)' },
            { icon: '○', color: '#6677bb', text: 'Position réelle (fantôme)' },
            { icon: '·', color: '#8090b8', text: 'Traînée — chemin lumière' },
          ].map(({ icon, color, text }) => (
            <div key={text} style={{ display: 'flex', gap: 8, marginBottom: 7, alignItems: 'center', fontSize: 13, color: '#7080a0' }}>
              <span style={{ color, flexShrink: 0, fontSize: 15 }}>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* ── Info retard ───────────────────────────────── */}
        <div style={{ padding: '9px 11px', background: 'rgba(107,140,255,0.06)', borderRadius: 7, fontSize: 12, color: '#4a5888', lineHeight: 2.0 }}>
          Retard max ≈ <span style={{ color: '#c8cfe8' }}>{(SPREAD / Math.max(cSim, 0.5)).toFixed(1)}s</span>
          {' / '}cycle {CYCLE}s<br />
          Objets distants : <span style={{ color: '#ff8c6b' }}>{Math.round(SPREAD / Math.max(cSim, 0.5) / CYCLE * 100)}%</span> de retard<br />
          <span style={{ color: '#3a4060' }}>Proches = présent · Loin = passé</span><br />
          <span style={{ color: '#2a3460' }}>Drag orbite · Scroll zoom</span>
        </div>
      </ScenePanel>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function V3Scene({ onBack }: { onBack: () => void }) {
  const [cSim, setCSim] = useState(6)
  const phaseRef     = useRef<HTMLSpanElement>(null)
  const barRef       = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', background: '#03050d', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 16, 38], fov: 55, near: 0.1, far: 800 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={['#03050d']} />

        <ambientLight intensity={0.35} color="#1830a0" />
        <pointLight position={[0,  30,  0]}  intensity={3.0} color="#4060ff" distance={120} />
        <pointLight position={[25, -10, 25]} intensity={1.5} color="#ff4020" distance={80} />
        <pointLight position={[-25,-10,-25]} intensity={1.5} color="#20ff80" distance={80} />

        <Starfield />
        <GridFloor />

        <Simulation cSim={cSim} phaseRef={phaseRef} barRef={barRef} />

        <OrbitControls enableDamping dampingFactor={0.05} maxDistance={120} />
      </Canvas>

      <HUD cSim={cSim} setCSim={setCSim} onBack={onBack} phaseRef={phaseRef} barRef={barRef}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>} />
    </div>
  )
}
