/**
 * V11 - Light Cone Drive
 *
 * Shader-first R-bas prototype.
 * Each pixel casts a ray into an analytic world, finds the visible event,
 * then samples object state at t_emit = t_now - distance / c_effective.
 */

import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ScenePanel } from '../components/ScenePanel'
import {
  DEFAULT_INTERNAL_CHANGE_SPEED,
  betaFromSpeed,
  effectiveLightSpeed,
  forwardAngularScale,
  gammaFromBeta,
  retardedTime,
} from '../physics/relativity'

const START = new THREE.Vector3(0, 8, 76)
const BASE_SPEED = 13
const SPRINT_MUL = 3.2
const FOV_DEG = 74
const LOOK_SENS = 0.0026
const PITCH_LIMIT = Math.PI * 0.48

const VERT = /* glsl */`
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const FRAG = /* glsl */`
  precision highp float;

  uniform vec2  uResolution;
  uniform vec3  uCamPos;
  uniform mat3  uCamBasis;
  uniform float uTanHalfFov;
  uniform float uAspect;
  uniform float uTime;
  uniform float uC;
  uniform float uR;
  uniform vec3  uVel;
  uniform float uBeta;
  uniform float uGamma;
  uniform float uExposure;
  uniform float uShowCone;
  uniform float uFog;

  const float FAR_T = 700.0;
  const float PI = 3.14159265359;

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  vec3 palette(float h) {
    vec3 p = abs(fract(vec3(h, h + 0.66, h + 0.33)) * 6.0 - 3.0);
    return clamp(p - 1.0, 0.0, 1.0);
  }

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  float gridLine(float v, float stepSize) {
    float d = abs(fract(v / stepSize - 0.5) - 0.5) * stepSize;
    return 1.0 - smoothstep(0.0, 0.035, d);
  }

  float sphereHit(vec3 ro, vec3 rd, vec3 center, float radius) {
    vec3 oc = ro - center;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return -1.0;
    h = sqrt(h);
    float t0 = -b - h;
    float t1 = -b + h;
    if (t0 > 0.02) return t0;
    if (t1 > 0.02) return t1;
    return -1.0;
  }

  vec3 aberrateInverse(vec3 rdObs, vec3 velDir, float beta) {
    if (beta < 0.001) return rdObs;
    float cosObs = dot(rdObs, velDir);
    float cosLab = clamp((cosObs - beta) / (1.0 - beta * cosObs), -1.0, 1.0);
    vec3 perp = rdObs - cosObs * velDir;
    float lp = length(perp);
    vec3 perpH = lp > 1e-5 ? perp / lp : normalize(cross(velDir, vec3(0.0, 1.0, 0.0)));
    float sinLab = sqrt(max(0.0, 1.0 - cosLab * cosLab));
    return normalize(cosLab * velDir + sinLab * perpH);
  }

  vec3 skyColor(vec3 rd) {
    float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(vec3(0.015, 0.022, 0.040), vec3(0.045, 0.070, 0.120), up);
    vec3 cell = floor(rd * 170.0);
    float h = hash(dot(cell, vec3(12.9898, 78.233, 37.719)));
    float star = smoothstep(0.996, 1.0, h) * (0.6 + 0.4 * hash(h * 51.7));
    vec3 band = vec3(0.12, 0.18, 0.28) * pow(max(0.0, 1.0 - abs(rd.y) * 2.0), 3.0);
    return sky + band + vec3(star);
  }

  vec3 beaconCenter(int i) {
    float fi = float(i);
    float a = fi * PI * 2.0 / 9.0;
    float ring = 36.0 + 7.0 * sin(fi * 1.73);
    return vec3(cos(a) * ring, 7.0 + 3.0 * sin(fi * 2.11), sin(a) * ring);
  }

  vec3 shadeBeacon(int i, vec3 p, vec3 normal, float tEmit, float dist) {
    float fi = float(i);
    float phase = tEmit * (0.32 + fi * 0.025) + fi * 0.19;
    float pulse = 0.5 + 0.5 * sin(phase * PI * 2.0);
    float ring = smoothstep(0.10, 0.0, abs(fract(phase) - 0.5) - 0.43);
    vec3 hue = palette(fract(fi * 0.113 + tEmit * 0.035));
    vec3 sunDir = normalize(vec3(-0.45, 0.68, 0.32));
    float diff = max(0.0, dot(normal, sunDir));
    float rim = pow(max(0.0, 1.0 + dot(normal, normalize(p - uCamPos))), 2.0);
    vec3 surface = hue * (0.18 + diff * 0.55) + hue * pulse * 0.52;
    surface += vec3(0.25, 0.65, 1.0) * rim * 0.55;
    surface += hue * ring * (1.7 + 18.0 / max(8.0, dist));
    return surface;
  }

  vec3 shadeFloor(vec3 p, float tEmit) {
    float minor = max(gridLine(p.x, 4.0), gridLine(p.z, 4.0));
    float major = max(gridLine(p.x, 20.0), gridLine(p.z, 20.0));
    float d = length(p.xz);
    float wave = 1.0 - smoothstep(0.0, 0.09, abs(sin(d * 0.18 - tEmit * 2.3)));
    vec3 base = vec3(0.020, 0.030, 0.052);
    base += minor * vec3(0.020, 0.055, 0.085);
    base += major * vec3(0.030, 0.120, 0.200);
    base += wave * vec3(0.15, 0.42, 0.85) * (0.26 + 0.18 / max(uR, 0.08));
    return base;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 ndc = uv * 2.0 - 1.0;

    vec3 right = uCamBasis[0];
    vec3 up = uCamBasis[1];
    vec3 forward = -uCamBasis[2];

    vec3 rdObs = normalize(
      right * (ndc.x * uAspect * uTanHalfFov) +
      up * (ndc.y * uTanHalfFov) +
      forward
    );

    float cosObs = dot(rdObs, uVel);
    vec3 rd = aberrateInverse(rdObs, uVel, uBeta);
    vec3 ro = uCamPos;
    vec3 sky = skyColor(rd);

    float hitT = FAR_T;
    vec3 hitColor = sky;
    vec3 hitPos = ro + rd * FAR_T;
    vec3 hitNormal = vec3(0.0, 1.0, 0.0);
    float hitEmit = uTime - FAR_T / uC;
    float hitKind = 0.0;

    if (abs(rd.y) > 0.0005) {
      float tFloor = -ro.y / rd.y;
      if (tFloor > 0.02 && tFloor < hitT) {
        hitT = tFloor;
        hitPos = ro + rd * hitT;
        hitNormal = vec3(0.0, 1.0, 0.0);
        hitEmit = uTime - hitT / uC;
        hitColor = shadeFloor(hitPos, hitEmit);
        hitKind = 1.0;
      }
    }

    for (int i = 0; i < 9; i++) {
      vec3 center = beaconCenter(i);
      float tS = sphereHit(ro, rd, center, 3.1);
      if (tS > 0.0 && tS < hitT) {
        hitT = tS;
        hitPos = ro + rd * hitT;
        hitNormal = normalize(hitPos - center);
        hitEmit = uTime - hitT / uC;
        hitColor = shadeBeacon(i, hitPos, hitNormal, hitEmit, hitT);
        hitKind = 2.0;
      }
    }

    float tCore = sphereHit(ro, rd, vec3(0.0, 8.0, 0.0), 5.2);
    if (tCore > 0.0 && tCore < hitT) {
      hitT = tCore;
      hitPos = ro + rd * hitT;
      hitNormal = normalize(hitPos - vec3(0.0, 8.0, 0.0));
      hitEmit = uTime - hitT / uC;
      float heartbeat = 0.5 + 0.5 * sin(hitEmit * PI * 2.0 * 0.55);
      vec3 core = mix(vec3(0.08, 0.55, 1.4), vec3(1.4, 0.20, 0.08), heartbeat);
      float rim = pow(max(0.0, 1.0 + dot(hitNormal, rd)), 3.0);
      hitColor = core * (0.55 + heartbeat * 1.7) + vec3(0.7, 0.95, 1.4) * rim;
      hitKind = 3.0;
    }

    vec3 col = hitColor;

    if (hitKind > 0.5 && uShowCone > 0.5) {
      float conePhase = abs(sin((hitT / uC - uTime * 0.42) * PI * 2.0));
      float coneBand = 1.0 - smoothstep(0.0, 0.055, conePhase);
      col += vec3(0.20, 0.52, 1.10) * coneBand * (0.32 + 0.20 / max(uR, 0.2));
    }

    if (hitKind > 0.5) {
      float fog = 1.0 - exp(-hitT * 0.012 * uFog);
      col = mix(col, sky * 0.72, clamp(fog, 0.0, 0.82));
    }

    float D = uGamma > 1.001 ? 1.0 / (uGamma * max(1e-5, 1.0 - uBeta * cosObs)) : 1.0;
    vec3 dopplerBlue = vec3(0.56, 0.75, 1.15);
    vec3 dopplerRed = vec3(1.18, 0.34, 0.16);
    col = D >= 1.0
      ? mix(col, col * dopplerBlue, clamp((D - 1.0) / 2.2, 0.0, 0.78))
      : mix(col, col * dopplerRed, clamp((1.0 - D) / 0.75, 0.0, 0.82));
    col *= clamp(pow(D, 2.35), 0.16, 6.0);

    float centerGlow = pow(max(0.0, dot(rdObs, uVel)), 16.0) * uBeta;
    col += vec3(0.20, 0.36, 0.75) * centerGlow;

    gl_FragColor = vec4(aces(col * uExposure), 1.0);
  }
`

const _move = new THREE.Vector3()
const _vel = new THREE.Vector3(0, 0, -1)
const _basis = new THREE.Matrix3()
const _lookEuler = new THREE.Euler(0, 0, 0, 'YXZ')

interface WorldProps {
  rRatio: number
  exposure: number
  showCone: boolean
  fog: number
  active: boolean
  setActive: (v: boolean) => void
  betaRef: React.RefObject<HTMLSpanElement | null>
  cRef: React.RefObject<HTMLSpanElement | null>
  lagRef: React.RefObject<HTMLSpanElement | null>
  sprintRef: React.RefObject<HTMLSpanElement | null>
  coneRef: React.RefObject<HTMLSpanElement | null>
  resetRef: React.MutableRefObject<(() => void) | null>
}

function World({
  rRatio,
  exposure,
  showCone,
  fog,
  active,
  setActive,
  betaRef,
  cRef,
  lagRef,
  sprintRef,
  coneRef,
  resetRef,
}: WorldProps) {
  const { camera, size, gl } = useThree()
  const rRef = useRef(rRatio); rRef.current = rRatio
  const exposureRef = useRef(exposure); exposureRef.current = exposure
  const coneFlagRef = useRef(showCone); coneFlagRef.current = showCone
  const fogRef = useRef(fog); fogRef.current = fog
  const activeRef = useRef(active); activeRef.current = active
  const keys = useRef<Set<string>>(new Set())
  const velRef = useRef(new THREE.Vector3(0, 0, -1))
  const betaLive = useRef(0)

  const mat = useRef(new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uCamPos: { value: new THREE.Vector3() },
      uCamBasis: { value: new THREE.Matrix3() },
      uTanHalfFov: { value: Math.tan((FOV_DEG * Math.PI / 180) / 2) },
      uAspect: { value: size.width / size.height },
      uTime: { value: 0 },
      uC: { value: effectiveLightSpeed(rRatio) },
      uR: { value: rRatio },
      uVel: { value: new THREE.Vector3(0, 0, -1) },
      uBeta: { value: 0 },
      uGamma: { value: 1 },
      uExposure: { value: exposure },
      uShowCone: { value: showCone ? 1 : 0 },
      uFog: { value: fog },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  }))

  useEffect(() => {
    const movementCodes = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Space', 'ControlLeft', 'ShiftLeft', 'ShiftRight',
    ])
    const dn = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'BUTTON'
      if (e.code === 'Escape') {
        keys.current.clear()
        setActive(false)
        return
      }
      if (editing || !movementCodes.has(e.code)) return
      if (activeRef.current) e.preventDefault()
      keys.current.add(e.code)
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', dn)
      window.removeEventListener('keyup', up)
    }
  }, [setActive])

  useEffect(() => {
    const canvas = gl.domElement
    let dragging = false
    let lastX = 0
    let lastY = 0

    const setCursor = () => {
      canvas.style.cursor = activeRef.current ? 'grab' : 'crosshair'
    }

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      setActive(true)
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture?.(e.pointerId)
      canvas.style.cursor = 'grabbing'
    }

    const move = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      const cam = camera as THREE.PerspectiveCamera
      _lookEuler.setFromQuaternion(cam.quaternion)
      _lookEuler.y -= dx * LOOK_SENS
      _lookEuler.x = THREE.MathUtils.clamp(_lookEuler.x - dy * LOOK_SENS, -PITCH_LIMIT, PITCH_LIMIT)
      _lookEuler.z = 0
      cam.quaternion.setFromEuler(_lookEuler)
    }

    const up = (e: PointerEvent) => {
      dragging = false
      canvas.releasePointerCapture?.(e.pointerId)
      setCursor()
    }

    const leave = () => {
      dragging = false
      setCursor()
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('pointerleave', leave)
    setCursor()

    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('pointerleave', leave)
      canvas.style.cursor = ''
    }
  }, [camera, gl, setActive])

  useEffect(() => {
    gl.domElement.style.cursor = active ? 'grab' : 'crosshair'
  }, [active, gl])

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    resetRef.current = () => {
      cam.position.copy(START)
      cam.rotation.set(0, 0, 0)
      betaLive.current = 0
      velRef.current.set(0, 0, -1)
      keys.current.clear()
      setActive(false)
    }
    cam.position.copy(START)
  }, [camera, resetRef, setActive])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    const cam = camera as THREE.PerspectiveCamera
    const cEff = effectiveLightSpeed(rRef.current)
    const sprint = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight')
    const speed = BASE_SPEED * (sprint ? SPRINT_MUL : 1)

    _move.set(0, 0, 0)
    if (activeRef.current) {
      if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) _move.z -= 1
      if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) _move.z += 1
      if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) _move.x -= 1
      if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) _move.x += 1
      if (keys.current.has('Space')) _move.y += 0.48
      if (keys.current.has('ControlLeft')) _move.y -= 0.48
    }

    if (_move.lengthSq() > 0.0001) {
      _move.normalize().applyQuaternion(cam.quaternion)
      if (_move.lengthSq() > 0.001) {
        _move.normalize()
        velRef.current.copy(_move)
      }
      cam.position.addScaledVector(_move, speed * dt)
      if (cam.position.y < 1.6) cam.position.y = 1.6
      betaLive.current += (betaFromSpeed(speed, cEff) - betaLive.current) * Math.min(dt * 8, 1)
    } else {
      betaLive.current *= Math.max(0, 1 - dt * 5)
    }

    const beta = betaLive.current
    const gamma = gammaFromBeta(beta)
    _vel.copy(velRef.current).normalize()
    _basis.setFromMatrix4(cam.matrixWorld)

    const u = mat.current.uniforms
    u.uResolution.value.set(size.width, size.height)
    u.uAspect.value = size.width / size.height
    u.uCamPos.value.copy(cam.position)
    u.uCamBasis.value.copy(_basis)
    u.uTime.value = state.clock.elapsedTime
    u.uC.value = cEff
    u.uR.value = rRef.current
    u.uVel.value.copy(_vel)
    u.uBeta.value = beta
    u.uGamma.value = gamma
    u.uExposure.value = exposureRef.current
    u.uShowCone.value = coneFlagRef.current ? 1 : 0
    u.uFog.value = fogRef.current

    if (betaRef.current) betaRef.current.textContent = `beta ${beta.toFixed(3)}  gamma ${gamma.toFixed(2)}`
    if (cRef.current) cRef.current.textContent = `${cEff.toFixed(2)} u/s`
    if (lagRef.current) {
      const tEmit = retardedTime(state.clock.elapsedTime, 60, cEff)
      const lag = state.clock.elapsedTime - tEmit
      lagRef.current.textContent = `${lag.toFixed(2)}s at 60u`
      lagRef.current.style.color = lag > 8 ? '#ff9a66' : lag > 3 ? '#ffd166' : '#8fcfff'
    }
    if (sprintRef.current) {
      sprintRef.current.textContent = sprint ? `sprint x${SPRINT_MUL} (${speed.toFixed(0)} u/s)` : `${speed.toFixed(0)} u/s`
      sprintRef.current.style.color = beta > 0.9 ? '#ffcc66' : '#9cb7d8'
    }
    if (coneRef.current) {
      coneRef.current.textContent = coneFlagRef.current ? 'visible' : 'hidden'
      coneRef.current.style.color = coneFlagRef.current ? '#8fd3ff' : '#4c607c'
    }
  }, -1)

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <primitive object={mat.current} attach="material" />
    </mesh>
  )
}

function Hud({
  rRatio,
  setRRatio,
  exposure,
  setExposure,
  showCone,
  setShowCone,
  fog,
  setFog,
  active,
  onBack,
  containerRef,
  betaRef,
  cRef,
  lagRef,
  sprintRef,
  coneRef,
  resetRef,
}: {
  rRatio: number
  setRRatio: (v: number) => void
  exposure: number
  setExposure: (v: number) => void
  showCone: boolean
  setShowCone: (v: boolean) => void
  fog: number
  setFog: (v: number) => void
  active: boolean
  onBack: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
  betaRef: React.RefObject<HTMLSpanElement | null>
  cRef: React.RefObject<HTMLSpanElement | null>
  lagRef: React.RefObject<HTMLSpanElement | null>
  sprintRef: React.RefObject<HTMLSpanElement | null>
  coneRef: React.RefObject<HTMLSpanElement | null>
  resetRef: React.MutableRefObject<(() => void) | null>
}) {
  const cEff = effectiveLightSpeed(rRatio)
  const betaWalk = betaFromSpeed(BASE_SPEED, cEff)
  const gammaWalk = gammaFromBeta(betaWalk)
  const scale = forwardAngularScale(betaWalk)

  const Row = (label: string, ref: React.RefObject<HTMLSpanElement | null>, def: string, col = '#9cb7d8') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: '#53667f' }}>{label}</span>
      <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ color: col, fontWeight: 700 }}>{def}</span>
    </div>
  )

  return (
    <div style={{ fontFamily: "'SF Mono','Fira Code',monospace", position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <ScenePanel title="V11 - Light Cone Drive" onBack={onBack} containerRef={containerRef}
        theme="blue" filename="v11-light-cone-drive.webm" width={380}>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 14 }}>
            <span style={{ color: '#7890b0' }}>R ratio</span>
            <span style={{ color: '#8fd3ff', fontWeight: 800, fontSize: 16 }}>{rRatio.toFixed(2)}</span>
          </div>
          <input type="range" min={0.15} max={5} step={0.01} value={rRatio}
            onChange={e => setRRatio(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#54b6ff', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#334357', marginTop: 3 }}>
            <span style={{ color: '#ff9a66' }}>R bas: cones visibles</span>
            <span>R haut: quasi classique</span>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.58)', borderRadius: 8, padding: '10px 13px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: '#2f4058', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 7 }}>Light cone model</div>
          {Row('c effective', cRef, `${cEff.toFixed(2)} u/s`, '#8fd3ff')}
          {Row('motion', sprintRef, `${BASE_SPEED} u/s`, '#9cb7d8')}
          {Row('beta / gamma', betaRef, `beta ${betaWalk.toFixed(3)} gamma ${gammaWalk.toFixed(2)}`, '#ffd166')}
          {Row('retard', lagRef, `${(60 / cEff).toFixed(2)}s at 60u`, '#8fcfff')}
          {Row('cone overlay', coneRef, showCone ? 'visible' : 'hidden', showCone ? '#8fd3ff' : '#4c607c')}
        </div>

        <div style={{ background: 'rgba(7,24,46,0.42)', border: '1px solid rgba(80,160,230,0.18)', borderRadius: 8, padding: '10px 13px', marginBottom: 10, fontSize: 12, color: '#61738d', lineHeight: 1.8 }}>
          <div style={{ color: '#8aa6c8', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Photographic readout</div>
          <div>Pixels sample events at <span style={{ color: '#8fd3ff' }}>t_emit = now - distance / c</span>.</div>
          <div>Forward angular scale at walking speed: <span style={{ color: '#ffd166' }}>x{scale.toFixed(2)}</span>.</div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '10px 13px', marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#8da4c0', pointerEvents: 'auto', cursor: 'pointer' }}>
            <span>Show light-cone bands</span>
            <input type="checkbox" checked={showCone} onChange={e => setShowCone(e.target.checked)} />
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#53667f' }}>exposure</span>
            <span style={{ color: '#8fd3ff' }}>{exposure.toFixed(2)}</span>
          </div>
          <input type="range" min={0.35} max={1.65} step={0.05} value={exposure}
            onChange={e => setExposure(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#54b6ff', cursor: 'pointer' }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#53667f' }}>depth fog</span>
            <span style={{ color: '#8fd3ff' }}>{fog.toFixed(2)}</span>
          </div>
          <input type="range" min={0} max={1.4} step={0.05} value={fog}
            onChange={e => setFog(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#54b6ff', cursor: 'pointer' }} />
        </div>

        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '9px 13px', marginBottom: 10, fontSize: 12, color: '#415069', lineHeight: 1.9 }}>
          <div style={{ color: '#586f91', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Controls</div>
          <div><span style={{ color: '#8fd3ff' }}>WASD</span> - <span style={{ color: '#ffd166' }}>Shift</span> speed - <span style={{ color: '#9de2b5' }}>Space/Ctrl</span> up/down</div>
          <div>{active ? 'Drag mouse to look - Esc pauses controls' : 'Click the view, then drag mouse to look'}</div>
        </div>

        <button onClick={() => resetRef.current?.()}
          style={{ width: '100%', padding: '9px 0', cursor: 'pointer', background: 'rgba(20,60,100,0.25)', border: '1px solid rgba(80,150,220,0.4)', borderRadius: 8, color: '#8fcfff', fontSize: 13, fontFamily: 'inherit', letterSpacing: '0.08em', pointerEvents: 'auto' }}>
          Reset observer
        </button>
      </ScenePanel>

      {active && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
          <div style={{ width: 1, height: 16, background: 'rgba(130,210,255,0.62)', margin: '0 auto' }} />
          <div style={{ width: 16, height: 1, background: 'rgba(130,210,255,0.62)', marginTop: -8.5 }} />
        </div>
      )}

      {!active && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(3,8,16,0.96)', border: '1px solid rgba(90,170,255,0.45)', borderRadius: 18, padding: '34px 58px', textAlign: 'center', backdropFilter: 'blur(22px)' }}>
            <div style={{ color: '#6bbcff', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 14 }}>V11 - Light Cone Drive</div>
            <div style={{ color: '#d7ecff', fontSize: 26, fontWeight: 800, marginBottom: 12 }}>R-bas as a photograph</div>
            <div style={{ color: '#53667f', fontSize: 14, lineHeight: 1.9 }}>
              Every pixel samples the world at its emission time<br />
              Low R makes wavefronts, color lag and beaming visible<br />
              <span style={{ color: '#8fd3ff' }}>Click to fly - drag to look - WASD to move</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function V11Scene({ onBack }: { onBack: () => void }) {
  const [rRatio, setRRatio] = useState(0.62)
  const [exposure, setExposure] = useState(0.88)
  const [showCone, setShowCone] = useState(true)
  const [fog, setFog] = useState(0.75)
  const [active, setActive] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const betaRef = useRef<HTMLSpanElement>(null)
  const cRef = useRef<HTMLSpanElement>(null)
  const lagRef = useRef<HTMLSpanElement>(null)
  const sprintRef = useRef<HTMLSpanElement>(null)
  const coneRef = useRef<HTMLSpanElement>(null)
  const resetRef = useRef<(() => void) | null>(null)

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', background: '#030812', position: 'relative' }}>
      <Canvas
        camera={{ position: START.toArray(), fov: FOV_DEG, near: 0.1, far: 1200 }}
        gl={{ antialias: false, preserveDrawingBuffer: true, toneMapping: THREE.NoToneMapping }}
        shadows={false}
      >
        <World
          rRatio={rRatio}
          exposure={exposure}
          showCone={showCone}
          fog={fog}
          active={active}
          setActive={setActive}
          betaRef={betaRef}
          cRef={cRef}
          lagRef={lagRef}
          sprintRef={sprintRef}
          coneRef={coneRef}
          resetRef={resetRef}
        />
      </Canvas>
      <Hud
        rRatio={rRatio}
        setRRatio={setRRatio}
        exposure={exposure}
        setExposure={setExposure}
        showCone={showCone}
        setShowCone={setShowCone}
        fog={fog}
        setFog={setFog}
        active={active}
        onBack={onBack}
        containerRef={containerRef as React.RefObject<HTMLDivElement | null>}
        betaRef={betaRef}
        cRef={cRef}
        lagRef={lagRef}
        sprintRef={sprintRef}
        coneRef={coneRef}
        resetRef={resetRef}
      />
    </div>
  )
}
