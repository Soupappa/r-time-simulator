import { useRef, useEffect, createContext, useContext, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimStore } from '../store'
import { getVisibleAge } from '../temporal/timeline'

// ─── Types ────────────────────────────────────────────────────────────────────

type ObjType = 'tree' | 'bush' | 'rock' | 'prop'

type RegEntry = {
  group: THREE.Group
  pos: THREE.Vector3
  baseScale: number
  maxAge: number
  type: ObjType
  mats: THREE.MeshLambertMaterial[]
}

// Pre-allocated color objects (no GC pressure)
const F_PRESENT = new THREE.Color('#2e6018')
const F_MID     = new THREE.Color('#7a9030')
const F_OLD     = new THREE.Color('#8a7228')
const T_PRESENT = new THREE.Color('#5a3e1a')
const T_OLD     = new THREE.Color('#8a7a60')
const B_PRESENT = new THREE.Color('#2a5814')
const B_OLD     = new THREE.Color('#6a6030')
const R_PRESENT = new THREE.Color('#7a7060')
const R_OLD     = new THREE.Color('#5a4840')
const _tmp      = new THREE.Color()

function applyEntry(e: RegEntry, R: number, ageScale: number, camPos: THREE.Vector3) {
  const dist = camPos.distanceTo(e.pos)
  const age  = getVisibleAge(dist, R, ageScale)
  const t    = Math.min(age / e.maxAge, 1)   // 0 = present, 1 = ancient

  if (e.type === 'tree') {
    e.group.scale.setScalar(e.baseScale * Math.max(0.04, 1 - t * t * 0.96))
    for (const m of e.mats) {
      const { r, g } = m.color
      if (g > r * 1.05) {
        // foliage
        if (t < 0.5) _tmp.lerpColors(F_PRESENT, F_MID, t * 2)
        else          _tmp.lerpColors(F_MID,     F_OLD, (t - 0.5) * 2)
        m.color.copy(_tmp)
      } else {
        // trunk
        m.color.lerpColors(T_PRESENT, T_OLD, t)
      }
    }
  }

  if (e.type === 'bush') {
    e.group.scale.setScalar(e.baseScale * Math.max(0.03, 1 - t * t * 0.97))
    for (const m of e.mats) m.color.lerpColors(B_PRESENT, B_OLD, t)
  }

  if (e.type === 'rock') {
    for (const m of e.mats) m.color.lerpColors(R_PRESENT, R_OLD, t * 0.6)
  }

  if (e.type === 'prop') {
    const opacity = Math.max(0, 1 - t * 1.6)
    e.group.visible = opacity > 0.02
    for (const m of e.mats) {
      m.transparent = true
      m.opacity = opacity
    }
  }
}

// ─── Registry context ─────────────────────────────────────────────────────────

const RegistryCtx = createContext<React.MutableRefObject<RegEntry[]> | null>(null)

function TemporalRegistry({ children }: { children: React.ReactNode }) {
  const registry = useRef<RegEntry[]>([])
  const { camera } = useThree()
  const storeRef = useRef({ R: 1, ageScale: 0.5 })

  // Keep store values in a ref to avoid re-subscribing useFrame
  const store = useSimStore()
  useFrame(() => {
    storeRef.current.R        = store.R
    storeRef.current.ageScale = store.ageScale
    const { R, ageScale } = storeRef.current
    const pos = camera.position
    for (const e of registry.current) applyEntry(e, R, ageScale, pos)
  })

  return <RegistryCtx.Provider value={registry}>{children}</RegistryCtx.Provider>
}

// ─── Registration hook ────────────────────────────────────────────────────────

function useTemporalObject(
  groupRef: React.RefObject<THREE.Group | null>,
  pos: [number, number, number],
  baseScale: number,
  maxAge: number,
  type: ObjType,
) {
  const registry = useContext(RegistryCtx)
  useEffect(() => {
    if (!groupRef.current || !registry) return
    const mats: THREE.MeshLambertMaterial[] = []
    groupRef.current.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        // Clone material so instances don't share it
        const m = (obj.material as THREE.MeshLambertMaterial).clone()
        obj.material = m
        mats.push(m)
      }
    })
    const entry: RegEntry = {
      group: groupRef.current,
      pos: new THREE.Vector3(...pos),
      baseScale,
      maxAge,
      type,
      mats,
    }
    registry.current.push(entry)
    return () => { registry.current = registry.current.filter(e => e !== entry) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// ─── Temporal components ──────────────────────────────────────────────────────

const VARIANTS = [0, 1, 2, 3] as const

function TemporalTree({ x, z, scale = 1, variant = 0 }: {
  x: number; z: number; scale?: number; variant?: number
}) {
  const g = useRef<THREE.Group>(null)
  useTemporalObject(g, [x, 0, z], scale, 90, 'tree')
  const tc = '#5a3e1a'
  const fc = '#2e6018'
  const h  = 1.8 + variant * 0.3
  return (
    <group ref={g} position={[x, 0, z]} scale={[scale, scale, scale]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.18, 0.28, h, 5]} />
        <meshLambertMaterial color={tc} />
      </mesh>
      {variant === 0 && <>
        <mesh position={[0, h + 1.2, 0]}><coneGeometry args={[1.4, 2.8, 6]} /><meshLambertMaterial color={fc} /></mesh>
        <mesh position={[0, h + 2.6, 0]}><coneGeometry args={[0.9, 2.2, 6]} /><meshLambertMaterial color="#3a7020" /></mesh>
      </>}
      {variant === 1 && (
        <mesh position={[0, h + 1.5, 0]}><sphereGeometry args={[1.6, 6, 5]} /><meshLambertMaterial color={fc} /></mesh>
      )}
      {variant === 2 && <>
        <mesh position={[0, h + 1.8, 0]}><sphereGeometry args={[2.0, 6, 5]} /><meshLambertMaterial color={fc} /></mesh>
        <mesh position={[1.4, h + 0.8, 0]} rotation={[0, 0, 0.5]}><cylinderGeometry args={[0.1, 0.18, 1.8, 5]} /><meshLambertMaterial color={tc} /></mesh>
      </>}
      {variant === 3 && <>
        <mesh position={[0, h + 0.9, 0]}><coneGeometry args={[1.8, 2.2, 5]} /><meshLambertMaterial color={fc} /></mesh>
        <mesh position={[0, h + 2.4, 0]}><coneGeometry args={[1.2, 1.8, 5]} /><meshLambertMaterial color="#386818" /></mesh>
        <mesh position={[0, h + 3.5, 0]}><coneGeometry args={[0.7, 1.4, 5]} /><meshLambertMaterial color="#3a7020" /></mesh>
      </>}
    </group>
  )
}

function TemporalBush({ x, z, scale = 1, color = '#2a5814' }: {
  x: number; z: number; scale?: number; color?: string
}) {
  const g = useRef<THREE.Group>(null)
  useTemporalObject(g, [x, 0, z], scale, 70, 'bush')
  return (
    <group ref={g} position={[x, 0, z]} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.45, 0]}><sphereGeometry args={[0.65, 5, 4]} /><meshLambertMaterial color={color} /></mesh>
      <mesh position={[0.4, 0.35, 0.2]}><sphereGeometry args={[0.45, 5, 4]} /><meshLambertMaterial color={color} /></mesh>
      <mesh position={[-0.35, 0.32, -0.15]}><sphereGeometry args={[0.4, 5, 4]} /><meshLambertMaterial color={color} /></mesh>
    </group>
  )
}

function TemporalRock({ x, z, scale = 1, roty = 0 }: {
  x: number; z: number; scale?: number; roty?: number
}) {
  const g = useRef<THREE.Group>(null)
  useTemporalObject(g, [x, 0, z], scale, 200, 'rock')
  return (
    <group ref={g} position={[x, 0, z]} scale={[scale, scale * 0.7, scale]} rotation={[0.1, roty, 0.05]}>
      <mesh><dodecahedronGeometry args={[0.6, 0]} /><meshLambertMaterial color="#7a7060" /></mesh>
      <mesh position={[0.3, -0.1, 0.2]} scale={[0.6, 0.5, 0.7]}><dodecahedronGeometry args={[0.5, 0]} /><meshLambertMaterial color="#6a6050" /></mesh>
    </group>
  )
}

function TemporalProp({ position, maxAge = 50, children }: {
  position: [number, number, number]; maxAge?: number; children: React.ReactNode
}) {
  const g = useRef<THREE.Group>(null)
  useTemporalObject(g, position, 1, maxAge, 'prop')
  return <group ref={g} position={position}>{children}</group>
}

// ─── Static decoratives ───────────────────────────────────────────────────────

function GrassClump({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 0.3, -0.2, 0.15, -0.1].map((ox, i) => (
        <mesh key={i} position={[ox * 0.8, 0.22, (i - 2) * 0.12]} rotation={[0, i * 0.8, 0.15 + Math.sin(i) * 0.2]}>
          <boxGeometry args={[0.04, 0.45, 0.04]} />
          <meshLambertMaterial color={i % 2 === 0 ? '#4a7a28' : '#3a6a20'} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function Environment() {
  const trees = useMemo(() => {
    const r = seededRng(7)
    return [
      ...[...Array(18)].map(() => ({ x: -12 - r() * 30, z: -15 - r() * 80, scale: 0.7 + r() * 0.8, variant: Math.floor(r() * 4) })),
      ...[...Array(16)].map(() => ({ x: 16 + r() * 28,  z: -10 - r() * 80, scale: 0.7 + r() * 0.9, variant: Math.floor(r() * 4) })),
      ...[...Array(14)].map(() => ({ x: (r() - 0.5) * 42, z: -25 - r() * 55, scale: 0.6 + r() * 0.7, variant: Math.floor(r() * 4) })),
      { x: -5,  z: -6,  scale: 0.75, variant: 1 },
      { x: 5,   z: -7,  scale: 0.9,  variant: 0 },
      { x: -4,  z: -11, scale: 0.6,  variant: 3 },
      { x: 7,   z: -12, scale: 0.8,  variant: 2 },
    ]
  }, [])

  const bushes = useMemo(() => {
    const r = seededRng(13)
    return [...Array(32)].map(() => ({
      x: (r() - 0.5) * 64, z: -4 - r() * 92,
      scale: 0.5 + r() * 0.8,
      color: r() > 0.6 ? '#2a6018' : '#1e5010',
    }))
  }, [])

  const rocks = useMemo(() => {
    const r = seededRng(17)
    return [
      ...[...Array(22)].map(() => ({ x: (r() - 0.5) * 80, z: -8  - r() * 100, scale: 0.3 + r() * 1.4, roty: r() * Math.PI * 2 })),
      ...[...Array(8)].map(()  => ({ x: (r() - 0.5) * 20, z: -65 - r() * 20,  scale: 0.8 + r() * 1.5, roty: r() * Math.PI * 2 })),
    ]
  }, [])

  const grass = useMemo(() => {
    const r = seededRng(23)
    return [...Array(50)].map(() => ({ x: (r() - 0.5) * 20, z: -0.5 - r() * 16 }))
  }, [])

  return (
    <TemporalRegistry>
      {trees.map((t, i)  => <TemporalTree key={`t${i}`} {...t} />)}
      {bushes.map((b, i) => <TemporalBush key={`b${i}`} {...b} />)}
      {rocks.map((r, i)  => <TemporalRock key={`r${i}`} {...r} />)}
      {grass.map((g, i)  => <GrassClump  key={`g${i}`} {...g} />)}

      {/* Human props — fade into past */}
      <TemporalProp position={[8, 0, -38]} maxAge={55}>
        <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.7, 0.8, 0.6, 8]} /><meshLambertMaterial color="#888878" /></mesh>
        <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.5, 0.5, 0.05, 8]} /><meshLambertMaterial color="#1a1a18" /></mesh>
        {([-0.5, 0.5] as number[]).map((px, i) => (
          <mesh key={i} position={[px, 1.0, 0]}><boxGeometry args={[0.1, 1.2, 0.1]} /><meshLambertMaterial color="#7a5830" /></mesh>
        ))}
        <mesh position={[0, 1.6, 0]}><boxGeometry args={[1.2, 0.1, 0.1]} /><meshLambertMaterial color="#6a4820" /></mesh>
        <mesh position={[0, 1.9, 0]}><coneGeometry args={[0.9, 0.6, 4]} /><meshLambertMaterial color="#6a3820" /></mesh>
      </TemporalProp>

      <TemporalProp position={[15.5, 0, -40]} maxAge={50}>
        {([[0,0.12,0],[0.18,0.12,0.08],[-0.15,0.12,-0.05],[0.05,0.28,0.04]] as [number,number,number][]).map(([lx,ly,lz], i) => (
          <mesh key={i} position={[lx,ly,lz]} rotation={[0, i*0.4, Math.PI/2]}><cylinderGeometry args={[0.1,0.11,0.6,6]} /><meshLambertMaterial color="#7a5030" /></mesh>
        ))}
      </TemporalProp>

      {/* Fence panels */}
      {([
        { pos: [12, 0, -36] as [number,number,number], rot: 0,           len: 10 },
        { pos: [12, 0, -50] as [number,number,number], rot: 0,           len: 10 },
        { pos: [7,  0, -43] as [number,number,number], rot: Math.PI / 2, len: 14 },
        { pos: [17, 0, -43] as [number,number,number], rot: Math.PI / 2, len: 14 },
      ]).map(({ pos, rot, len }, fi) => (
        <TemporalProp key={`f${fi}`} position={pos} maxAge={60}>
          <group rotation={[0, rot, 0]}>
            {[...Array(Math.floor(len / 2))].map((_, i) => (
              <group key={i} position={[i * 2 - len / 2, 0, 0]}>
                <mesh position={[0, 0.7, 0]}><boxGeometry args={[0.1, 1.4, 0.1]} /><meshLambertMaterial color="#8a6840" /></mesh>
                {i < Math.floor(len/2) - 1 && <>
                  <mesh position={[1, 0.85, 0]}><boxGeometry args={[2, 0.08, 0.08]} /><meshLambertMaterial color="#9a7848" /></mesh>
                  <mesh position={[1, 0.55, 0]}><boxGeometry args={[2, 0.08, 0.08]} /><meshLambertMaterial color="#9a7848" /></mesh>
                </>}
              </group>
            ))}
          </group>
        </TemporalProp>
      ))}

      {/* Flowers */}
      {([
        { pos: [-3, 0, -8]  as [number,number,number], color: '#ffcc30', count: 8,  maxAge: 40 },
        { pos: [7,  0, -6]  as [number,number,number], color: '#ff8888', count: 6,  maxAge: 40 },
        { pos: [10, 0, -36] as [number,number,number], color: '#ffaacc', count: 10, maxAge: 45 },
        { pos: [-9, 0, -25] as [number,number,number], color: '#aaddff', count: 7,  maxAge: 45 },
      ]).map(({ pos, color, count, maxAge }, fi) => (
        <TemporalProp key={`fl${fi}`} position={pos} maxAge={maxAge}>
          {[...Array(count)].map((_, i) => {
            const angle = (i / count) * Math.PI * 2
            const r = 0.5 + (i % 3) * 0.3
            return (
              <group key={i} position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]}>
                <mesh position={[0, 0.18, 0]}><cylinderGeometry args={[0.02, 0.02, 0.36, 3]} /><meshLambertMaterial color="#4a7a30" /></mesh>
                <mesh position={[0, 0.38, 0]}><sphereGeometry args={[0.1, 4, 3]} /><meshLambertMaterial color={color} /></mesh>
              </group>
            )
          })}
        </TemporalProp>
      ))}

      {/* Stone path (geological — always present) */}
      {[...Array(10)].map((_, i) => (
        <mesh key={`p${i}`} position={[0.3 + Math.sin(i * 0.5) * 0.8, 0.02, -8 - i * 6]} rotation={[-Math.PI / 2, 0, i * 0.3]}>
          <circleGeometry args={[0.3 + Math.sin(i) * 0.1, 6]} />
          <meshLambertMaterial color="#9a8870" />
        </mesh>
      ))}

      {/* Distant treeline silhouette (static) */}
      {([[-45,-92],[-30,-97],[-15,-90],[5,-95],[22,-88],[38,-93],[55,-90],[-60,-85],[70,-86]] as [number,number][]).map(([x,z], i) => (
        <mesh key={`dl${i}`} position={[x, 3.5 + Math.sin(i) * 1.2, z]} scale={[9 + i * 0.4, 4.5, 4]}>
          <sphereGeometry args={[1, 5, 4]} />
          <meshLambertMaterial color="#1a3a10" />
        </mesh>
      ))}
    </TemporalRegistry>
  )
}
