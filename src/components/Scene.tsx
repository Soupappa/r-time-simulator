import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Mountain } from '../objects/Mountain'
import { Moon } from '../objects/Moon'
import { Tree } from '../objects/Tree'
import { House } from '../objects/House'
import { Character } from '../objects/Character'
import { Cup } from '../objects/Cup'
import { useSimStore } from '../store'
import { TemporalLabels } from './TemporalLabels'
import { FPSControls } from './FPSControls'
import { Environment } from './Environment'

function Valley() {
  return (
    <group>
      {/* Main ground — bright grass green */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -60]} receiveShadow>
        <planeGeometry args={[400, 400, 1, 1]} />
        <meshLambertMaterial color="#3d5e25" />
      </mesh>
      {/* Near ground — slightly richer */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -5]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshLambertMaterial color="#4a6e2e" />
      </mesh>
      {/* Table for cup */}
      <mesh position={[-1.5, 0.7, -3]}>
        <boxGeometry args={[0.8, 0.08, 0.5]} />
        <meshLambertMaterial color="#8a6040" />
      </mesh>
      <mesh position={[-1.5, 0.38, -3]}>
        <boxGeometry args={[0.06, 0.62, 0.06]} />
        <meshLambertMaterial color="#7a5030" />
      </mesh>
      {/* Rolling hills — varied greens */}
      {[
        [-22, -1.5, -25,  14, 5,  18, '#344e1a'],
        [ 28, -1.5, -40,  16, 6,  14, '#3c5820'],
        [-20, -2,   -62,  24, 8,  22, '#2e4818'],
        [ 35, -2,   -68,  20, 7,  17, '#385220'],
        [ -6, -2.5, -105, 34, 10, 28, '#2a4214'],
        [ 52, -2,   -75,  22, 6,  20, '#344e1a'],
        [-45, -2,   -80,  26, 8,  22, '#304618'],
        [  8, -1,   -110, 30, 9,  26, '#2c4416'],
      ].map(([x, y, z, rx, ry, rz, col], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]} scale={[rx as number, ry as number, rz as number]}>
          <sphereGeometry args={[1, 6, 5]} />
          <meshLambertMaterial color={col as string} />
        </mesh>
      ))}
    </group>
  )
}

function Sky() {
  return (
    <group>
      {/* Sky dome — golden hour, warm blue-orange dusk */}
      <mesh>
        <sphereGeometry args={[450, 16, 10]} />
        <meshBasicMaterial color="#1e3060" side={THREE.BackSide} />
      </mesh>
      {/* Upper-mid sky — lighter blue */}
      <mesh>
        <sphereGeometry args={[449, 16, 6]} />
        <meshBasicMaterial color="#2a4a80" side={THREE.BackSide} transparent opacity={0.5} />
      </mesh>
      {/* Horizon band — warm peach/amber */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[448, 448, 120, 24, 1, true]} />
        <meshBasicMaterial color="#c86020" side={THREE.BackSide} transparent opacity={0.35} />
      </mesh>
      {/* Low horizon glow — bright golden */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[447, 447, 50, 24, 1, true]} />
        <meshBasicMaterial color="#e08030" side={THREE.BackSide} transparent opacity={0.4} />
      </mesh>
      {/* Sun disc */}
      <mesh position={[-80, 30, -420]}>
        <sphereGeometry args={[18, 10, 8]} />
        <meshBasicMaterial color="#ffe080" />
      </mesh>
      {/* Sun halo */}
      <mesh position={[-80, 30, -419]}>
        <sphereGeometry args={[28, 10, 8]} />
        <meshBasicMaterial color="#ffaa40" transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

function Stars() {
  const geo = useRef(new THREE.BufferGeometry())
  const count = 1200
  useEffect(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 400
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 40
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    geo.current.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  }, [])

  return (
    <points>
      <primitive object={geo.current} attach="geometry" />
      <pointsMaterial size={1.2} color="#ccd8ff" sizeAttenuation />
    </points>
  )
}

function Lighting() {
  return (
    <>
      {/* Main sun — golden hour, low angle from left */}
      <directionalLight
        position={[-80, 35, 30]}
        intensity={2.2}
        color="#ffd080"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={300}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      {/* Sky fill — blue from above */}
      <directionalLight position={[20, 60, -30]} intensity={0.9} color="#8ab0e0" />
      {/* Warm bounce from ground */}
      <directionalLight position={[0, -5, 10]} intensity={0.4} color="#c87820" />
      {/* Ambient — warm base, not too dark */}
      <ambientLight intensity={0.85} color="#a0b0d0" />
      {/* Hemisphere sky/ground */}
      <hemisphereLight args={['#6080c0', '#5a7030', 0.7]} />
    </>
  )
}

function Fog() {
  const { scene } = useThree()
  useEffect(() => {
    scene.fog = new THREE.FogExp2('#4a6080', 0.0028)
    return () => { scene.fog = null }
  }, [scene])
  return null
}

function DemoCamera() {
  const { camera } = useThree()
  const tRef = useRef(0)

  useEffect(() => {
    camera.position.set(2, 6, -10)
    camera.lookAt(0, 4, -80)
  }, [camera])

  useFrame((_, delta) => {
    tRef.current += delta * 0.06
    // Move from far to near the mountain and back
    const t = (Math.sin(tRef.current) * 0.5 + 0.5)
    const z = THREE.MathUtils.lerp(-75, -8, t)
    const y = THREE.MathUtils.lerp(10, 4, t)
    camera.position.set(1, y, z)
    camera.lookAt(0, 3, z - 15)
  })

  return null
}

export function Scene({ canvasRef }: { canvasRef?: React.RefObject<HTMLCanvasElement | null> }) {
  const { cameraMode } = useSimStore()
  const { gl, camera } = useThree()

  useEffect(() => {
    if (canvasRef) {
      (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = gl.domElement
    }
  }, [gl, canvasRef])

  // Point camera toward mountain on first load
  useEffect(() => {
    camera.lookAt(0, 4, -80)
  }, [camera])

  return (
    <>
      <Fog />
      <Sky />
      <Stars />
      <Lighting />
      <Valley />
      <Environment />
      <Mountain />
      <Moon />
      <Tree />
      <House />
      <Character />
      <Cup />
      <TemporalLabels />

      {cameraMode === 'fps' ? (
        <FPSControls />
      ) : cameraMode === 'orbit' ? (
        <OrbitControls
          target={[0, 3, -40]}
          minDistance={1}
          maxDistance={160}
          enableDamping
          dampingFactor={0.06}
          maxPolarAngle={Math.PI / 2.05}
        />
      ) : (
        <DemoCamera />
      )}
    </>
  )
}
