export type TimelineState = {
  label: string
  age: number  // arbitrary age unit, 0 = most ancient, increases toward present
}

export type TemporalObject = {
  id: string
  position: [number, number, number]
  timeline: TimelineState[]
}

// Returns { stateIndex, nextStateIndex, blend } where blend is 0..1 between states
export function sampleTimeline(visibleAge: number, timeline: TimelineState[]): {
  stateIndex: number
  nextStateIndex: number
  blend: number
  label: string
  age: number
} {
  if (timeline.length === 0) return { stateIndex: 0, nextStateIndex: 0, blend: 0, label: '', age: 0 }

  const maxAge = timeline[timeline.length - 1].age
  const minAge = timeline[0].age
  const clampedAge = Math.min(Math.max(visibleAge, minAge), maxAge)

  for (let i = 0; i < timeline.length - 1; i++) {
    const a = timeline[i]
    const b = timeline[i + 1]
    if (clampedAge >= a.age && clampedAge <= b.age) {
      const blend = (clampedAge - a.age) / (b.age - a.age)
      return { stateIndex: i, nextStateIndex: i + 1, blend, label: blend > 0.5 ? b.label : a.label, age: clampedAge }
    }
  }

  return {
    stateIndex: timeline.length - 1,
    nextStateIndex: timeline.length - 1,
    blend: 0,
    label: timeline[timeline.length - 1].label,
    age: clampedAge,
  }
}

export function getVisibleAge(distance: number, R: number, ageScale: number): number {
  // Central formula: visibleAge = distance * ageScale * (1 / R)
  return distance * ageScale * (1 / Math.max(R, 0.001))
}
