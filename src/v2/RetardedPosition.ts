import * as THREE from 'three'

// ─── Ring buffer of timestamped positions ─────────────────────────────────────
export class HistoryBuffer {
  private buf: Float32Array  // [x, y, z, t] × capacity
  private head = 0
  private count = 0
  readonly capacity: number

  constructor(capacity = 512) {
    this.capacity = capacity
    this.buf = new Float32Array(capacity * 4)
  }

  push(pos: THREE.Vector3, t: number) {
    const i = this.head * 4
    this.buf[i]     = pos.x
    this.buf[i + 1] = pos.y
    this.buf[i + 2] = pos.z
    this.buf[i + 3] = t
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
  }

  // Get the slot index (raw) for iteration, newest-first
  private slot(offset: number): number {
    return (this.head - 1 - offset + this.capacity * 2) % this.capacity
  }

  // Oldest t stored
  get oldestT(): number {
    if (this.count === 0) return 0
    const i = this.slot(this.count - 1) * 4
    return this.buf[i + 3]
  }

  // Newest t stored
  get newestT(): number {
    if (this.count === 0) return 0
    const i = this.slot(0) * 4
    return this.buf[i + 3]
  }

  // Interpolate position at time t_target (linear between samples)
  sampleAt(t_target: number, out: THREE.Vector3): boolean {
    if (this.count < 2) return false

    // Scan newest → oldest to find bracket
    for (let k = 0; k < this.count - 1; k++) {
      const ia = this.slot(k)     * 4
      const ib = this.slot(k + 1) * 4
      const ta = this.buf[ia + 3]
      const tb = this.buf[ib + 3]
      if (t_target <= ta && t_target >= tb) {
        const alpha = (ta - t_target) / (ta - tb)
        out.set(
          this.buf[ia]     + (this.buf[ib]     - this.buf[ia])     * alpha,
          this.buf[ia + 1] + (this.buf[ib + 1] - this.buf[ia + 1]) * alpha,
          this.buf[ia + 2] + (this.buf[ib + 2] - this.buf[ia + 2]) * alpha,
        )
        return true
      }
    }
    // Clamp to oldest
    const io = this.slot(this.count - 1) * 4
    out.set(this.buf[io], this.buf[io + 1], this.buf[io + 2])
    return false
  }
}

// ─── Core solver: retarded position ──────────────────────────────────────────
// Finds t_emit such that: distance(observer, obj(t_emit)) = cSim * (tNow - t_emit)
// Uses bisection — robust, ~20 iterations, converges to machine precision.

const _tmp = new THREE.Vector3()

export function solveRetardedPosition(
  history: HistoryBuffer,
  observer: THREE.Vector3,
  tNow: number,
  cSim: number,        // effective speed of light (world units / second)
  out: THREE.Vector3,
): boolean {
  const tOld = history.oldestT
  const tNew = history.newestT
  if (tNew === tOld) return false

  // f(t) = cSim*(tNow-t) - |observer - obj(t)|
  // We want f(t_emit) = 0.
  // f is monotone: at t=tNow, f=0 (if object is at observer); at t=tOld, f could be +/-
  // We look for the most recent t_emit ≤ tNow where f(t_emit) ≥ 0.

  let lo = tOld
  let hi = tNew

  // Quick feasibility: if the object is always too far even at oldest history, clamp.
  history.sampleAt(lo, _tmp)
  const distAtOld = observer.distanceTo(_tmp)
  const travelAtOld = cSim * (tNow - lo)
  if (distAtOld > travelAtOld * 1.01) {
    // Light hasn't reached observer yet from any historical position — use oldest
    out.copy(_tmp)
    return false
  }

  // Bisect
  for (let iter = 0; iter < 24; iter++) {
    const tMid = (lo + hi) * 0.5
    history.sampleAt(tMid, _tmp)
    const dist = observer.distanceTo(_tmp)
    const travelTime = cSim * (tNow - tMid)
    if (dist < travelTime) {
      lo = tMid  // light emitted here would already be ahead of observer
    } else {
      hi = tMid  // light emitted here hasn't reached observer yet
    }
  }

  history.sampleAt((lo + hi) * 0.5, out)
  return true
}
