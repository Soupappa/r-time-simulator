import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimStore } from '../store'
import { getVisibleAge, sampleTimeline, type TimelineState } from './timeline'
import { computeStateOpacities } from './sampling'

// Applies temporal opacity blending to a group's direct children.
// Children must be ordered: index 0 = present state, last index = most ancient.
export function useTemporalBlend(
  groupRef: React.RefObject<THREE.Group | null>,
  position: [number, number, number],
  timeline: TimelineState[],
  options?: { onSample?: (sample: { label: string; age: number; dist: number }) => void }
) {
  const { camera } = useThree()
  const { R, ageScale } = useSimStore()
  const posVec = useRef(new THREE.Vector3(...position))

  useFrame(() => {
    if (!groupRef.current) return
    const dist = camera.position.distanceTo(posVec.current)
    const visibleAge = getVisibleAge(dist, R, ageScale)
    const sample = sampleTimeline(visibleAge, timeline)

    options?.onSample?.({ label: sample.label, age: sample.age, dist })

    const numStates = groupRef.current.children.length
    const opacities = computeStateOpacities(sample.stateIndex, sample.blend, numStates)

    groupRef.current.children.forEach((child, i) => {
      const opacity = opacities[i] ?? 0
      child.traverse((mesh) => {
        if (mesh instanceof THREE.Mesh) {
          const mat = mesh.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial
          mat.transparent = true
          mat.opacity = Math.max(0, opacity)
          mat.needsUpdate = true
        }
      })
      child.visible = opacity > 0.005
    })
  })
}
