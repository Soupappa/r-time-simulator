import * as THREE from 'three'

export function distanceFromCamera(
  camera: THREE.Camera,
  position: THREE.Vector3
): number {
  return camera.position.distanceTo(position)
}
