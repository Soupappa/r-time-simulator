/**
 * V9 — Black Hole : lentille gravitationnelle exacte + astronef en chute
 *
 * Géodésiques Schwarzschild par pixel :  a = -(3Rs/2)(h²/r⁵) pos  (inward)
 *
 * Effets :
 *   • Image directe + image secondaire + photon ring
 *   • Doppler orbital + redshift gravit. + Doppler observateur (c)
 *   • Astronef en chute libre : gel apparent + redshift + spaghettification
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import { ScenePanel } from '../components/ScenePanel'

// ─── Config ───────────────────────────────────────────────────────────────────
const Rs         = 30
const START      = new THREE.Vector3(0, 12, 560)
const MIN_DIST   = Rs * 1.62
const BASE_SPEED = 14
const SPRINT_MUL = 3.0
const N_STARS    = 3200
const FOV_DEG    = 65

// Astronef en chute libre
// Direction depuis le BH vers le point de départ (visible depuis la caméra START)
const SHIP_DIR  = new THREE.Vector3(1, 0.4, 4).normalize()   // ≈ dans le champ de vue
const SHIP_R0   = Rs * 14        // rayon de départ (420 u)
const C_SHIP    = 30             // c pour la dynamique du navire (indépendant du slider)
const SHIP_SMUL = 1.8            // accélérateur visuel de la chute

// ─── GLSL ─────────────────────────────────────────────────────────────────────
const LENS_VERT = /* glsl */`
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const LENS_FRAG = /* glsl */`
  precision highp float;

  uniform sampler2D tBg;
  uniform vec3  uCamPos;
  uniform mat3  uCamBasis;
  uniform float uTanHalfFov;
  uniform float uAspect;
  uniform float uRs;
  uniform vec2  uResolution;
  uniform vec3  uCamVel;
  uniform float uBeta;
  uniform float uGamma;

  #define MAX_STEPS  320
  #define SHADOW_R   (uRs * 1.50)
  #define DISK_RMIN  (uRs * 3.0)
  #define DISK_RMAX  (uRs * 15.0)
  #define MAX_HITS   3

  vec3 diskColor(vec3 hp, vec3 photonDir) {
    float r = length(vec2(hp.x, hp.z));
    if (r < DISK_RMIN || r > DISK_RMAX) return vec3(0.0);

    float bo  = sqrt(uRs / (2.0 * r));
    float go  = 1.0 / sqrt(max(1e-6, 1.0 - bo * bo));
    float phi = atan(hp.z, hp.x);
    vec3  ov  = vec3(-sin(phi), 0.0, cos(phi));

    float cosOrb = dot(normalize(-photonDir), ov);
    float kOrb   = 1.0 / (go * (1.0 - bo * cosOrb));
    float kGrav  = sqrt(max(1e-5, 1.0 - uRs / r));

    // Doppler observateur
    vec3  toDisk = normalize(hp - uCamPos);
    float cosObs = dot(toDisk, uCamVel);
    float kObs   = uGamma > 1.001 ? 1.0 / (uGamma * (1.0 - uBeta * cosObs)) : 1.0;

    float k = kOrb * kGrav * kObs;

    float band  = 0.5 + 0.5 * abs(sin(phi * 7.0 + r * 0.07));
    float tNorm = clamp((r / uRs - 3.0) / 12.0, 0.0, 1.0);
    vec3  base  = mix(vec3(0.55, 0.88, 2.2), vec3(1.8, 0.10, 0.02), tNorm);

    float inner = mix(3.8, 1.0, tNorm);
    float br    = pow(max(0.0, k), 2.8) * band * inner;
    return base * br * 2.2;
  }

  void main() {
    vec2 uv  = gl_FragCoord.xy / uResolution;
    vec2 ndc = uv * 2.0 - 1.0;

    vec3 right   = uCamBasis[0];
    vec3 up      = uCamBasis[1];
    vec3 forward = -uCamBasis[2];

    vec3 rd = normalize(
      right   * (ndc.x * uAspect * uTanHalfFov) +
      up      * (ndc.y * uTanHalfFov) +
      forward
    );

    vec3  pos = uCamPos;
    vec3  vel = rd;
    vec3  hv  = cross(pos, vel);
    float h2  = dot(hv, hv);

    bool hitShadow = false;
    vec3 diskAccum = vec3(0.0);
    int  nHits     = 0;
    float prevY    = pos.y;
    vec3  prevPos  = pos;

    for (int i = 0; i < MAX_STEPS; i++) {
      float r = length(pos);
      if (r < SHADOW_R) { hitShadow = true; break; }

      // Traversée du plan disque
      if (prevY * pos.y < 0.0 && nHits < MAX_HITS) {
        float frac = abs(prevY) / (abs(prevY) + abs(pos.y) + 1e-9);
        diskAccum += diskColor(mix(prevPos, pos, frac), vel);
        nHits++;
      }

      // Géodésique Schwarzschild : a = -(3Rs/2)(h²/r⁵) pos  (INWARD = vers BH)
      float r2  = r * r;
      float r5  = r2 * r2 * r;
      float step = clamp((r - SHADOW_R) * 0.09 + 1.2, 1.2, 50.0);
      vec3  acc  = -(1.5 * uRs * h2 / r5) * pos;   // signe − : courbure vers BH

      prevY   = pos.y;
      prevPos = pos;
      vel    += acc  * step;
      pos    += vel  * step;

      if (r > 6000.0) break;
    }

    if (hitShadow) {
      gl_FragColor = vec4(0.010, 0.003, 0.0, 1.0);
      return;
    }

    vec3  fd = normalize(vel);
    float fx = dot(fd, right);
    float fy = dot(fd, up);
    float fz = dot(fd, forward);

    vec3 bgCol = vec3(0.0);
    if (fz > 0.001) {
      float u2 = fx / (fz * uAspect * uTanHalfFov);
      float v2 = fy / (fz * uTanHalfFov);
      vec2 bentUV = vec2(u2, v2) * 0.5 + 0.5;
      if (bentUV.x >= 0.0 && bentUV.x <= 1.0 &&
          bentUV.y >= 0.0 && bentUV.y <= 1.0) {
        bgCol = texture2D(tBg, bentUV).rgb;
      }
    }

    gl_FragColor = vec4(diskAccum + bgCol, 1.0);
  }
`

// ─── Étoiles ──────────────────────────────────────────────────────────────────
const starPos = (() => {
  const arr = new Float32Array(N_STARS * 3)
  for (let i = 0; i < N_STARS; i++) {
    const r  = 1200 + Math.random() * 2400
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    arr[i*3]   = r * Math.sin(ph) * Math.cos(th)
    arr[i*3+1] = r * Math.sin(ph) * Math.sin(th)
    arr[i*3+2] = r * Math.cos(ph)
  }
  return arr
})()

const starColors = (() => {
  const pal = [[1,1,1],[0.9,0.95,1],[1,0.93,0.86],[0.65,0.78,1],[1,0.75,0.6]]
  const arr = new Float32Array(N_STARS * 3)
  for (let i = 0; i < N_STARS; i++) {
    const p = pal[Math.floor(Math.random() * pal.length)]
    const b = 0.65 + Math.random() * 0.9
    arr[i*3] = p[0]*b; arr[i*3+1] = p[1]*b; arr[i*3+2] = p[2]*b
  }
  return arr
})()

// ─── Helpers ──────────────────────────────────────────────────────────────────
const _vel3  = new THREE.Vector3()
const _shipP = new THREE.Vector3()

// ─── World ────────────────────────────────────────────────────────────────────
interface WorldProps {
  cSim: number; locked: boolean
  betaRef:    React.RefObject<HTMLSpanElement | null>
  dilRef:     React.RefObject<HTMLSpanElement | null>
  distRef:    React.RefObject<HTMLSpanElement | null>
  sprintRef:  React.RefObject<HTMLSpanElement | null>
  shipKGRef:  React.RefObject<HTMLSpanElement | null>
  shipDistRef:React.RefObject<HTMLSpanElement | null>
  warnRef:    React.RefObject<HTMLDivElement | null>
  resetRef:   React.MutableRefObject<(() => void) | null>
}

function World({ cSim, locked,
  betaRef, dilRef, distRef, sprintRef, shipKGRef, shipDistRef, warnRef, resetRef,
}: WorldProps) {
  const { gl, camera, size } = useThree()
  const cRef     = useRef(cSim); cRef.current = cSim
  const locRef   = useRef(locked); locRef.current = locked
  const keys     = useRef<Set<string>>(new Set())
  const velRef   = useRef(new THREE.Vector3(0, 0, -1))
  const betaLive = useRef(0)

  // Astronef
  const shipRRef  = useRef(SHIP_R0)
  const shipRef   = useRef<THREE.Group | null>(null)
  const shipMats  = useRef<THREE.MeshBasicMaterial[]>([])
  const shipGlow  = useRef<THREE.MeshBasicMaterial | null>(null)

  // ── bgScene ─────────────────────────────────────────────────────────────────
  const bgScene = useMemo(() => {
    const s = new THREE.Scene(); s.background = new THREE.Color(0x00000a); return s
  }, [])

  const rt = useMemo(() => new THREE.WebGLRenderTarget(size.width, size.height, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
  }), [size.width, size.height])

  const lensMat = useMemo(() => {
    const tanHalfFov = Math.tan((FOV_DEG * Math.PI / 180) / 2)
    return new THREE.ShaderMaterial({
      uniforms: {
        tBg: { value: rt.texture }, uCamPos: { value: new THREE.Vector3() },
        uCamBasis: { value: new THREE.Matrix3() }, uTanHalfFov: { value: tanHalfFov },
        uAspect: { value: size.width / size.height }, uRs: { value: Rs },
        uResolution: { value: new THREE.Vector2(size.width, size.height) },
        uCamVel: { value: new THREE.Vector3(0, 0, -1) }, uBeta: { value: 0 }, uGamma: { value: 1 },
      },
      vertexShader: LENS_VERT, fragmentShader: LENS_FRAG, depthTest: false, depthWrite: false,
    })
  }, [rt, size.width, size.height])

  // ── Peupler bgScene ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Étoiles
    const sGeo = new THREE.BufferGeometry()
    sGeo.setAttribute('position', new THREE.BufferAttribute(starPos.slice(), 3))
    sGeo.setAttribute('color',    new THREE.BufferAttribute(starColors.slice(), 3))
    bgScene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95,
    })))

    // Voie lactée (diffuse)
    const galMesh = new THREE.Mesh(
      new THREE.TorusGeometry(900, 240, 6, 80),
      new THREE.MeshBasicMaterial({ color: '#334455', transparent: true, opacity: 0.07,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    )
    galMesh.rotation.x = Math.PI / 2.4; galMesh.rotation.z = 0.3
    bgScene.add(galMesh)

    // Jets
    const sR = Rs * 2.6
    ;([-1, 1] as const).forEach(sign => {
      const jM = new THREE.MeshBasicMaterial({ color: '#1133cc', side: THREE.BackSide,
        transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      const j1 = new THREE.Mesh(new THREE.CylinderGeometry(58, 4, 440, 10, 1, true), jM)
      j1.position.y = sign * (sR + 220); if (sign < 0) j1.rotation.z = Math.PI; bgScene.add(j1)
      const jM2 = new THREE.MeshBasicMaterial({ color: '#6688ff', transparent: true, opacity: 0.20,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      const j2 = new THREE.Mesh(new THREE.CylinderGeometry(9, 1.5, 440, 6, 1, true), jM2)
      j2.position.y = sign * (sR + 220); if (sign < 0) j2.rotation.z = Math.PI; bgScene.add(j2)
    })

    // ── Astronef ─────────────────────────────────────────────────────────────
    const group = new THREE.Group()
    const mats: THREE.MeshBasicMaterial[] = []

    const addMesh = (geo: THREE.BufferGeometry, col: string, py = 0) => {
      const mat = new THREE.MeshBasicMaterial({ color: col, toneMapped: false })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.y = py
      group.add(mesh); mats.push(mat); return mat
    }

    addMesh(new THREE.CylinderGeometry(2.8, 2.8, 14, 14), '#bbccdd')       // corps
    addMesh(new THREE.ConeGeometry(2.8, 6, 14), '#99aabb', 10)              // nez
    addMesh(new THREE.CylinderGeometry(0.6, 2.8, 3, 8), '#99aabb', -8.5)   // tuyère
    // Ailes
    addMesh(new THREE.BoxGeometry(22, 0.5, 4), '#8899aa', -2)               // aile H
    addMesh(new THREE.BoxGeometry(0.5, 6, 4), '#7788aa', -2)                // aileron V

    // Lueur moteur
    const glowMat = new THREE.MeshBasicMaterial({
      color: '#4466ff', toneMapped: false,
      blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8,
    })
    const glowMesh = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), glowMat)
    glowMesh.position.y = -9.5; group.add(glowMesh)

    // Orientation : nez vers BH (local +Y = nez = -SHIP_DIR)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SHIP_DIR.clone().negate())
    group.position.copy(SHIP_DIR).multiplyScalar(SHIP_R0)

    bgScene.add(group)
    shipRef.current  = group
    shipMats.current = mats
    shipGlow.current = glowMat

    return () => { bgScene.clear() }
  }, [bgScene])

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
      shipRRef.current = SHIP_R0
      if (shipRef.current) shipRef.current.position.copy(SHIP_DIR).multiplyScalar(SHIP_R0)
    }
    camera.position.copy(START)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  // ── Frame ─────────────────────────────────────────────────────────────────────
  useFrame((_s, delta) => {
    const dt  = Math.min(delta, 0.05)
    const cam = camera as THREE.PerspectiveCamera
    const c   = cRef.current

    // Mouvement caméra
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
      mv.normalize().applyQuaternion(cam.quaternion); mv.y *= 0.35
      if (mv.lengthSq() > 0.01) { mv.normalize(); velRef.current.copy(mv) }
      cam.position.addScaledVector(mv, speed * dt)
      betaLive.current = Math.min(speed / c, 0.999)
    } else {
      betaLive.current *= Math.max(0, 1 - dt * 6)
    }
    if (cam.position.length() < MIN_DIST) cam.position.normalize().multiplyScalar(MIN_DIST)

    const b = betaLive.current
    const g = b > 0.001 ? 1 / Math.sqrt(1 - b * b) : 1
    _vel3.copy(velRef.current)

    // ── Astronef en chute libre Schwarzschild ─────────────────────────────────
    const ship = shipRef.current
    if (ship) {
      let r = shipRRef.current

      // dr/dt = -(1 - Rs/r) × sqrt(Rs/r) × c   (coordonnées Schwarzschild)
      // → ralentit exponentiellement vers Rs → gel apparent
      const drdt = -(1 - Rs / r) * Math.sqrt(Rs / r) * C_SHIP * SHIP_SMUL
      r = Math.max(Rs * 1.04, r + drdt * dt)
      shipRRef.current = r

      // Position
      _shipP.copy(SHIP_DIR).multiplyScalar(r)
      ship.position.copy(_shipP)

      // kG = redshift gravitationnel (1 à l'infini → 0 à l'horizon)
      const kG  = Math.sqrt(Math.max(0, 1 - Rs / r))
      const kG2 = kG * kG

      // Couleur : blanc → orange → rouge → noir
      // Canal R reste haut, G et B s'éteignent
      const rC = Math.min(1, kG2 * 0.15 + 0.75) * kG
      const gC = kG2 * kG  * 0.75
      const bC = kG2 * kG2 * 0.55
      const col = new THREE.Color(rC, gC, bC)

      for (const mat of shipMats.current) mat.color.copy(col)

      // Lueur moteur : bleue → rouge → éteint
      if (shipGlow.current) {
        shipGlow.current.color.setRGB(kG2 * 0.3, kG2 * kG * 0.4, kG2 * kG2)
        shipGlow.current.opacity = kG * 0.8
      }

      // Spaghettification : étirement radial ∝ (Rs/r)² — force de marée
      const tidal   = Math.max(0, (Rs / r) ** 2 * 4)
      const stretchY = 1 + tidal
      const squishXZ = Math.max(0.1, 1 / Math.sqrt(stretchY))
      ship.scale.set(squishXZ, stretchY, squishXZ)

      // Disparition à l'horizon
      ship.visible = kG > 0.02

      // HUD astronef
      if (shipKGRef.current) {
        const pct = (kG * 100).toFixed(1)
        shipKGRef.current.textContent = `${pct}%`
        const hue = Math.round(kG * 30)  // 0=rouge, 30=orange-jaune
        shipKGRef.current.style.color = `hsl(${hue},90%,62%)`
      }
      if (shipDistRef.current) {
        const d = r - Rs
        shipDistRef.current.textContent = `${d.toFixed(0)} u`
        shipDistRef.current.style.color = d < Rs * 2 ? '#ff4444' : d < Rs * 5 ? '#ffaa33' : '#ccaa66'
      }
    }

    // 1. Render bgScene → RT
    gl.setRenderTarget(rt)
    gl.clear()
    gl.render(bgScene, cam)
    gl.setRenderTarget(null)

    // 2. Uniforms lentille
    const u = lensMat.uniforms
    u.uCamPos.value.copy(cam.position)
    const m3 = new THREE.Matrix3(); m3.setFromMatrix4(cam.matrixWorld)
    u.uCamBasis.value.copy(m3)
    u.uCamVel.value.copy(_vel3)
    u.uBeta.value = b; u.uGamma.value = g

    // 3. HUD observateur
    const rC = cam.position.length()
    const kG = rC > Rs ? Math.sqrt(1 - Rs / rC) : 0
    const dH = rC - Rs

    if (betaRef.current)  betaRef.current.textContent  = `β ${b.toFixed(3)}  γ ${g.toFixed(2)}`
    if (sprintRef.current) {
      sprintRef.current.textContent = sprint ? `sprint ×${SPRINT_MUL}  (${speed.toFixed(0)} u/s)` : `${speed.toFixed(0)} u/s`
      sprintRef.current.style.color = sprint ? '#ffee44' : '#888'
    }
    if (dilRef.current) {
      dilRef.current.textContent = `${(kG*100).toFixed(1)}% (τ/t)`
      dilRef.current.style.color = kG < 0.7 ? '#ff4444' : kG < 0.9 ? '#ffaa44' : '#88ff88'
    }
    if (distRef.current) {
      distRef.current.textContent = `${dH.toFixed(0)} u`
      distRef.current.style.color = dH < Rs*2 ? '#ff3333' : dH < Rs*5 ? '#ffaa22' : '#88cc88'
    }
    if (warnRef.current) {
      warnRef.current.style.opacity = dH < Rs*3 ? '1' : '0'
      warnRef.current.style.color   = dH < Rs*1.5 ? '#ff2222' : '#ffaa22'
    }
  }, -1)

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <primitive object={lensMat} attach="material" />
    </mesh>
  )
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function HUD({ cSim, setCSim, onBack, locked, containerRef,
               betaRef, dilRef, distRef, sprintRef, shipKGRef, shipDistRef, warnRef, resetRef }: {
  cSim: number; setCSim: (v: number) => void
  onBack: () => void; locked: boolean
  containerRef:  React.RefObject<HTMLDivElement | null>
  betaRef:       React.RefObject<HTMLSpanElement | null>
  dilRef:        React.RefObject<HTMLSpanElement | null>
  distRef:       React.RefObject<HTMLSpanElement | null>
  sprintRef:     React.RefObject<HTMLSpanElement | null>
  shipKGRef:     React.RefObject<HTMLSpanElement | null>
  shipDistRef:   React.RefObject<HTMLSpanElement | null>
  warnRef:       React.RefObject<HTMLDivElement | null>
  resetRef:      React.MutableRefObject<(() => void) | null>
}) {
  const R = (label: string, ref: React.RefObject<HTMLSpanElement | null>, def: string, col = '#aaa') => (
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:13 }}>
      <span style={{ color:'#445566' }}>{label}</span>
      <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ color: col, fontWeight:600 }}>{def}</span>
    </div>
  )

  return (
    <div style={{ fontFamily:"'SF Mono','Fira Code',monospace", position:'fixed', inset:0, pointerEvents:'none', zIndex:10 }}>
      <ScenePanel title="V9 — Lentille exacte" onBack={onBack} containerRef={containerRef}
        theme="blue" filename="v9-geodesic.webm" width={370}>

        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:14 }}>
            <span style={{ color:'#6688aa' }}>c<sub>sim</sub></span>
            <span style={{ color:'#88ccff', fontWeight:700, fontSize:16 }}>{cSim.toFixed(0)} u/s</span>
          </div>
          <input type="range" min={8} max={80} step={1} value={cSim}
            onChange={e => setCSim(parseFloat(e.target.value))}
            style={{ width:'100%', accentColor:'#4488cc', cursor:'pointer' }} />
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#223344', marginTop:3 }}>
            <span style={{ color:'#4488cc' }}>c=8 → Doppler fort</span>
            <span>c=80 → classique</span>
          </div>
        </div>

        {/* Observateur */}
        <div style={{ background:'rgba(0,0,0,0.6)', borderRadius:8, padding:'10px 13px', marginBottom:10 }}>
          <div style={{ fontSize:11, color:'#223344', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6 }}>Observateur</div>
          {R('β / γ', betaRef, 'β 0.000  γ 1.00', '#88ccff')}
          {R('vitesse', sprintRef, `${BASE_SPEED} u/s`, '#888')}
          {R('dist. horizon', distRef, '—', '#88cc88')}
          {R('dilatation τ/t', dilRef, '100%', '#88ff88')}
        </div>

        {/* Astronef */}
        <div style={{ background:'rgba(80,30,0,0.22)', border:'1px solid rgba(200,100,20,0.25)', borderRadius:8, padding:'10px 13px', marginBottom:10 }}>
          <div style={{ fontSize:11, color:'#664422', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6 }}>
            Astronef en chute libre
          </div>
          {R('redshift kG', shipKGRef, '100%', '#ffbb44')}
          {R('dist. horizon', shipDistRef, '—', '#cc8844')}
          <div style={{ fontSize:11, color:'#553322', marginTop:5, lineHeight:1.7 }}>
            Gel apparent · kG→0 · Spaghettification<br />
            <span style={{ color:'#886644' }}>Le navire ne traverse jamais l'horizon</span>
          </div>
        </div>

        {/* Shader */}
        <div style={{ background:'rgba(0,20,50,0.2)', borderRadius:8, padding:'10px 13px', marginBottom:10, fontSize:12, lineHeight:1.9 }}>
          <div style={{ fontSize:11, color:'#223344', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:5 }}>Géodésiques</div>
          <div><span style={{ color:'#667788' }}>Pas / pixel</span><span style={{ color:'#88aacc', float:'right' }}>320</span></div>
          <div><span style={{ color:'#667788' }}>Photon sphere</span><span style={{ color:'#ffaa44', float:'right' }}>1.5 Rs</span></div>
          <div><span style={{ color:'#667788' }}>Hits disque</span><span style={{ color:'#aaa', float:'right' }}>3 max</span></div>
        </div>

        <div style={{ background:'rgba(0,0,0,0.25)', borderRadius:8, padding:'9px 13px', marginBottom:10, fontSize:12, color:'#334455', lineHeight:1.9 }}>
          <div style={{ fontSize:11, color:'#445566', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:4 }}>Contrôles</div>
          <div><span style={{ color:'#6699bb' }}>WASD</span> · <span style={{ color:'#ffee44' }}>Shift</span> ×{SPRINT_MUL} · <span style={{ color:'#66bb66' }}>Espace/Ctrl</span> ↑↓</div>
          <div style={{ color:'#334455', fontSize:11, marginTop:3 }}>Ctrl↓ → plan équatorial → image secondaire</div>
        </div>

        <button onClick={() => resetRef.current?.()}
          style={{ width:'100%', padding:'9px 0', cursor:'pointer', background:'rgba(20,60,100,0.25)', border:'1px solid rgba(80,150,220,0.4)', borderRadius:8, color:'#88bbdd', fontSize:13, fontFamily:'inherit', letterSpacing:'0.08em', transition:'all 0.15s' }}
          onMouseEnter={e => { const b=e.target as HTMLButtonElement; b.style.background='rgba(40,100,160,0.4)'; b.style.color='#cceeFF' }}
          onMouseLeave={e => { const b=e.target as HTMLButtonElement; b.style.background='rgba(20,60,100,0.25)'; b.style.color='#88bbdd' }}>
          ↺ Réinitialiser (repart de zéro)
        </button>
      </ScenePanel>

      <div ref={warnRef as React.RefObject<HTMLDivElement>} style={{
        position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-160px)',
        fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', opacity:0,
        transition:'opacity 0.4s', pointerEvents:'none', textAlign:'center', textShadow:'0 0 20px currentColor',
      }}>
        ⚠ HORIZON PROCHE — POINT DE NON-RETOUR
      </div>

      {locked && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', pointerEvents:'none' }}>
          <div style={{ width:1, height:16, background:'rgba(100,180,255,0.5)', margin:'0 auto' }} />
          <div style={{ width:16, height:1, background:'rgba(100,180,255,0.5)', marginTop:-8.5 }} />
        </div>
      )}

      {!locked && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ background:'rgba(0,4,10,0.97)', border:'1px solid rgba(80,150,255,0.45)', borderRadius:18, padding:'34px 66px', textAlign:'center', backdropFilter:'blur(22px)' }}>
            <div style={{ color:'#4488cc', fontSize:11, letterSpacing:'0.3em', textTransform:'uppercase', marginBottom:14 }}>V9 — Geodesic Lensing</div>
            <div style={{ color:'#cce8ff', fontSize:26, fontWeight:700, marginBottom:12 }}>Image Secondaire</div>
            <div style={{ color:'#223344', fontSize:14, lineHeight:1.9 }}>
              320 pas de géodésique / pixel (GPU)<br />
              Disque : image directe + secondaire<br />
              <span style={{ color:'#886644' }}>Astronef en chute → gel + redshift + spaghettification</span><br /><br />
              <span style={{ color:'#336688', fontSize:12 }}>Ctrl↓ pour descendre au plan équatorial</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export function V9Scene({ onBack }: { onBack: () => void }) {
  const [cSim, setCSim]     = useState(30)
  const [locked, setLocked] = useState(false)
  const containerRef  = useRef<HTMLDivElement>(null)
  const betaRef       = useRef<HTMLSpanElement>(null)
  const dilRef        = useRef<HTMLSpanElement>(null)
  const distRef       = useRef<HTMLSpanElement>(null)
  const sprintRef     = useRef<HTMLSpanElement>(null)
  const shipKGRef     = useRef<HTMLSpanElement>(null)
  const shipDistRef   = useRef<HTMLSpanElement>(null)
  const warnRef       = useRef<HTMLDivElement>(null)
  const resetRef      = useRef<(() => void) | null>(null)
  const onLock        = useCallback(() => setLocked(true),  [])
  const onUnlock      = useCallback(() => setLocked(false), [])

  return (
    <div ref={containerRef} style={{ width:'100vw', height:'100vh', background:'#00000a', position:'relative' }}>
      <Canvas
        camera={{ position: START.toArray(), fov: FOV_DEG, near: 0.5, far: 8000 }}
        gl={{ antialias: false, preserveDrawingBuffer: true, toneMapping: THREE.NoToneMapping }}
        shadows={false}
      >
        <color attach="background" args={['#00000a']} />
        <World
          cSim={cSim} locked={locked}
          betaRef={betaRef} dilRef={dilRef} distRef={distRef}
          sprintRef={sprintRef} shipKGRef={shipKGRef} shipDistRef={shipDistRef}
          warnRef={warnRef} resetRef={resetRef}
        />
        <PointerLockControls onLock={onLock} onUnlock={onUnlock} />
      </Canvas>
      <HUD cSim={cSim} setCSim={setCSim} onBack={onBack} locked={locked}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
        betaRef={betaRef} dilRef={dilRef} distRef={distRef}
        sprintRef={sprintRef} shipKGRef={shipKGRef} shipDistRef={shipDistRef}
        warnRef={warnRef} resetRef={resetRef} />
    </div>
  )
}
