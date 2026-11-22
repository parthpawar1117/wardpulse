/** Times are simulation seconds from the start of the shift. */
export type ScenarioEvent =
  | { kind: 'deterioration'; start: number; duration: number; hrDelta: number; spo2Delta: number }
  | { kind: 'hypoxia'; start: number; onset: number; spo2Target: number; hrDelta: number }
  | { kind: 'motion'; start: number; duration: number }
  | { kind: 'sensor-off'; start: number; duration: number }
  | { kind: 'packet-loss'; start: number; duration: number; probability: number }

export interface BedScenario {
  baseline: { hr: number; spo2: number; pi: number }
  events: ScenarioEvent[]
}

/** What is really happening to the patient and the sensor at one instant. */
export interface TruthVitals {
  hr: number
  spo2: number
  pi: number
  motion: boolean
  sensorOff: boolean
  lossProbability: number
}

/** Bounds keep scripted scenarios physiologically plausible. */
const TRUTH_BOUNDS = { hr: { min: 30, max: 250 }, spo2: { min: 60, max: 100 } }

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))
const inWindow = (t: number, start: number, duration: number) => t >= start && t < start + duration
/** Fraction of a ramp completed at time t: 0 before start, 1 after start + length. */
const progress = (t: number, start: number, length: number) =>
  length <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / length, 0, 1)

/**
 * Ground truth for one bed at time t. Pure: the same scenario and time always
 * give the same answer, which is what lets the engine's lead times be measured.
 */
export function vitalsAt(scenario: BedScenario, t: number): TruthVitals {
  let { hr, spo2 } = scenario.baseline
  const { pi } = scenario.baseline
  let motion = false
  let sensorOff = false
  let lossProbability = 0

  for (const e of scenario.events) {
    switch (e.kind) {
      case 'deterioration': {
        const f = progress(t, e.start, e.duration)
        hr += e.hrDelta * f
        spo2 += e.spo2Delta * f
        break
      }
      case 'hypoxia': {
        const f = progress(t, e.start, e.onset)
        spo2 += (e.spo2Target - spo2) * f
        hr += e.hrDelta * f
        break
      }
      case 'motion':
        if (inWindow(t, e.start, e.duration)) motion = true
        break
      case 'sensor-off':
        if (inWindow(t, e.start, e.duration)) sensorOff = true
        break
      case 'packet-loss':
        if (inWindow(t, e.start, e.duration)) lossProbability = Math.max(lossProbability, e.probability)
        break
    }
  }

  return {
    hr: clamp(hr, TRUTH_BOUNDS.hr.min, TRUTH_BOUNDS.hr.max),
    spo2: clamp(spo2, TRUTH_BOUNDS.spo2.min, TRUTH_BOUNDS.spo2.max),
    pi,
    motion,
    sensorOff,
    lossProbability,
  }
}
