/**
 * V10 — Aberration Drive : relativité restreinte rendue "vue caméra"
 *
 * Le monde est rendu dans une CUBEMAP (lab frame), puis un shader plein-écran
 * applique l'aberration relativiste INVERSE par pixel :
 *
 *   cos θ_lab = (cos θ_obs − β) / (1 − β cos θ_obs)
 *
 * → le champ avant se comprime en grand-angle (les objets rapetissent),
 *   l'arrière s'étire en téléobjectif. Doppler (bleu devant / rouge derrière)
 *   + beaming relativiste (l'avant s'illumine ∝ D^2.5).
 *
 * Contrairement à V7 (vue "référentiel" = espace contracté), V10 est la vue
 * PHOTOGRAPHIÉE : ce qu'un œil verrait réellement à vitesse relativiste.
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { ScenePanel } from '../components/ScenePanel'

// ─── Config ───────────────────────────────────────────────────────────────────
const START       = new THREE.Vector3(0, 9, 90)
const BASE_SPEED  = 16
const SPRINT_MUL  = 3.5
const FOV_DEG     = 72
const CUBE_SIZE   = 512

// ─── GLSL ─────────────────────────────────────────────────────────────────────
const VERT = /* glsl */`
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */`
  precision highp float;

  uniform samplerCube tCube;
  uniform mat3  uCamBasis;
  uniform float uTanHalfFov;
  uniform float uAspect;
  uniform vec2  uResolution;
  uniform vec3  uVel;     // direction unité de la vitesse (monde)
  uniform float uBeta;
  uniform float uGamma;

  vec3 dopplerTint(vec3 c, float D) {
    if (D >= 1.0) return mix(c, vec3(0.60, 0.78, 1.00), clamp((D - 1.0) / 2.0, 0.0, 1.0) * 0.85);
    else          return mix(c, vec3(1.00, 0.32, 0.14), clamp((1.0 - D) / 0.7, 0.0, 1.0) * 0.85);
  }

  void main() {
    vec2 uv  = gl_FragCoord.xy / uResolution;
    vec2 ndc = uv * 2.0 - 1.0;

    vec3 right   = uCamBasis[0];
    vec3 up      = uCamBasis[1];
    vec3 forward = -uCamBasis[2];

    // Direction observée (caméra → pixel), monde
    vec3 rd = normalize(
      right   * (ndc.x * uAspect * uTanHalfFov) +
      up      * (ndc.y * uTanHalfFov) +
      forward
    );

    float beta   = uBeta;
    float cosObs = dot(rd, uVel);

    // Aberration inverse : retrouver la direction dans le lab frame
    vec3 dLab;
    if (beta < 0.001) {
      dLab = rd;
    } else {
      float cosLab = clamp((cosObs - beta) / (1.0 - beta * cosObs), -1.0, 1.0);
      vec3  perp   = rd - cosObs * uVel;
      float lp     = length(perp);
      vec3  perpH  = lp > 1e-5 ? perp / lp : vec3(0.0);
      float sinLab = sqrt(max(0.0, 1.0 - cosLab * cosLab));
      dLab = normalize(cosLab * uVel + sinLab * perpH);
    }

    vec3 col = textureCube(tCube, dLab).rgb;

    // Doppler (fréquence) + beaming (intensité, effet phare)
    float D = uGamma > 1.001 ? 1.0 / (uGamma * (1.0 - beta * cosObs)) : 1.0;
    col = dopplerTint(col, D);
    col *= clamp(pow(D, 2.5), 0.12, 5.0);

    gl_FragColor = vec4(col, 1.0);
  }
`

// ─── Étoiles (colorées) ─────────────────────────────────────────────────────────
const N_STARS = 3000
const starPos = (() => {
  const a = new Float32Array(N_STARS * 3)
  for (let i = 0; i < N_STARS; i++) {
    const r = 1400 + Math.random() * 2200
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    a[i*3]   = r * Math.sin(ph) * Math.cos(th)
    a[i*3+1] = r * Math.sin(ph) * Math.sin(th)
    a[i*3+2] = r * Math.cos(ph)
  }
  return a
})()
const starCol = (() => {
  const pal = [[1,1,1],[0.85,0.9,1],[1,0.92,0.8],[0.65,0.78,1],[1,0.72,0.55]]
  const a = new Float32Array(N_STARS * 3)
  for (let i = 0; i < N_STARS; i++) {
    const p = pal[Math.floor(Math.random() * pal.length)]
    const b = 0.6 + Math.random() * 0.9
    a[i*3] = p[0]*b; a[i*3+1] = p[1]*b; a[i*3+2] = p[2]*b
  }
  return a
})()

// Couleurs vives pour les piliers-repères (la roue chromatique aide à lire l'aberration)
const PILLAR_COLS = [
  '#ff3355', '#ff8822', '#ffdd33', '#66ff44',
  '#33ffcc', '#33aaff', '#6644ff', '#ff44cc',
]

// ─── Helpers ────────────────────────────────────────────────────────────────────
const _vel3 = new THREE.Vector3()

// ─── World ────────────────────────────────────────────────────────────────────
interface WorldProps {
  cSim: number; locked: boolean
  betaRef:   React.RefObject<HTMLSpanElement | null>
  fcRef:     React.RefObject<HTMLSpanElement | null>
  dopRef:    React.RefObject<HTMLSpanElement | null>
  sprintRef: React.RefObject<HTMLSpanElement | null>
  resetRef:  React.MutableRefObject<(() => void) | null>
}

function World({ cSim, locked, betaRef, fcRef, dopRef, sprintRef, resetRef }: WorldProps) {
  const { gl, camera, size } = useThree()
  const cRef     = useRef(cSim); cRef.current = cSim
  const locRef   = useRef(locked); locRef.current = locked
  const keys     = useRef<Set<string>>(new Set())
  const velRef   = useRef(new THREE.Vector3(0, 0, -1))
  const betaLive = useRef(0)

  // Matériaux animés
  const lavaMat    = useRef<THREE.MeshBasicMaterial | null>(null)
  const pillarMats = useRef<THREE.MeshBasicMaterial[]>([])

  // ── worldScene (lab frame) ────────────────────────────────────────────────────
  const worldScene = useMemo(() => {
    const s = new THREE.Scene()
    s.background = new THREE.Color(0x05060f)
    return s
  }, [])

  // ── Cubemap ────────────────────────────────────────────────────────────────────
  const cubeRT = useMemo(() => new THREE.WebGLCubeRenderTarget(CUBE_SIZE, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
  }), [])
  const cubeCam = useMemo(() => new THREE.CubeCamera(0.5, 6000, cubeRT), [cubeRT])

  // ── Matériau plein-écran ─────────────────────────────────────────────────────
  const mat = useMemo(() => {
    const tanHalfFov = Math.tan((FOV_DEG * Math.PI / 180) / 2)
    return new THREE.ShaderMaterial({
      uniforms: {
        tCube:       { value: cubeRT.texture },
        uCamBasis:   { value: new THREE.Matrix3() },
        uTanHalfFov: { value: tanHalfFov },
        uAspect:     { value: size.width / size.height },
        uResolution: { value: new THREE.Vector2(size.width, size.height) },
        uVel:        { value: new THREE.Vector3(0, 0, -1) },
        uBeta:       { value: 0 },
        uGamma:      { value: 1 },
      },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    })
  }, [cubeRT, size.width, size.height])

  // ── Peupler worldScene ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Étoiles
    const sGeo = new THREE.BufferGeometry()
    sGeo.setAttribute('position', new THREE.BufferAttribute(starPos.slice(), 3))
    sGeo.setAttribute('color',    new THREE.BufferAttribute(starCol.slice(), 3))
    worldScene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({
      size: 2.0, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95,
    })))

    // Sol + grille (sens du mouvement)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshBasicMaterial({ color: '#0b0f1c' }),
    )
    ground.rotation.x = -Math.PI / 2
    worldScene.add(ground)
    const grid = new THREE.GridHelper(1600, 80, 0x2a3a66, 0x162138)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.5
    worldScene.add(grid)

    // Volcan central (repère + lave animée)
    const volcano = new THREE.Mesh(
      new THREE.ConeGeometry(22, 26, 24),
      new THREE.MeshBasicMaterial({ color: '#241812' }),
    )
    volcano.position.set(0, 13, -140)
    worldScene.add(volcano)
    const lava = new THREE.Mesh(
      new THREE.SphereGeometry(7, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ff5500', toneMapped: false }),
    )
    lava.position.set(0, 27, -140)
    worldScene.add(lava)
    lavaMat.current = lava.material as THREE.MeshBasicMaterial

    // Anneau de piliers-repères colorés (la roue chromatique révèle l'aberration)
    const RING_R = 120, N_RING = 24
    const mats: THREE.MeshBasicMaterial[] = []
    for (let i = 0; i < N_RING; i++) {
      const ang = (i / N_RING) * Math.PI * 2
      const h   = 20 + (i % 4) * 10
      const col = PILLAR_COLS[i % PILLAR_COLS.length]
      const m   = new THREE.MeshBasicMaterial({ color: col, toneMapped: false })
      const pil = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), m)
      pil.position.set(Math.cos(ang) * RING_R, h / 2, Math.sin(ang) * RING_R)
      worldScene.add(pil)
      mats.push(m)
      // petite bille lumineuse au sommet
      const bead = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), m)
      bead.position.set(pil.position.x, h + 2, pil.position.z)
      worldScene.add(bead)
    }
    // Second anneau plus lointain
    for (let i = 0; i < N_RING; i++) {
      const ang = (i / N_RING) * Math.PI * 2 + 0.13
      const col = PILLAR_COLS[(i + 3) % PILLAR_COLS.length]
      const m   = new THREE.MeshBasicMaterial({ color: col, toneMapped: false })
      const bead = new THREE.Mesh(new THREE.SphereGeometry(3.0, 10, 8), m)
      bead.position.set(Math.cos(ang) * 360, 30 + (i % 5) * 14, Math.sin(ang) * 360)
      worldScene.add(bead)
      mats.push(m)
    }
    pillarMats.current = mats

    // Lune pâle
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(34, 24, 18),
      new THREE.MeshBasicMaterial({ color: '#b8c0d8', toneMapped: false }),
    )
    moon.position.set(280, 220, -560)
    worldScene.add(moon)

    return () => { worldScene.clear() }
  }, [worldScene])

  // ── Clavier ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const dn = (e: KeyboardEvent) => keys.current.add(e.code)
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  // ── Reset ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    resetRef.current = () => {
      camera.position.copy(START); camera.rotation.set(0, 0, 0)
      betaLive.current = 0; velRef.current.set(0, 0, -1)
    }
    camera.position.copy(START)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  // ── Frame ─────────────────────────────────────────────────────────────────────
  useFrame((_s, delta) => {
    const dt  = Math.min(delta, 0.05)
    const t   = _s.clock.elapsedTime
    const cam = camera as THREE.PerspectiveCamera
    const c   = cRef.current

    // Mouvement
    const mv     = new THREE.Vector3()
    const sprint = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight')
    if (locRef.current) {
      if (keys.current.has('KeyW') || keys.current.has('ArrowUp'))    mv.z -= 1
      if (keys.current.has('KeyS') || keys.current.has('ArrowDown'))  mv.z += 1
      if (keys.current.has('KeyA') || keys.current.has('ArrowLeft'))  mv.x -= 1
      if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) mv.x += 1
      if (keys.current.has('Space'))                                   mv.y += 0.5
      if (keys.current.has('ControlLeft'))                             mv.y -= 0.5
    }
    const speed = BASE_SPEED * (sprint ? SPRINT_MUL : 1)
    if (mv.lengthSq() > 0) {
      mv.normalize().applyQuaternion(cam.quaternion); mv.y *= 0.4
      if (mv.lengthSq() > 0.01) { mv.normalize(); velRef.current.copy(mv) }
      cam.position.addScaledVector(mv, speed * dt)
      if (cam.position.y < 1.5) cam.position.y = 1.5
      betaLive.current = Math.min(speed / c, 0.999)
    } else {
      betaLive.current *= Math.max(0, 1 - dt * 5)
    }

    const b = betaLive.current
    const g = b > 0.001 ? 1 / Math.sqrt(1 - b * b) : 1
    _vel3.copy(velRef.current)

    // Animation lave (les piliers gardent leur couleur vive — le beaming fait le reste)
    if (lavaMat.current) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2)
      lavaMat.current.color.setRGB(1, 0.28 + pulse * 0.22, 0.0)
    }

    // 1. Rendre le monde dans la cubemap depuis la position caméra
    cubeCam.position.copy(cam.position)
    cubeCam.update(gl, worldScene)

    // 2. Uniforms
    const u = mat.uniforms
    const m3 = new THREE.Matrix3().setFromMatrix4(cam.matrixWorld)
    u.uCamBasis.value.copy(m3)
    u.uVel.value.copy(_vel3)
    u.uBeta.value = b
    u.uGamma.value = g

    // 3. HUD
    if (betaRef.current) betaRef.current.textContent = `β ${b.toFixed(3)}  γ ${g.toFixed(2)}`
    if (sprintRef.current) {
      sprintRef.current.textContent = sprint ? `sprint ×${SPRINT_MUL}  (${speed.toFixed(0)} u/s)` : `${speed.toFixed(0)} u/s`
      sprintRef.current.style.color = sprint ? '#ffee44' : '#8899aa'
    }
    if (fcRef.current) {
      const fc = Math.sqrt((1 - b) / (1 + b))
      fcRef.current.textContent = `×${fc.toFixed(2)} devant`
      fcRef.current.style.color = fc < 0.5 ? '#66aaff' : '#aaccee'
    }
    if (dopRef.current) {
      const D = g > 1.001 ? Math.sqrt((1 + b) / (1 - b)) : 1
      dopRef.current.textContent = `×${D.toFixed(2)} (bleu)`
      dopRef.current.style.color = D > 1.6 ? '#66ccff' : '#aaccee'
    }
  }, -1)

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function HUD({ cSim, setCSim, onBack, locked, containerRef,
               betaRef, fcRef, dopRef, sprintRef, resetRef }: {
  cSim: number; setCSim: (v: number) => void
  onBack: () => void; locked: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  betaRef:   React.RefObject<HTMLSpanElement | null>
  fcRef:     React.RefObject<HTMLSpanElement | null>
  dopRef:    React.RefObject<HTMLSpanElement | null>
  sprintRef: React.RefObject<HTMLSpanElement | null>
  resetRef:  React.MutableRefObject<(() => void) | null>
}) {
  const Row = (label: string, ref: React.RefObject<HTMLSpanElement | null>, def: string, col = '#aaccee') => (
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:13 }}>
      <span style={{ color:'#556688' }}>{label}</span>
      <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ color: col, fontWeight:600 }}>{def}</span>
    </div>
  )

  return (
    <div style={{ fontFamily:"'SF Mono','Fira Code',monospace", position:'fixed', inset:0, pointerEvents:'none', zIndex:10 }}>
      <ScenePanel title="V10 — Aberration Drive" onBack={onBack} containerRef={containerRef}
        theme="blue" filename="v10-aberration.webm" width={370}>

        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:14 }}>
            <span style={{ color:'#6688aa' }}>c<sub>sim</sub></span>
            <span style={{ color:'#88ccff', fontWeight:700, fontSize:16 }}>{cSim.toFixed(0)} u/s</span>
          </div>
          <input type="range" min={8} max={80} step={1} value={cSim}
            onChange={e => setCSim(parseFloat(e.target.value))}
            style={{ width:'100%', accentColor:'#4488cc', cursor:'pointer' }} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#223344', marginTop:3 }}>
            <span style={{ color:'#4488cc' }}>c=8 → aberration extrême</span>
            <span>c=80 → classique</span>
          </div>
        </div>

        <div style={{ background:'rgba(0,0,0,0.6)', borderRadius:8, padding:'10px 13px', marginBottom:10 }}>
          <div style={{ fontSize:11, color:'#223344', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6 }}>Effet relativiste</div>
          {Row('β / γ', betaRef, 'β 0.000  γ 1.00', '#88ccff')}
          {Row('vitesse', sprintRef, `${BASE_SPEED} u/s`, '#8899aa')}
          {Row('taille avant', fcRef, '×1.00 devant', '#aaccee')}
          {Row('Doppler avant', dopRef, '×1.00 (bleu)', '#aaccee')}
        </div>

        <div style={{ background:'rgba(0,20,50,0.2)', borderRadius:8, padding:'10px 13px', marginBottom:10, fontSize:12, lineHeight:1.8, color:'#556688' }}>
          <div style={{ fontSize:11, color:'#223344', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:5 }}>Ce que tu vois</div>
          <div>→ <span style={{ color:'#88bbff' }}>Avance vite</span> : le monde se rabat en grand-angle devant, rapetisse, vire au bleu et s'illumine.</div>
          <div style={{ marginTop:4 }}>→ Regarde <span style={{ color:'#ff8866' }}>derrière</span> : téléobjectif, étiré, rougi.</div>
          <div style={{ marginTop:4, color:'#445566' }}>Vue "photographiée" (aberration) — l'opposé de V7 (vue référentiel).</div>
        </div>

        <div style={{ background:'rgba(0,0,0,0.25)', borderRadius:8, padding:'9px 13px', marginBottom:10, fontSize:12, color:'#334455', lineHeight:1.9 }}>
          <div style={{ fontSize:11, color:'#445566', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:4 }}>Contrôles</div>
          <div><span style={{ color:'#6699bb' }}>WASD</span> · <span style={{ color:'#ffee44' }}>Shift</span> ×{SPRINT_MUL} · <span style={{ color:'#66bb66' }}>Espace/Ctrl</span> ↑↓</div>
          <div style={{ color:'#334455', fontSize:11, marginTop:3 }}>Baisser c<sub>sim</sub> amplifie l'aberration</div>
        </div>

        <button onClick={() => resetRef.current?.()}
          style={{ width:'100%', padding:'9px 0', cursor:'pointer', background:'rgba(20,60,100,0.25)', border:'1px solid rgba(80,150,220,0.4)', borderRadius:8, color:'#88bbdd', fontSize:13, fontFamily:'inherit', letterSpacing:'0.08em', transition:'all 0.15s' }}
          onMouseEnter={e => { const b=e.target as HTMLButtonElement; b.style.background='rgba(40,100,160,0.4)'; b.style.color='#cceeff' }}
          onMouseLeave={e => { const b=e.target as HTMLButtonElement; b.style.background='rgba(20,60,100,0.25)'; b.style.color='#88bbdd' }}>
          ↺ Réinitialiser
        </button>
      </ScenePanel>

      {locked && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none' }}>
          <div style={{ width:1, height:16, background:'rgba(100,180,255,0.5)', margin:'0 auto' }} />
          <div style={{ width:16, height:1, background:'rgba(100,180,255,0.5)', marginTop:-8.5 }} />
        </div>
      )}

      {!locked && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ background:'rgba(0,4,10,0.97)', border:'1px solid rgba(80,150,255,0.45)', borderRadius:18, padding:'34px 66px', textAlign:'center', backdropFilter:'blur(22px)' }}>
            <div style={{ color:'#4488cc', fontSize:11, letterSpacing:'0.3em', textTransform:'uppercase', marginBottom:14 }}>V10 — Aberration Drive</div>
            <div style={{ color:'#cce8ff', fontSize:26, fontWeight:700, marginBottom:12 }}>La vue photographiée</div>
            <div style={{ color:'#223344', fontSize:14, lineHeight:1.9 }}>
              Aberration relativiste rendue par cubemap<br />
              Avance vite → grand-angle avant + blueshift + phare<br />
              <span style={{ color:'#446688' }}>Ce qu'un œil verrait vraiment près de c</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function V10Scene({ onBack }: { onBack: () => void }) {
  const [cSim, setCSim]     = useState(28)
  const [locked, setLocked] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const betaRef      = useRef<HTMLSpanElement>(null)
  const fcRef        = useRef<HTMLSpanElement>(null)
  const dopRef       = useRef<HTMLSpanElement>(null)
  const sprintRef    = useRef<HTMLSpanElement>(null)
  const resetRef     = useRef<(() => void) | null>(null)
  const onLock       = useCallback(() => setLocked(true),  [])
  const onUnlock     = useCallback(() => setLocked(false), [])

  return (
    <div ref={containerRef} style={{ width:'100vw', height:'100vh', background:'#05060f', position:'relative' }}>
      <Canvas
        camera={{ position: START.toArray(), fov: FOV_DEG, near: 0.5, far: 8000 }}
        gl={{ antialias: false, preserveDrawingBuffer: true, toneMapping: THREE.NoToneMapping }}
        shadows={false}
      >
        <color attach="background" args={['#05060f']} />
        <World
          cSim={cSim} locked={locked}
          betaRef={betaRef} fcRef={fcRef} dopRef={dopRef}
          sprintRef={sprintRef} resetRef={resetRef}
        />
        <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
      </Canvas>
      <HUD cSim={cSim} setCSim={setCSim} onBack={onBack} locked={locked}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
        betaRef={betaRef} fcRef={fcRef} dopRef={dopRef}
        sprintRef={sprintRef} resetRef={resetRef} />
    </div>
  )
}
