import { useRef } from 'react'
import * as THREE from 'three'
import { useTemporalBlend } from '../temporal/useTemporalBlend'
import { treeTimeline } from '../temporal/presets'

const POSITION: [number, number, number] = [-8, 0, -28]

export function Tree() {
  const groupRef = useRef<THREE.Group>(null)
  useTemporalBlend(groupRef, POSITION, treeTimeline)

  return (
    <group ref={groupRef} position={POSITION}>
      {/* 0: ancient tree (present) */}
      <group>
        <mesh position={[0, 2, 0]}>
          <cylinderGeometry args={[0.35, 0.55, 4, 6]} />
          <meshLambertMaterial color="#3a2a10" />
        </mesh>
        <mesh position={[0, 5.5, 0]}>
          <sphereGeometry args={[2.4, 6, 5]} />
          <meshLambertMaterial color="#1a5a10" />
        </mesh>
        <mesh position={[1.8, 3.5, 0]} rotation={[0, 0, 0.55]}>
          <cylinderGeometry args={[0.1, 0.2, 2.2, 5]} />
          <meshLambertMaterial color="#3a2a10" />
        </mesh>
        <mesh position={[-1.7, 3.2, 0.5]} rotation={[0, 0, -0.45]}>
          <cylinderGeometry args={[0.08, 0.18, 2, 5]} />
          <meshLambertMaterial color="#3a2a10" />
        </mesh>
      </group>

      {/* 1: adult tree */}
      <group>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.2, 0.3, 3, 6]} />
          <meshLambertMaterial color="#5a3a18" />
        </mesh>
        <mesh position={[0, 3.5, 0]}>
          <coneGeometry args={[1.5, 3, 6]} />
          <meshLambertMaterial color="#2a6a18" />
        </mesh>
        <mesh position={[0, 5.2, 0]}>
          <coneGeometry args={[1, 2.5, 6]} />
          <meshLambertMaterial color="#3a7a20" />
        </mesh>
      </group>

      {/* 2: shrub */}
      <group>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.1, 0.15, 1, 5]} />
          <meshLambertMaterial color="#6a4a20" />
        </mesh>
        <mesh position={[0, 1.3, 0]}>
          <sphereGeometry args={[0.9, 5, 4]} />
          <meshLambertMaterial color="#3a7a20" />
        </mesh>
      </group>

      {/* 3: young sprout */}
      <group>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.04, 0.08, 0.6, 5]} />
          <meshLambertMaterial color="#5a7a30" />
        </mesh>
        <mesh position={[0, 0.7, 0]}>
          <coneGeometry args={[0.25, 0.45, 5]} />
          <meshLambertMaterial color="#4a9020" />
        </mesh>
      </group>

      {/* 4: seed (most ancient) */}
      <group>
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.08, 4, 4]} />
          <meshLambertMaterial color="#8a6a30" />
        </mesh>
      </group>
    </group>
  )
}
