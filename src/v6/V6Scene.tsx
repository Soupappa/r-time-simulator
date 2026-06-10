/**
 * V6 — Relativistic Navigation
 *
 * Se balader dans un réseau cristallin infini (looping).
 * c_sim règle la vitesse de la lumière — plus c est bas, plus
 * la marche normale devient ultra-relativiste.
 *
 *  β = v_marche / c_sim  →  γ = 1 / √(1 − β²)
 *
 *  Effets appliqués le long de la direction du mouvement (vHat) :
 *  1. Contraction de Lorentz   r_‖' = r_‖ / γ
 *  2. Aberration relativiste   cos θ' = (cosθ − β)/(1 − β·cosθ)
 *  3. Décalage Doppler         k = 1/(γ(1 − β·cosθ))
 *
 * À l'arrêt → β=0 → grille normale.
 * En marchant à c_sim=14 u/s → β≈1 → contraction maximale.
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { ScenePanel } from '../components/ScenePanel'

// ─── Config ───────────────────────────────────────────────────────────────────
const MOVE_SPEED = 14      // vitesse de marche (u/s) — fixe
const SPACING    = 48      // espacement réseau (u)
const PERIOD_XZ  = SPACING * 7   // = 336 — boucle en X et Z
const PERIOD_Y   = SPACING * 4   // = 192 — boucle en Y
const CUBE_S     = 7       // demi-côté (cube = 14u de côté)
const START      = new THREE.Vector3(0, SPACING * 1.5, -80)

// Palette par colonne X (7 couleurs)
const PALETTE = [
  new THREE.Color('#ff2222'),
  new THREE.Color('#ff8800'),
  new THREE.Color('#ffdd00'),
  new THREE.Color('#22ff88'),
  new THREE.Color('#22ccff'),
  new THREE.Color('#3355ff'),
  new THREE.Color('#bb33ff'),
]

// Slots du réseau (7 × 4 × 7 = 196 cubes visibles simultanément)
const SLOTS_XZ = [-3, -2, -1, 0, 1, 2, 3]
const SLOTS_Y  = [0, 1, 2, 3]

// ─── Physique relativiste ─────────────────────────────────────────────────────

/** Position Lorentz-contractée le long de vHat. */
function lorentzPos(
  relPos: THREE.Vector3,   // position relative à l'observateur
  vHat: THREE.Vector3,     // direction du mouvement (normalisée)
  gamma: number,
  out: THREE.Vector3,
) {
  const rPar  = relPos.dot(vHat)                   // composante ‖
  const rPerp = out.copy(relPos).addScaledVector(vHat, -rPar)  // composante ⊥
  // r_par contractée, r_perp inchangée
  out.addScaledVector(vHat, rPar / gamma)
}

/** Facteur Doppler : k = 1/(γ(1−β·cosθ)). */
function doppler(cosTheta: number, beta: number, gamma: number): number {
  const d = 1 - beta * cosTheta
  return d < 1e-6 ? 99 : 1 / (gamma * d)
}

// Couleurs Doppler
const _BLUE  = new THREE.Color('#aae8ff')
const _RED   = new THREE.Color('#ff2200')

function dopplerColor(k: number, base: THREE.Color, out: THREE.Color) {
  if (k >= 1) {
    const t = Math.min((k - 1) / 3, 1)
    out.copy(base).lerp(_BLUE, t * t * 0.92)
  } else {
    const t = Math.min((1 - k) / 0.75, 1)
    out.copy(base).lerp(_RED, t * 0.88)
  }
}

function headlight(k: number): number {
  return Math.max(0.08, Math.min(k * k * k * 0.45, 5))
}

// Boucle périodique centrée sur 0
function loop(v: number, period: number): number {
  const m = ((v % period) + period) % period
  return m > period / 2 ? m - period : m
}

// ─── Cubes ────────────────────────────────────────────────────────────────────
type Cube = { xi: number; yi: number; zi: number; colIdx: number; mesh: THREE.Mesh | null }

function makeCubes(): Cube[] {
  const out: Cube[] = []
  SLOTS_XZ.forEach((xi, colIdx) => {
    SLOTS_Y.forEach(yi => {
      SLOTS_XZ.forEach(zi => {
        out.push({ xi, yi, zi, colIdx, mesh: null })
      })
    })
  })
  return out
}

// ─── Étoiles ──────────────────────────────────────────────────────────────────
function Stars() {
  const geo = useMemo(() => {
    const n = 2800, pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const r = 700 + Math.random() * 700
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      pos[i*3]   = r * Math.sin(ph) * Math.cos(th)
      pos[i*3+1] = r * Math.sin(ph) * Math.sin(th) + SPACING * 2
      pos[i*3+2] = r * Math.cos(ph)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  return (
    <points geometry={geo}>
      <pointsMaterial color="#aaccdd" size={0.8} sizeAttenuation transparent opacity={0.6} />
    </points>
  )
}

// ─── Simulation ───────────────────────────────────────────────────────────────
const _rel   = new THREE.Vector3()
const _moved = new THREE.Vector3()
const _ctr   = new THREE.Vector3()
const _col   = new THREE.Color()
const _vHat  = new THREE.Vector3()

interface SimProps {
  cSim:     number
  locked:   boolean
  betaRef:  React.RefObject<HTMLSpanElement | null>
  gammaRef: React.RefObject<HTMLSpanElement | null>
  contrRef: React.RefObject<HTMLSpanElement | null>
  dopFRef:  React.RefObject<HTMLSpanElement | null>
  dopBRef:  React.RefObject<HTMLSpanElement | null>
}

function Simulation({ cSim, locked, betaRef, gammaRef, contrRef, dopFRef, dopBRef }: SimProps) {
  const { scene, camera } = useThree()
  const cubes    = useRef(makeCubes())
  const cSimRef  = useRef(cSim); cSimRef.current = cSim
  const lockedRef = useRef(locked); lockedRef.current = locked
  const keys     = useRef<Set<string>>(new Set())
  // Velocity pour smooth (direction + amplitude)
  const velRef   = useRef(new THREE.Vector3())
  const betaLive = useRef(0)

  useEffect(() => {
    const dn = (e: KeyboardEvent) => keys.current.add(e.code)
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  useEffect(() => {
    const geo = new THREE.BoxGeometry(CUBE_S * 2, CUBE_S * 2, CUBE_S * 2)
    for (const c of cubes.current) {
      const col = PALETTE[c.colIdx]
      const mat = new THREE.MeshStandardMaterial({
        color: col.clone(), emissive: col.clone().multiplyScalar(0.25),
        emissiveIntensity: 0.45, roughness: 0.22, metalness: 0.82,
      })
      const m = new THREE.Mesh(geo, mat)
      m.castShadow = true; scene.add(m); c.mesh = m
    }
    camera.position.copy(START)
    return () => { cubes.current.forEach(c => c.mesh && scene.remove(c.mesh)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.05)
    const c  = cSimRef.current
    const cam = camera

    // ── Mouvement WASD ────────────────────────────────────────────────────
    _moved.set(0, 0, 0)
    if (lockedRef.current) {
      if (keys.current.has('KeyW') || keys.current.has('ArrowUp'))    _moved.z -= 1
      if (keys.current.has('KeyS') || keys.current.has('ArrowDown'))  _moved.z += 1
      if (keys.current.has('KeyA') || keys.current.has('ArrowLeft'))  _moved.x -= 1
      if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) _moved.x += 1
    }

    let beta = 0
    if (_moved.lengthSq() > 0) {
      _moved.normalize().applyQuaternion(cam.quaternion)
      _moved.y = 0
      if (_moved.lengthSq() > 0) _moved.normalize()
      cam.position.addScaledVector(_moved, MOVE_SPEED * dt)
      if (cam.position.y < 3) cam.position.y = 3
      // β = v_marche / c_sim (plafonné à 0.999)
      beta = Math.min(MOVE_SPEED / c, 0.999)
      _vHat.copy(_moved)
      velRef.current.copy(_moved)
    } else {
      // À l'arrêt : maintenir direction mais β → 0 progressivement
      _vHat.copy(velRef.current)
    }

    // Lissage β pour éviter les sauts visuels (arrêt/départ)
    betaLive.current += (beta - betaLive.current) * Math.min(dt * 10, 1)
    const b = betaLive.current
    const g = b > 0.001 ? 1 / Math.sqrt(1 - b * b) : 1

    // ── Cubes ─────────────────────────────────────────────────────────────
    for (const cube of cubes.current) {
      if (!cube.mesh) continue

      // Position repos dans le réseau, bouclée autour de la caméra
      const restX = loop(cube.xi * SPACING - cam.position.x, PERIOD_XZ) + cam.position.x
      const restY = loop(cube.yi * SPACING - cam.position.y, PERIOD_Y)  + cam.position.y
      const restZ = loop(cube.zi * SPACING - cam.position.z, PERIOD_XZ) + cam.position.z

      _rel.set(restX - cam.position.x, restY - cam.position.y, restZ - cam.position.z)

      if (b > 0.005 && _vHat.lengthSq() > 0.5) {
        // ── Contraction de Lorentz ────────────────────────────────────
        lorentzPos(_rel, _vHat, g, _ctr)
        cube.mesh.position.set(
          cam.position.x + _ctr.x,
          cam.position.y + _ctr.y,
          cam.position.z + _ctr.z,
        )

        // Orientation + aplatissement le long de vHat
        cube.mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1), _vHat,
        )
        cube.mesh.scale.set(1, 1, Math.max(0.01, 1 / g))

        // ── Doppler ────────────────────────────────────────────────────
        const dist = _rel.length()
        const cosT = dist > 0.1 ? _rel.dot(_vHat) / dist : 0
        const k    = doppler(cosT, b, g)
        dopplerColor(k, PALETTE[cube.colIdx], _col)
        const mat = cube.mesh.material as THREE.MeshStandardMaterial
        mat.color.copy(_col)
        mat.emissive.copy(_col)
        mat.emissiveIntensity = headlight(k) * 0.4
      } else {
        // Repos : position + apparence normales
        cube.mesh.position.set(restX, restY, restZ)
        cube.mesh.quaternion.identity()
        cube.mesh.scale.setScalar(1)
        const mat = cube.mesh.material as THREE.MeshStandardMaterial
        mat.color.copy(PALETTE[cube.colIdx])
        mat.emissive.copy(PALETTE[cube.colIdx]).multiplyScalar(0.25)
        mat.emissiveIntensity = 0.45
      }
    }

    // ── HUD live ──────────────────────────────────────────────────────────
    if (betaRef.current)  betaRef.current.textContent  = b.toFixed(4)
    if (gammaRef.current) gammaRef.current.textContent = g.toFixed(3)
    if (contrRef.current) contrRef.current.textContent = `${(100 / g).toFixed(1)}%`
    if (b > 0.01) {
      if (dopFRef.current) dopFRef.current.textContent = `×${doppler(1, b, g).toFixed(2)}`
      if (dopBRef.current) dopBRef.current.textContent = `×${doppler(-1, b, g).toFixed(3)}`
    } else {
      if (dopFRef.current) dopFRef.current.textContent = '×1.00'
      if (dopBRef.current) dopBRef.current.textContent = '×1.00'
    }
  })

  return null
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function HUD({
  cSim, setCSim, onBack, locked, containerRef,
  betaRef, gammaRef, contrRef, dopFRef, dopBRef,
}: {
  cSim: number; setCSim: (v: number) => void
  onBack: () => void; locked: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  betaRef:  React.RefObject<HTMLSpanElement | null>
  gammaRef: React.RefObject<HTMLSpanElement | null>
  contrRef: React.RefObject<HTMLSpanElement | null>
  dopFRef:  React.RefObject<HTMLSpanElement | null>
  dopBRef:  React.RefObject<HTMLSpanElement | null>
}) {
  const beta0 = Math.min(MOVE_SPEED / cSim, 0.999)
  const g0    = 1 / Math.sqrt(1 - beta0 * beta0)

  return (
    <div style={{ fontFamily: "'SF Mono','Fira Code',monospace", position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <ScenePanel
        title="V6 — Relativistic Navigation"
        onBack={onBack}
        containerRef={containerRef}
        theme="blue"
        width={300}
        filename="v6-relativistic-nav.webm"
      >
        {/* ── c_sim slider (clé principale) ─────────────── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 13 }}>
            <span style={{ color: '#a0b8e0' }}>c<sub>sim</sub> — vitesse lumière</span>
            <span style={{ color: '#55ddff', fontWeight: 700, fontSize: 16 }}>
              {cSim.toFixed(0)}<span style={{ fontSize: 11, color: '#2a4060' }}> u/s</span>
            </span>
          </div>
          <input type="range" min={5} max={120} step={1} value={cSim}
            onChange={e => setCSim(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#33aaff', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#1a2a40', marginTop: 4 }}>
            <span style={{ color: '#55ddff' }}>c=5 → ultra-relat.</span>
            <span>c=120 → classique</span>
          </div>
        </div>

        {/* Rappel : v_marche = 14 u/s */}
        <div style={{ padding: '8px 11px', background: 'rgba(20,60,140,0.12)', borderRadius: 6, fontSize: 12, color: '#2a4070', marginBottom: 14, lineHeight: 2.0 }}>
          v<sub>marche</sub> = {MOVE_SPEED} u/s fixe<br />
          β au sol = <span style={{ color: '#55ddff' }}>{beta0.toFixed(3)}</span>
          {'  '}·{'  '}γ = <span style={{ color: '#ffcc44' }}>{g0.toFixed(2)}</span>
        </div>

        {/* ── Indicateurs live ──────────────────────────── */}
        <div style={{ padding: '11px 13px', background: 'rgba(0,0,0,0.50)', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
          {[
            { label: 'β (live)',         ref: betaRef,  col: '#55ddff' },
            { label: 'γ (Lorentz)',      ref: gammaRef, col: '#ffffaa' },
            { label: 'contraction ‖',    ref: contrRef, col: '#ffcc44' },
            { label: 'Doppler devant',   ref: dopFRef,  col: '#88aaff' },
            { label: 'Doppler derrière', ref: dopBRef,  col: '#ff6644' },
          ].map(({ label, ref, col }, i, arr) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', lineHeight: 2.6,
              borderBottom: i < arr.length - 1 ? '1px solid rgba(40,80,160,0.12)' : 'none',
            }}>
              <span style={{ color: '#1e3060' }}>{label}</span>
              <span style={{ color: col, fontWeight: 700 }}>
                <span ref={ref as React.RefObject<HTMLSpanElement>}>—</span>
              </span>
            </div>
          ))}
        </div>

        {/* ── Légende ───────────────────────────────────── */}
        <div style={{ padding: '9px 11px', background: 'rgba(20,50,120,0.07)', borderRadius: 7, fontSize: 12, color: '#2a4070', lineHeight: 2.3 }}>
          <span style={{ color: '#ffcc44' }}>Cubes aplatis</span> → contraction ‖ mouvement<br />
          <span style={{ color: '#88aaff' }}>S'accumulent</span> devant → aberration<br />
          <span style={{ color: '#55aaff' }}>Bleu</span> devant · <span style={{ color: '#ff6644' }}>Rouge</span> derrière<br />
          Regarder en arrière → voir le redshift<br />
          <span style={{ color: '#1a2a40', fontSize: 11 }}>
            {locked ? 'WASD · souris · ESC pour sortir' : 'Cliquer pour entrer · WASD'}
          </span>
        </div>
      </ScenePanel>

      {locked && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
          <div style={{ width: 1, height: 18, background: 'rgba(60,180,255,0.5)', margin: '0 auto' }} />
          <div style={{ width: 18, height: 1, background: 'rgba(60,180,255,0.5)', marginTop: -9.5 }} />
        </div>
      )}

      {!locked && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(2,4,14,0.94)', border: '1px solid rgba(40,150,255,0.42)', borderRadius: 14, padding: '26px 54px', textAlign: 'center', backdropFilter: 'blur(18px)' }}>
            <div style={{ color: '#33aaff', fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 10 }}>Relativistic Navigation</div>
            <div style={{ color: '#c0d8ff', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Cliquer pour entrer</div>
            <div style={{ color: '#1a3060', fontSize: 13 }}>WASD · Souris · Baisser c pour voir les effets</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function V6Scene({ onBack }: { onBack: () => void }) {
  const [cSim,   setCSim]   = useState(40)
  const [locked, setLocked] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const betaRef      = useRef<HTMLSpanElement>(null)
  const gammaRef     = useRef<HTMLSpanElement>(null)
  const contrRef     = useRef<HTMLSpanElement>(null)
  const dopFRef      = useRef<HTMLSpanElement>(null)
  const dopBRef      = useRef<HTMLSpanElement>(null)

  const onLock   = useCallback(() => setLocked(true),  [])
  const onUnlock = useCallback(() => setLocked(false), [])

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', background: '#01020a', position: 'relative' }}>
      <Canvas
        camera={{ position: START.toArray(), fov: 72, near: 0.5, far: 3000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        shadows
      >
        <color attach="background" args={['#01020a']} />
        <fog attach="fog" args={['#010208', 500, 1200]} />

        <hemisphereLight args={['#0a1840', '#000000', 0.55]} />
        <ambientLight intensity={0.4} color="#1a2860" />
        <directionalLight position={[80, 80, 0]}   intensity={0.85} color="#c8d8ff" castShadow />
        <directionalLight position={[-80, 60, 0]}  intensity={0.45} color="#c8d8ff" />
        <directionalLight position={[0, -40, 80]}  intensity={0.35} color="#8899ff" />

        <Stars />

        <Simulation
          cSim={cSim} locked={locked}
          betaRef={betaRef} gammaRef={gammaRef} contrRef={contrRef}
          dopFRef={dopFRef} dopBRef={dopBRef}
        />

        <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
      </Canvas>

      <HUD
        cSim={cSim} setCSim={setCSim}
        onBack={onBack} locked={locked}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
        betaRef={betaRef} gammaRef={gammaRef} contrRef={contrRef}
        dopFRef={dopFRef} dopBRef={dopBRef}
      />
    </div>
  )
}
