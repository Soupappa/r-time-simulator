import { useRef } from 'react'
import * as THREE from 'three'
import { useTemporalBlend } from '../temporal/useTemporalBlend'
import { mountainTimeline } from '../temporal/presets'
import { useSimStore } from '../store'

const POSITION: [number, number, number] = [0, 0, -80]

function MatureMesh() {
  return (
    <group>
      <mesh position={[0, 8, 0]} castShadow>
        <coneGeometry args={[12, 20, 7]} />
        <meshLambertMaterial color="#5a7a4a" />
      </mesh>
      <mesh position={[-10, 3, 2]} castShadow>
        <coneGeometry args={[7, 12, 6]} />
        <meshLambertMaterial color="#5a7a4a" />
      </mesh>
      <mesh position={[9, 2, -2]} castShadow>
        <coneGeometry args={[8, 10, 5]} />
        <meshLambertMaterial color="#4a6a3a" />
      </mesh>
      <mesh position={[0, 15, 0]}>
        <coneGeometry args={[4, 6, 7]} />
        <meshLambertMaterial color="#e8eef5" />
      </mesh>
    </group>
  )
}

function YoungMesh() {
  return (
    <group>
      <mesh position={[0, 8, 0]}>
        <coneGeometry args={[12, 20, 7]} />
        <meshLambertMaterial color="#6a7a5a" />
      </mesh>
      <mesh position={[-10, 3, 2]}>
        <coneGeometry args={[7, 12, 6]} />
        <meshLambertMaterial color="#5a6a4a" />
      </mesh>
      <mesh position={[9, 2, -2]}>
        <coneGeometry args={[8, 10, 5]} />
        <meshLambertMaterial color="#5a6a4a" />
      </mesh>
    </group>
  )
}

function RockyMesh() {
  return (
    <group>
      <mesh position={[0, 7, 0]}>
        <coneGeometry args={[11, 18, 7]} />
        <meshLambertMaterial color="#5a4a3a" />
      </mesh>
      <mesh position={[-9, 3, 2]}>
        <coneGeometry args={[6, 10, 5]} />
        <meshLambertMaterial color="#4a3a2a" />
      </mesh>
      <mesh position={[8, 2, -1]}>
        <coneGeometry args={[7, 9, 5]} />
        <meshLambertMaterial color="#4a3a2a" />
      </mesh>
    </group>
  )
}

function VolcanoMesh() {
  return (
    <group>
      <mesh position={[0, 7, 0]}>
        <coneGeometry args={[11, 17, 7]} />
        <meshLambertMaterial color="#3a2a1a" emissive="#220800" />
      </mesh>
      <mesh position={[0, 15.2, 0]}>
        <cylinderGeometry args={[2.5, 3.5, 1.2, 8]} />
        <meshBasicMaterial color="#ff5500" />
      </mesh>
      <mesh position={[3, 9, 1]} rotation={[0, 0, 0.35]}>
        <boxGeometry args={[1.5, 7, 1]} />
        <meshBasicMaterial color="#ff3300" transparent opacity={0.8} />
      </mesh>
      <mesh position={[-2, 8, -1]} rotation={[0, 0, -0.25]}>
        <boxGeometry args={[1.2, 6, 0.8]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.7} />
      </mesh>
      <mesh position={[-9, 3, 2]}>
        <coneGeometry args={[6, 10, 5]} />
        <meshLambertMaterial color="#3a2a1a" emissive="#110400" />
      </mesh>
    </group>
  )
}

function DebrisMesh() {
  return (
    <group>
      {[...Array(10)].map((_, i) => {
        const angle = (i / 10) * Math.PI * 2
        const r = 5 + Math.sin(i * 3.7) * 3
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * r, 3 + Math.sin(i * 1.4) * 4, Math.sin(angle) * r]}
            rotation={[i * 0.7, i * 0.5, i * 0.3]}
          >
            <dodecahedronGeometry args={[1.8 + Math.sin(i) * 0.7, 0]} />
            <meshLambertMaterial color="#4a3a2a" emissive="#110500" />
          </mesh>
        )
      })}
      {/* Central magma blob */}
      <mesh position={[0, 4, 0]}>
        <sphereGeometry args={[5, 5, 4]} />
        <meshBasicMaterial color="#882200" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

export function Mountain() {
  const groupRef = useRef<THREE.Group>(null)
  const { setFocusedObject } = useSimStore()
  useTemporalBlend(groupRef, POSITION, mountainTimeline, {
    onSample: ({ label, age, dist }) => {
      setFocusedObject({ name: 'Mountain', distance: dist, visibleAge: age, stateLabel: label })
    },
  })

  return (
    // Children ordered: index 0 = present, index 4 = most ancient
    <group ref={groupRef} position={POSITION}>
      <MatureMesh />   {/* 0: present */}
      <YoungMesh />    {/* 1 */}
      <RockyMesh />    {/* 2 */}
      <VolcanoMesh />  {/* 3 */}
      <DebrisMesh />   {/* 4: most ancient */}
    </group>
  )
}
