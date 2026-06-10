import { useRef } from 'react'
import * as THREE from 'three'
import { useTemporalBlend } from '../temporal/useTemporalBlend'
import { houseTimeline } from '../temporal/presets'

const POSITION: [number, number, number] = [12, 0, -42]

export function House() {
  const groupRef = useRef<THREE.Group>(null)
  useTemporalBlend(groupRef, POSITION, houseTimeline)

  return (
    <group ref={groupRef} position={POSITION}>
      {/* 0: inhabited house with smoke (present) */}
      <group>
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[4, 2, 3]} />
          <meshLambertMaterial color="#c8a070" />
        </mesh>
        <mesh position={[0, 2.5, 0]}>
          <coneGeometry args={[2.8, 1.5, 4]} />
          <meshLambertMaterial color="#6a3a20" />
        </mesh>
        <mesh position={[0, 0.6, 1.51]}>
          <boxGeometry args={[0.7, 1.2, 0.05]} />
          <meshLambertMaterial color="#5a3010" />
        </mesh>
        {/* Lit window */}
        <mesh position={[1.2, 1.1, 1.51]}>
          <boxGeometry args={[0.6, 0.6, 0.05]} />
          <meshLambertMaterial color="#ffcc80" emissive="#cc8820" />
        </mesh>
        {/* Chimney */}
        <mesh position={[-1, 2.6, 0]}>
          <boxGeometry args={[0.4, 1, 0.4]} />
          <meshLambertMaterial color="#808080" />
        </mesh>
        {[0, 0.8, 1.6].map((h, i) => (
          <mesh key={i} position={[-1, 3.3 + h, 0]}>
            <sphereGeometry args={[0.2 + h * 0.15, 5, 4]} />
            <meshLambertMaterial color="#aaaaaa" transparent opacity={0.45 - h * 0.1} />
          </mesh>
        ))}
      </group>

      {/* 1: completed house */}
      <group>
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[4, 2, 3]} />
          <meshLambertMaterial color="#c8a070" />
        </mesh>
        <mesh position={[0, 2.5, 0]}>
          <coneGeometry args={[2.8, 1.5, 4]} />
          <meshLambertMaterial color="#6a3a20" />
        </mesh>
        <mesh position={[0, 0.6, 1.51]}>
          <boxGeometry args={[0.7, 1.2, 0.05]} />
          <meshLambertMaterial color="#5a3010" />
        </mesh>
        <mesh position={[1.2, 1.1, 1.51]}>
          <boxGeometry args={[0.6, 0.6, 0.05]} />
          <meshLambertMaterial color="#8ab0d0" />
        </mesh>
      </group>

      {/* 2: wood structure */}
      <group>
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[4, 0.1, 3]} />
          <meshLambertMaterial color="#8a6040" />
        </mesh>
        {[[-1.8, 1.2, -1.4], [1.8, 1.2, -1.4], [-1.8, 1.2, 1.4], [1.8, 1.2, 1.4]].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[0.2, 2, 0.2]} />
            <meshLambertMaterial color="#7a5030" />
          </mesh>
        ))}
        <mesh position={[0, 2.4, 0]}>
          <coneGeometry args={[2.6, 1.4, 4]} />
          <meshLambertMaterial color="#6a4020" wireframe />
        </mesh>
      </group>

      {/* 3: foundations */}
      <group>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[4, 0.4, 3]} />
          <meshLambertMaterial color="#707070" />
        </mesh>
        {[[-1.8, 0.38, 0], [1.8, 0.38, 0], [0, 0.38, 1.4], [0, 0.38, -1.4]].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={i < 2 ? [0.2, 0.35, 2.8] : [3.6, 0.35, 0.2]} />
            <meshLambertMaterial color="#606060" />
          </mesh>
        ))}
      </group>

      {/* 4: empty terrain (most ancient) */}
      <group>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[4.5, 0.04, 3.5]} />
          <meshLambertMaterial color="#5a6a40" />
        </mesh>
      </group>
    </group>
  )
}
