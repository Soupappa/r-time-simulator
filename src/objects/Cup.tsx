import { useRef } from 'react'
import * as THREE from 'three'
import { useTemporalBlend } from '../temporal/useTemporalBlend'
import { cupTimeline } from '../temporal/presets'

const POSITION: [number, number, number] = [-1.5, 0.8, -3]

export function Cup() {
  const groupRef = useRef<THREE.Group>(null)
  useTemporalBlend(groupRef, POSITION, cupTimeline)

  return (
    <group ref={groupRef} position={POSITION} scale={[0.18, 0.18, 0.18]}>
      {/* 0: cup with coffee (present) */}
      <group>
        <mesh>
          <cylinderGeometry args={[0.8, 0.6, 1.4, 8, 1, true]} />
          <meshLambertMaterial color="#4488cc" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 8]} />
          <meshLambertMaterial color="#3366aa" />
        </mesh>
        <mesh position={[0.95, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.35, 0.08, 5, 8, Math.PI]} />
          <meshLambertMaterial color="#3366aa" />
        </mesh>
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.72, 0.72, 0.05, 8]} />
          <meshLambertMaterial color="#3a2010" />
        </mesh>
        {[[-0.1, 1.0], [0.12, 1.35], [-0.05, 1.65]].map(([x, h], i) => (
          <mesh key={i} position={[x, h, 0]}>
            <sphereGeometry args={[0.13 + i * 0.03, 4, 3]} />
            <meshLambertMaterial color="#bbbbbb" transparent opacity={0.3 - i * 0.04} />
          </mesh>
        ))}
      </group>

      {/* 1: painted cup */}
      <group>
        <mesh>
          <cylinderGeometry args={[0.8, 0.6, 1.4, 8, 1, true]} />
          <meshLambertMaterial color="#4488cc" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 8]} />
          <meshLambertMaterial color="#3366aa" />
        </mesh>
        <mesh position={[0.95, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.35, 0.08, 5, 8, Math.PI]} />
          <meshLambertMaterial color="#3366aa" />
        </mesh>
      </group>

      {/* 2: fired ceramic */}
      <group>
        <mesh>
          <cylinderGeometry args={[0.8, 0.6, 1.4, 8, 1, true]} />
          <meshLambertMaterial color="#c8a880" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 8]} />
          <meshLambertMaterial color="#b89870" />
        </mesh>
      </group>

      {/* 3: shaped clay */}
      <group>
        <mesh>
          <cylinderGeometry args={[0.8, 0.6, 1.4, 8, 1, true]} />
          <meshLambertMaterial color="#9a8070" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 8]} />
          <meshLambertMaterial color="#8a7060" />
        </mesh>
      </group>

      {/* 4: raw clay lump (most ancient) */}
      <group>
        <mesh>
          <sphereGeometry args={[0.9, 5, 4]} />
          <meshLambertMaterial color="#8a7060" />
        </mesh>
      </group>
    </group>
  )
}
