import { create } from 'zustand'

export type CameraMode = 'orbit' | 'demo' | 'fps'

interface SimState {
  R: number
  ageScale: number
  showLabels: boolean
  ghosting: boolean
  cameraMode: CameraMode
  focusedObject: {
    name: string
    distance: number
    visibleAge: number
    stateLabel: string
  } | null
  setR: (v: number) => void
  setAgeScale: (v: number) => void
  setShowLabels: (v: boolean) => void
  setGhosting: (v: boolean) => void
  setCameraMode: (m: CameraMode) => void
  setFocusedObject: (obj: SimState['focusedObject']) => void
}

export const useSimStore = create<SimState>((set) => ({
  R: 1.0,
  ageScale: 0.5,
  showLabels: true,
  ghosting: true,
  cameraMode: 'orbit',
  focusedObject: null,
  setR: (v) => set({ R: v }),
  setAgeScale: (v) => set({ ageScale: v }),
  setShowLabels: (v) => set({ showLabels: v }),
  setGhosting: (v) => set({ ghosting: v }),
  setCameraMode: (m) => set({ cameraMode: m }),
  setFocusedObject: (obj) => set({ focusedObject: obj }),
}))
