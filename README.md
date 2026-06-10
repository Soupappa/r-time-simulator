# R-Time Simulator

A pedagogical 3D simulation engine where **distance becomes visible time**.

## Concept

In this world, the observer does not see objects in their current state — they see their **historical state**, determined by their distance from the camera.

### Central Formula

```
visibleAge = distance × ageScale × (1 / R)
visibleState = timeline.sample(visibleAge)
```

- **When R is high** — the world looks coherent, nearly present.
- **When R drops** — the farther an object, the deeper into its past you see it.

`R` models the ratio of global propagation speed to internal transformation rate. Reducing R is like slowing down the effective speed of light.

> This is not real relativistic physics. It is a visual/conceptual model of temporal perception through distance.

---

## Installation

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Scene Objects

| Object | Distance | Timeline |
|--------|----------|----------|
| Cup | ~3 units | Raw clay → shaped → fired → painted → coffee |
| Character | 4–50 units | Child → teenager → adult → elder → very old |
| Tree | ~28 units | Seed → sprout → shrub → adult → ancient |
| House | ~42 units | Empty terrain → foundations → structure → complete → inhabited |
| Mountain | ~80 units | Proto-debris/magma → volcanoes → rocky → young → green |
| Moon | ~140 units | Meteor swarm → proto-moon → reddish → current |

---

## Controls

### Camera
- **Orbit mode** — drag to rotate, scroll to zoom, right-drag to pan
- **Cinematic demo** — camera automatically flies toward the mountain; watch objects shift through their timelines

### UI Sliders
- **R** (0.05 – 5.0) — propagation ratio; lower = stronger temporal distortion
- **Age scale** — multiplier for age calculation
- **Temporal labels** — show/hide floating info tags on objects
- **Ghosting** — subtle transparency on very distant ancient objects

---

## Video Export

Click **Start recording** → interact with the scene → **Stop recording** → **Download WebM**.

The recording uses the browser's native `canvas.captureStream()` + `MediaRecorder` API.

**Convert to MP4 with ffmpeg:**
```bash
ffmpeg -i r-time-simulation.webm -c:v libx264 output.mp4
```

Future option: frame-by-frame export via ffmpeg.wasm for higher quality.

---

## Key Files

```
src/
  App.tsx                    — canvas + overlay layout
  store.ts                   — Zustand state (R, ageScale, labels, ghosting, camera mode)
  temporal/
    timeline.ts              — core formula: getVisibleAge(), sampleTimeline()
    presets.ts               — all object timelines
  objects/
    Mountain.tsx             — low-poly mountain with 5 historical states
    Moon.tsx                 — moon with 4 states from debris disk to current
    Tree.tsx                 — tree with 5 growth states
    House.tsx                — house with 5 construction states
    Character.tsx            — walking figure with 5 age states
    Cup.tsx                  — cup with 5 material states
  components/
    Scene.tsx                — Three.js scene, lighting, ground, camera modes
    TemporalLabels.tsx       — HTML labels anchored to 3D positions
    UIOverlay.tsx            — sliders, toggles, readout panel
    RecorderControls.tsx     — WebM recording UI
  utils/
    recording.ts             — VideoRecorder class
    distance.ts              — distanceFromCamera helper
```

---

## Limits of the Model

- No actual Lorentz transformation or relativistic aberration
- Timeline states are discrete morphs (opacity blending), not true geometric morphing
- "Age units" are fictional — the scale is set for visual clarity, not physical accuracy
- The character walks in a loop rather than traveling a fixed distance

---

## Roadmap

### V1
- [ ] Smooth morph targets via Three.js `MorphTargetInfluences`
- [ ] Import GLB/GLTF for each historical state
- [ ] Export MP4 via ffmpeg.wasm
- [ ] Atmospheric fog that increases with R drop

### V2
- [ ] "Temporal city" mode — urban landscape with buildings at various construction phases
- [ ] "Human approach" focus mode — zoom on character timeline
- [ ] Cinematic scripting system (keyframed camera + R animation)
- [ ] High-quality frame-by-frame render export
- [ ] Scene sharing via JSON snapshots
- [ ] Audio — ghostly sounds for ancient states
