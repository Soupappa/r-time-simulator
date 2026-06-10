// Helper to compute per-child opacity given a temporal sample.
// Convention: JSX children order goes from PRESENT (i=0) to ANCIENT (i=numStates-1).
// Timeline: age=0 = present, age increases = deeper past.
// stateIndex=0 means we see the "most present" state.

export function computeStateOpacities(stateIndex: number, blend: number, numStates: number): number[] {
  const opacities: number[] = new Array(numStates).fill(0)
  const next = Math.min(stateIndex + 1, numStates - 1)

  // stateIndex is fully visible at blend=0, fades toward next at blend=1
  opacities[stateIndex] = 1 - blend
  if (next !== stateIndex) opacities[next] = blend

  return opacities
}
