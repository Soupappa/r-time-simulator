export const DEFAULT_INTERNAL_CHANGE_SPEED = 12

export function effectiveLightSpeed(
  rRatio: number,
  internalChangeSpeed = DEFAULT_INTERNAL_CHANGE_SPEED,
) {
  return Math.max(0.001, rRatio * internalChangeSpeed)
}

export function betaFromSpeed(speed: number, lightSpeed: number) {
  return Math.min(Math.max(speed / Math.max(lightSpeed, 0.001), 0), 0.995)
}

export function gammaFromBeta(beta: number) {
  const b = Math.min(Math.max(beta, 0), 0.999999)
  return 1 / Math.sqrt(Math.max(1e-6, 1 - b * b))
}

export function retardedTime(now: number, distance: number, lightSpeed: number) {
  return now - distance / Math.max(lightSpeed, 0.001)
}

export function dopplerFactor(beta: number, gamma: number, cosTheta: number) {
  const denom = gamma * Math.max(1e-6, 1 - beta * cosTheta)
  return 1 / denom
}

export function forwardAngularScale(beta: number) {
  return Math.sqrt(Math.max(0.0001, (1 - beta) / (1 + beta)))
}
