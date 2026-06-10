import type { TimelineState } from './timeline'

// Age = "temporal distance from present": 0 = current state, larger = deeper into the past.
// Calibrated so that at R=1, ageScale=0.5, each object is in its present state.
// Formula: visibleAge = distance * ageScale * (1 / R)

export const mountainTimeline: TimelineState[] = [
  { label: 'Mature green mountain', age: 0 },      // present
  { label: 'Young mountain', age: 50 },
  { label: 'Unstable rocky relief', age: 130 },
  { label: 'Active volcanoes', age: 260 },
  { label: 'Proto-debris / Magma', age: 460 },
]
// dist~80, ageScale=0.5: at R=1 → 40 (present); R=0.5 → 80 (young); R=0.2 → 200 (volcanic)

export const moonTimeline: TimelineState[] = [
  { label: 'Current moon', age: 0 },               // present
  { label: 'Young reddish moon', age: 80 },
  { label: 'Proto-moon accreting', age: 210 },
  { label: 'Meteor swarm / Debris disk', age: 440 },
]
// dist~145, ageScale=0.5: at R=1 → 72 (current); R=0.4 → 181 (young reddish)

export const treeTimeline: TimelineState[] = [
  { label: 'Ancient tree', age: 0 },               // present
  { label: 'Adult tree', age: 8 },
  { label: 'Shrub', age: 22 },
  { label: 'Young sprout', age: 50 },
  { label: 'Seed / invisible sprout', age: 100 },
]
// dist~28, ageScale=0.5: at R=1 → 14 (adult); R=0.3 → 47 (sprout)

export const houseTimeline: TimelineState[] = [
  { label: 'Inhabited / smoke rising', age: 0 },   // present
  { label: 'Completed house', age: 14 },
  { label: 'Wood structure', age: 38 },
  { label: 'Foundations laid', age: 80 },
  { label: 'Empty terrain', age: 160 },
]
// dist~42, ageScale=0.5: at R=1 → 21 (inhabited); R=0.3 → 70 (structure)

export const characterTimeline: TimelineState[] = [
  { label: 'Very old', age: 0 },                   // close to camera = oldest
  { label: 'Elder', age: 5 },
  { label: 'Adult', age: 12 },
  { label: 'Teenager', age: 22 },
  { label: 'Child', age: 38 },
]
// Character walks toward camera. Far = child, close = very old.

export const cupTimeline: TimelineState[] = [
  { label: 'Cup with coffee', age: 0 },            // present
  { label: 'Painted cup', age: 3 },
  { label: 'Fired ceramic', age: 8 },
  { label: 'Shaped clay', age: 18 },
  { label: 'Raw clay / earth', age: 38 },
]
// dist~12, ageScale=0.5: at R=1 → 6 (coffee cup); R=0.2 → 30 (fired)
