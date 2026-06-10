import { Html } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import * as THREE from 'three'
import { useSimStore } from '../store'
import { getVisibleAge, sampleTimeline, type TimelineState } from '../temporal/timeline'
import { mountainTimeline, moonTimeline, treeTimeline, houseTimeline, cupTimeline } from '../temporal/presets'

type LabelConfig = {
  name: string
  objectPos: [number, number, number]
  labelPos: [number, number, number]
  timeline: TimelineState[]
}

const OBJECTS: LabelConfig[] = [
  {
    name: 'Mountain',
    objectPos: [0, 0, -80],
    labelPos: [0, 22, -80],
    timeline: mountainTimeline,
  },
  {
    name: 'Moon',
    objectPos: [40, 60, -120],
    labelPos: [40, 68, -120],
    timeline: moonTimeline,
  },
  {
    name: 'Tree',
    objectPos: [-8, 0, -28],
    labelPos: [-8, 8, -28],
    timeline: treeTimeline,
  },
  {
    name: 'House',
    objectPos: [12, 0, -42],
    labelPos: [12, 6, -42],
    timeline: houseTimeline,
  },
  {
    name: 'Cup',
    objectPos: [-1.5, 0.8, -3],
    labelPos: [-1.5, 1.6, -3],
    timeline: cupTimeline,
  },
]

function ObjectLabel({ config }: { config: LabelConfig }) {
  const { camera } = useThree()
  const { R, ageScale } = useSimStore()
  const [info, setInfo] = useState({ label: '', dist: 0, visibleAge: 0 })
  const posVec = useRef(new THREE.Vector3(...config.objectPos))

  useFrame(() => {
    const dist = camera.position.distanceTo(posVec.current)
    const visibleAge = getVisibleAge(dist, R, ageScale)
    const sample = sampleTimeline(visibleAge, config.timeline)
    setInfo({ label: sample.label, dist, visibleAge })
  })

  const ageStr = info.visibleAge > 100
    ? `${info.visibleAge.toFixed(0)} u`
    : `${info.visibleAge.toFixed(2)} u`

  return (
    <Html position={config.labelPos} center style={{ pointerEvents: 'none' }}>
      <div className="object-label">
        <div className="label-name">{config.name}</div>
        <div className="label-state">{info.label}</div>
        <div style={{ color: '#5a6080', fontSize: '9px' }}>
          dist: {info.dist.toFixed(1)} · age: {ageStr}
        </div>
      </div>
    </Html>
  )
}

export function TemporalLabels() {
  const { showLabels } = useSimStore()
  if (!showLabels) return null

  return (
    <>
      {OBJECTS.map((obj) => (
        <ObjectLabel key={obj.name} config={obj} />
      ))}
    </>
  )
}
