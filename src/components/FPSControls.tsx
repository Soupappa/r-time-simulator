import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import * as THREE from 'three'
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib'

const SPEED = 12
const SPRINT_SPEED = 30

const keys: Record<string, boolean> = {}

export function FPSControls() {
  const { camera } = useThree()
  const controlsRef = useRef<PointerLockControlsImpl>(null)
  const velocity = useRef(new THREE.Vector3())
  const direction = useRef(new THREE.Vector3())
  const lockedRef = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { keys[e.code] = e.type === 'keydown' }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  useFrame((_, delta) => {
    if (!controlsRef.current?.isLocked) return

    const speed = keys['ShiftLeft'] || keys['ShiftRight'] ? SPRINT_SPEED : SPEED
    const dir = direction.current

    dir.set(0, 0, 0)
    if (keys['KeyW'] || keys['ArrowUp'])    dir.z -= 1
    if (keys['KeyS'] || keys['ArrowDown'])  dir.z += 1
    if (keys['KeyA'] || keys['ArrowLeft'])  dir.x -= 1
    if (keys['KeyD'] || keys['ArrowRight']) dir.x += 1
    if (keys['KeyE'] || keys['Space'])      dir.y += 1
    if (keys['KeyQ'] || keys['ControlLeft']) dir.y -= 1

    if (dir.lengthSq() > 0) {
      dir.normalize().multiplyScalar(speed * delta)
      controlsRef.current.moveRight(dir.x)
      controlsRef.current.moveForward(-dir.z)
      camera.position.y += dir.y
    }

    // Clamp vertical position
    camera.position.y = Math.max(0.5, Math.min(80, camera.position.y))
  })

  return (
    <PointerLockControls
      ref={controlsRef}
      onLock={() => { lockedRef.current = true }}
      onUnlock={() => { lockedRef.current = false }}
    />
  )
}
