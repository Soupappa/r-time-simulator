import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimStore } from '../store'
import { getVisibleAge, sampleTimeline } from '../temporal/timeline'
import { computeStateOpacities } from '../temporal/sampling'
import { characterTimeline } from '../temporal/presets'

const START_Z = -50
const END_Z = -4

export function Character() {
  const groupRef = useRef<THREE.Group>(null)
  const timeRef = useRef(0)
  const { camera } = useThree()
  const { R, ageScale } = useSimStore()

  useFrame((_, delta) => {
    if (!groupRef.current) return
    timeRef.current += delta

    // Walk toward camera in a loop
    const t = (Math.sin(timeRef.current * 0.25) * 0.5 + 0.5)
    const z = START_Z + t * (END_Z - START_Z)
    groupRef.current.position.z = z

    // Bob while walking
    const walkPhase = timeRef.current * 2.8
    groupRef.current.position.y = Math.abs(Math.sin(walkPhase)) * 0.06

    const pos = groupRef.current.position.clone()
    const dist = camera.position.distanceTo(pos)
    const visibleAge = getVisibleAge(dist, R, ageScale)
    const sample = sampleTimeline(visibleAge, characterTimeline)
    const opacities = computeStateOpacities(sample.stateIndex, sample.blend, groupRef.current.children.length)

    groupRef.current.children.forEach((child, i) => {
      const opacity = opacities[i] ?? 0
      child.traverse((mesh) => {
        if (mesh instanceof THREE.Mesh) {
          const mat = mesh.material as THREE.MeshLambertMaterial
          mat.transparent = true
          mat.opacity = Math.max(0, opacity)
          mat.needsUpdate = true
        }
      })
      child.visible = opacity > 0.005

      // Leg animation on the visible character
      if (opacity > 0.5) {
        const legs = child.children.filter(c => c.name === 'leg')
        legs[0]?.rotation && (legs[0].rotation.x = Math.sin(walkPhase) * 0.45)
        legs[1]?.rotation && (legs[1].rotation.x = -Math.sin(walkPhase) * 0.45)
      }
    })
  })

  return (
    <group ref={groupRef} position={[4, 0, START_Z]}>
      {/* Children ordered: 0 = very old (present, when close), 4 = child (ancient, when far) */}
      <CharacterMesh scale={0.82} bodyColor="#b07848" clothColor="#666666" bent veryOld /> {/* 0: very old */}
      <CharacterMesh scale={0.93} bodyColor="#c08858" clothColor="#888888" bent />          {/* 1: elder */}
      <CharacterMesh scale={1.0}  bodyColor="#d09060" clothColor="#446644" />               {/* 2: adult */}
      <CharacterMesh scale={0.78} bodyColor="#e0a080" clothColor="#cc6644" />               {/* 3: teenager */}
      <CharacterMesh scale={0.55} bodyColor="#e0a080" clothColor="#4488cc" />               {/* 4: child */}
    </group>
  )
}

function CharacterMesh({ scale, bodyColor, clothColor, bent = false, veryOld = false }: {
  scale: number
  bodyColor: string
  clothColor: string
  bent?: boolean
  veryOld?: boolean
}) {
  const tilt = bent ? -0.22 : 0
  const hairColor = veryOld ? '#ffffff' : bent ? '#ddddbb' : '#3a2a18'

  return (
    <group scale={[scale, scale, scale]} rotation={[tilt, 0, 0]}>
      <mesh position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.22, 6, 6]} />
        <meshLambertMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0, 1.83, 0]}>
        <sphereGeometry args={[0.18, 5, 4]} />
        <meshLambertMaterial color={hairColor} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.36, 0.55, 0.22]} />
        <meshLambertMaterial color={clothColor} />
      </mesh>
      <mesh name="leg" position={[-0.1, 0.65, 0]}>
        <boxGeometry args={[0.13, 0.52, 0.13]} />
        <meshLambertMaterial color={clothColor} />
      </mesh>
      <mesh name="leg" position={[0.1, 0.65, 0]}>
        <boxGeometry args={[0.13, 0.52, 0.13]} />
        <meshLambertMaterial color={clothColor} />
      </mesh>
      <mesh position={[-0.25, 1.1, 0]} rotation={[0, 0, 0.28]}>
        <boxGeometry args={[0.11, 0.42, 0.11]} />
        <meshLambertMaterial color={clothColor} />
      </mesh>
      <mesh position={[0.25, 1.1, 0]} rotation={[0, 0, -0.28]}>
        <boxGeometry args={[0.11, 0.42, 0.11]} />
        <meshLambertMaterial color={clothColor} />
      </mesh>
      {veryOld && (
        <mesh position={[0.42, 0.75, 0.05]} rotation={[0.15, 0, 0.12]}>
          <cylinderGeometry args={[0.02, 0.025, 1.2, 4]} />
          <meshLambertMaterial color="#8a6a40" />
        </mesh>
      )}
    </group>
  )
}
