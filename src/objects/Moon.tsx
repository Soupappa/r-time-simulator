import { useRef } from 'react'
import * as THREE from 'three'
import { useTemporalBlend } from '../temporal/useTemporalBlend'
import { moonTimeline } from '../temporal/presets'

const POSITION: [number, number, number] = [40, 60, -120]

export function Moon() {
  const groupRef = useRef<THREE.Group>(null)
  useTemporalBlend(groupRef, POSITION, moonTimeline)

  return (
    <group ref={groupRef} position={POSITION}>
      {/* 0: current moon */}
      <group>
        <mesh>
          <sphereGeometry args={[4.5, 12, 10]} />
          <meshLambertMaterial color="#c8c0b0" />
        </mesh>
        {[[-1.5, 0, 4.4], [2, 1, 4], [-2, -1.5, 4.2], [0.5, 2.5, 3.8]].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[0.4, 5, 5]} />
            <meshLambertMaterial color="#a09888" />
          </mesh>
        ))}
      </group>

      {/* 1: young reddish moon */}
      <group>
        <mesh>
          <sphereGeometry args={[4.5, 8, 7]} />
          <meshLambertMaterial color="#aa5533" emissive="#331100" />
        </mesh>
        {/* Lava patches */}
        {[[0, 3, 3.2], [-2.5, 0, 3.7], [1, -2, 4]].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[0.8, 5, 4]} />
            <meshBasicMaterial color="#ff4400" transparent opacity={0.5} />
          </mesh>
        ))}
      </group>

      {/* 2: proto-moon accreting */}
      <group>
        <mesh>
          <sphereGeometry args={[3.8, 6, 5]} />
          <meshLambertMaterial color="#8a6040" emissive="#221100" />
        </mesh>
        {[...Array(8)].map((_, i) => {
          const angle = (i / 8) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(angle) * 6.5, Math.sin(i * 0.9) * 1.5, Math.sin(angle) * 6.5]}>
              <sphereGeometry args={[0.7 + Math.sin(i) * 0.3, 4, 3]} />
              <meshLambertMaterial color="#6a4a28" />
            </mesh>
          )
        })}
      </group>

      {/* 3: debris disk (most ancient) */}
      <group>
        {[...Array(14)].map((_, i) => {
          const angle = (i / 14) * Math.PI * 2
          const r = 4 + Math.sin(i * 2.1) * 2.5
          return (
            <mesh key={i} position={[Math.cos(angle) * r, Math.sin(i * 0.4) * 1.8, Math.sin(angle) * r]}>
              <dodecahedronGeometry args={[0.5 + Math.abs(Math.sin(i)) * 0.3, 0]} />
              <meshLambertMaterial color="#6a5a4a" emissive="#110800" />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}
