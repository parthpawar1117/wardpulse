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

export function vitalsAt(_scenario: BedScenario, _t: number): TruthVitals {
  throw new Error('not implemented')
}
