/**
 * V2 — Light Cone Engine
 *
 * Each object stores a ring-buffer of past positions.
 * The observer sees each object at its RETARDED POSITION (solid sphere).
 *
 * Between retarded pos and actual pos:
 *   → a glowing halo trail sampled from the history buffer.
 *   → the trail length = c_sim × Δt_travel  (visible light-travel gap)
 *   → lower c_sim  →  longer, brighter trail
 *   → higher c_sim →  tiny / invisible trail (nearly instantaneous)
 *
 * Core equation: ‖ pos(t_emit) − observer ‖ = c_sim × (t_now − t_emit)
 * Solved by bisection (24 iterations).
 */

import { useRef, useState, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { HistoryBuffer, solveRetardedPosition } from './RetardedPosition'

// ─── Config ───────────────────────────────────────────────────────────────────
const NUM_OBJECTS  = 10
const ARENA        = 13
const TRAIL_NODES  = 16    // halo sample points between retarded → actual pos

// ─── Object state ─────────────────────────────────────────────────────────────
type Obj = {
  actualPos:   THREE.Vector3
  velocity:    THREE.Vector3
  retardedPos: THREE.Vector3
  tEmit:       number
  color:       THREE.Color
  history:     HistoryBuffer
}

function makeObjects(): Obj[] {
  return Array.from({ length: NUM_OBJECTS }, (_, i) => {
    const angle = (i / NUM_OBJECTS) * Math.PI * 2
    const r     = 4 + Math.random() * 6
    const speed = 2 + Math.random() * 3   // slower: 2–5 u/s keeps gaps proportional
    const va    = Math.random() * Math.PI * 2
    return {
      actualPos:   new THREE.Vector3(Math.cos(angle) * r, (Math.random() - 0.5) * 6, Math.sin(angle) * r),
      velocity:    new THREE.Vector3(Math.cos(va) * speed, (Math.random() - 0.5) * 2, Math.sin(va) * speed),
      retardedPos: new THREE.Vector3(),
      tEmit:       0,
      color:       new THREE.Color().setHSL(i / NUM_OBJECTS, 0.85, 0.58),
      history:     new HistoryBuffer(1024),
    }
  })
}

// ─── Per-object Three.js handle ───────────────────────────────────────────────
type ObjHandle = {
  solid:   THREE.Mesh          // perceived position (retarded) — bright, opaque
  ghost:   THREE.Mesh          // actual position — faint, semi-transparent
  trail:   THREE.Mesh[]        // TRAIL_NODES dots tracing history: perceived → actual
}

function buildHandle(color: THREE.Color, scene: THREE.Scene): ObjHandle {
  // Solid sphere — where you SEE the object (retarded position)
  const solid = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 14, 10),
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.1,
    })
  )
  scene.add(solid)

  // Ghost sphere — where the object ACTUALLY IS (actual position)
  // Semi-transparent, same colour, slightly smaller
  const ghost = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 12, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  scene.add(ghost)

  // Trail dots — history samples between t_emit and t_now
  // Dot 0 = at perceived position, dot N-1 = at actual position
  const trail: THREE.Mesh[] = []
  for (let k = 0; k < TRAIL_NODES; k++) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat)
    scene.add(dot)
    trail.push(dot)
  }

  return { solid, ghost, trail }
}

// ─── Simulation component ─────────────────────────────────────────────────────
const _ret  = new THREE.Vector3()
const _samp = new THREE.Vector3()

function Simulation({ cSim }: { cSim: number }) {
  const { camera, scene } = useThree()
  const objs    = useRef<Obj[]>(makeObjects())
  const handles = useRef<ObjHandle[]>([])
  const tRef    = useRef(0)
  const cSimRef = useRef(cSim)
  cSimRef.current = cSim

  // Build Three.js objects once on mount
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

      // ── Physics ───────────────────────────────────────────────────────────
      o.actualPos.addScaledVector(o.velocity, delta)
      for (const ax of ['x', 'y', 'z'] as const) {
        if (Math.abs(o.actualPos[ax]) > ARENA) {
          o.velocity[ax]  *= -1
          o.actualPos[ax]  = Math.sign(o.actualPos[ax]) * ARENA
        }
      }
      o.history.push(o.actualPos, t)

      // ── Retarded position ─────────────────────────────────────────────────
      const ok = solveRetardedPosition(o.history, obs, t, c, _ret)
      if (ok) {
        o.retardedPos.copy(_ret)
        // Estimate t_emit from distance / c
        const dist = obs.distanceTo(o.retardedPos)
        o.tEmit = t - dist / c
      } else {
        o.retardedPos.copy(o.actualPos)
        o.tEmit = t
      }

      const gap    = o.actualPos.distanceTo(o.retardedPos)
      const tDelay = Math.max(t - o.tEmit, 0)

      // trailStrength: 0 at high c (fast light, no delay) → 1 at low c (heavy delay)
      // relGap = gap / c is large when c small, tiny when c large
      const relGap = gap / Math.max(c, 0.5)
      const THRESH = 0.04
      const strength = Math.min(Math.max((relGap - THRESH) / 0.4, 0), 1)  // 0..1
      const showTrail = ok && relGap > THRESH

      // ── Solid sphere — perceived position (retarded), always visible ──────
      h.solid.position.copy(o.retardedPos)
      ;(h.solid.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.4 + strength * 0.5   // glows slightly more when heavily retarded

      // ── Ghost sphere — ACTUAL position, fades in as trail grows ───────────
      h.ghost.position.copy(o.actualPos)
      ;(h.ghost.material as THREE.MeshBasicMaterial).opacity = strength * 0.45

      // ── Ghost trail dots — history samples perceived → actual ─────────────
      for (let k = 0; k < TRAIL_NODES; k++) {
        const frac    = k / (TRAIL_NODES - 1)   // 0 = at perceived pos, 1 = at actual pos
        const tSample = o.tEmit + frac * tDelay
        const ok2     = o.history.sampleAt(tSample, _samp)

        const dot = h.trail[k]
        if (!ok2 || !showTrail) { dot.visible = false; continue }
        dot.visible = true
        dot.position.copy(_samp)
        dot.scale.setScalar(1)   // même taille que la sphère solide

        // Opacité: max au point perçu (frac=0), s'estompe vers la position réelle (frac=1)
        // Courbe quadratique → dégradé doux
        const opacity = (1 - frac) * (1 - frac) * strength * 0.55
        ;(dot.material as THREE.MeshBasicMaterial).opacity = Math.max(0, opacity)
      }
    }
  })

  return null   // Three objects added directly to scene in useEffect
}

// ─── Arena box ────────────────────────────────────────────────────────────────
function Arena() {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(ARENA * 2, ARENA * 2, ARENA * 2)), [])
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#0d1a33" transparent opacity={0.7} />
    </lineSegments>
  )
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
const S: React.CSSProperties = {
  fontFamily: "'SF Mono','Fira Code',monospace",
  fontSize: 12, color: '#c8cfe8',
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
      <span style={{ color: '#8090b0', fontSize: 11 }}>{label}</span>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 32, height: 18, borderRadius: 9, cursor: 'pointer', position: 'relative',
          background: checked ? '#6b8cff' : 'rgba(100,120,200,0.2)',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14,
          borderRadius: '50%', background: 'white', transition: 'left 0.18s',
        }} />
      </div>
    </div>
  )
}

function HUD({ cSim, setCSim, showGrid, setShowGrid, onBack }: {
  cSim: number; setCSim: (v: number) => void
  showGrid: boolean; setShowGrid: (v: boolean) => void
  onBack: () => void
}) {
  return (
    <div style={{ ...S, position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>

      {/* Back */}
      <button onClick={onBack} style={{
        position: 'absolute', top: 14, right: 14, pointerEvents: 'all',
        background: 'rgba(10,10,20,0.88)', border: '1px solid rgba(100,120,200,0.25)',
        borderRadius: 6, color: '#6b8cff', fontFamily: 'inherit', fontSize: 11,
        padding: '6px 14px', cursor: 'pointer', letterSpacing: '0.08em', backdropFilter: 'blur(8px)',
      }}>← Hub</button>

      {/* Controls */}
      <div style={{ position: 'absolute', top: 16, left: 16, width: 250, pointerEvents: 'all' }}>
        <div style={{
          background: 'rgba(8,10,22,0.92)', border: '1px solid rgba(100,120,200,0.22)',
          borderRadius: 10, padding: '16px 18px', backdropFilter: 'blur(14px)',
        }}>
          <div style={{ color: '#6b8cff', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid rgba(100,120,200,0.12)' }}>
            V2 — Light Cone Engine
          </div>

          {/* c_sim slider */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#c8cfe8', fontSize: 11 }}>c<sub>sim</sub> — speed of light</span>
              <span style={{ color: '#ff8c6b', fontWeight: 'bold', fontSize: 13 }}>{cSim.toFixed(1)}<span style={{ fontSize: 10, color: '#5a6080' }}> u/s</span></span>
            </div>
            <input type="range" min={1} max={60} step={0.5} value={cSim}
              onChange={e => setCSim(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#6b8cff', cursor: 'pointer' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#3a4a60', marginTop: 2 }}>
              <span>slow — large halo</span>
              <span>fast — no halo</span>
            </div>
          </div>

          <Toggle label="Show grid" checked={showGrid} onChange={setShowGrid} />

          {/* Live readout */}
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.35)', borderRadius: 6, fontSize: 10, color: '#5060a0', lineHeight: 1.9 }}>
            <span style={{ color: '#6b8cff' }}>‖ pos(t<sub>emit</sub>) − obs ‖</span> = c × Δt<br />
            <span style={{ color: '#c8cfe8' }}>Halo length</span> ∝ <span style={{ color: '#ff8c6b' }}>1 / c<sub>sim</sub></span><br />
            Bisection · 24 iter · buf 1024
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(8,10,22,0.92)', border: '1px solid rgba(100,120,200,0.22)',
        borderRadius: 10, padding: '14px 18px', backdropFilter: 'blur(14px)',
        maxWidth: 240,
      }}>
        <div style={{ color: '#6b8cff', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>Legend</div>
        {[
          { icon: '●', color: '#aabbff', text: 'Solid sphere — where you see it (retarded pos)' },
          { icon: '○', color: '#6680cc', text: 'Ghost sphere — where it actually is now' },
          { icon: '·', color: '#8899cc', text: 'Trail — light path, fades toward actual pos' },
        ].map(({ icon, color, text }) => (
          <div key={text} style={{ display: 'flex', gap: 8, marginBottom: 7, alignItems: 'flex-start', fontSize: 11, color: '#7080a0' }}>
            <span style={{ color, flexShrink: 0, fontSize: 14, lineHeight: 1.2 }}>{icon}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>

      {/* Hint bottom right */}
      <div style={{
        position: 'absolute', bottom: 16, right: 16,
        background: 'rgba(8,10,22,0.92)', border: '1px solid rgba(100,120,200,0.22)',
        borderRadius: 10, padding: '12px 16px', backdropFilter: 'blur(14px)',
        fontSize: 11, color: '#6070a0', lineHeight: 1.8, maxWidth: 210,
      }}>
        ↓ c<sub>sim</sub> → longer halo<br />
        ↑ c<sub>sim</sub> → halo vanishes<br />
        <span style={{ color: '#ff8c6b' }}>Real physics</span> — at a scale<br />where light delay is visible.<br /><br />
        <span style={{ color: '#3a4a60', fontSize: 10 }}>Drag to orbit · Scroll to zoom</span>
      </div>

      {/* Center crosshair label */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
        <div style={{ width: 1, height: 12, background: 'rgba(107,140,255,0.3)', margin: '0 auto' }} />
        <div style={{ width: 12, height: 1, background: 'rgba(107,140,255,0.3)', marginTop: -6.5 }} />
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function V2Scene({ onBack }: { onBack: () => void }) {
  const [cSim, setCSim]         = useState(8)
  const [showGrid, setShowGrid] = useState(true)

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#04060f', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 14, 32], fov: 58, near: 0.1, far: 500 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={['#04060f']} />

        {/* Lighting */}
        <ambientLight intensity={0.5} color="#2040a0" />
        <pointLight position={[0,  25,  0]}  intensity={2.5} color="#5070ff" distance={80} />
        <pointLight position={[20, -8, 20]}  intensity={1.2} color="#ff5030" distance={60} />
        <pointLight position={[-20,-8,-20]}  intensity={1.2} color="#30ff80" distance={60} />

        <Arena />
        {showGrid && <gridHelper args={[ARENA * 2, 20, '#0a1428', '#0a1428']} position={[0, -ARENA, 0]} />}

        <Simulation cSim={cSim} />

        <OrbitControls enableDamping dampingFactor={0.06} />
      </Canvas>

      <HUD cSim={cSim} setCSim={setCSim} showGrid={showGrid} setShowGrid={setShowGrid} onBack={onBack} />
    </div>
  )
}
