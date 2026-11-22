import type { Rng } from './rng'
import type { TruthVitals } from './scenario'

/** Samples per second, a common MAXREFDES117 configuration. */
export const SAMPLE_RATE = 25

export interface PpgFrame {
  ir: number[]
  red: number[]
}

export interface PpgGenerator {
  generate(vitals: TruthVitals, n: number): PpgFrame
}

/** Raw DC levels in ADC counts, typical of an 18-bit MAX30102 front end on a finger. */
const DC_IR = 50_000
const DC_RED = 42_000
/** Ambient-light levels with no finger on the sensor. */
const AMBIENT_IR = 1_500
const AMBIENT_RED = 1_200
/** Sensor noise as a fraction of the pulse amplitude. */
const NOISE = 0.02
/** Breathing modulates pulse amplitude by ±5% at about 15 breaths a minute. */
const RESP_DEPTH = 0.05
const RESP_HZ = 0.25

/** Empirical oximetry calibration: SpO2 ≈ 110 − 25·R, so R = (110 − SpO2) / 25. */
export const ratioFromSpo2 = (spo2: number) => (110 - spo2) / 25

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-(((x - mu) / sigma) ** 2))
/** One beat: systolic peak plus a smaller dicrotic wave, phase in [0, 1). */
const rawPulse = (phase: number) => gauss(phase, 0.22, 0.11) + 0.4 * gauss(phase, 0.52, 0.11)

/** Normalise the beat shape to span exactly [0, 1] so AC means peak-to-trough. */
const PULSE_TABLE = (() => {
  const size = 1000
  const raw = Array.from({ length: size }, (_, i) => rawPulse(i / size))
  const lo = Math.min(...raw)
  const hi = Math.max(...raw)
  return raw.map((x) => (x - lo) / (hi - lo))
})()
const pulse = (phase: number) => PULSE_TABLE[Math.floor(phase * PULSE_TABLE.length) % PULSE_TABLE.length]

/**
 * Synthesises raw IR and red PPG as the sensor sees it: more blood absorbs more
 * light, so each beat is a dip below the DC level. Keeps phase between calls so
 * consecutive packets join into one continuous waveform.
 */
export function createPpgGenerator(rng: Rng): PpgGenerator {
  let phase = 0
  let t = 0
  let artefact = 0

  const generate = (v: TruthVitals, n: number): PpgFrame => {
    const ir: number[] = []
    const red: number[] = []
    const acIr = (DC_IR * v.pi) / 100
    const acRed = ratioFromSpo2(v.spo2) * (acIr / DC_IR) * DC_RED

    for (let i = 0; i < n; i++) {
      t += 1 / SAMPLE_RATE

      if (v.sensorOff) {
        artefact = 0
        ir.push(AMBIENT_IR + rng.normal() * 20)
        red.push(AMBIENT_RED + rng.normal() * 20)
        continue
      }

      phase = (phase + v.hr / 60 / SAMPLE_RATE) % 1
      const resp = 1 + RESP_DEPTH * Math.sin(2 * Math.PI * RESP_HZ * t)
      const s = pulse(phase) * resp

      if (v.motion) {
        // Random walk plus occasional jolts: the finger shifting in the clip.
        artefact = artefact * 0.97 + rng.normal() * 0.6 * acIr
        if (rng.next() < 0.03) artefact += (rng.next() - 0.5) * 30 * acIr
      } else {
        artefact *= 0.8
      }

      ir.push(DC_IR - acIr * s + rng.normal() * NOISE * acIr + artefact)
      red.push(DC_RED - acRed * s + rng.normal() * NOISE * acRed + artefact * (DC_RED / DC_IR) * 0.9)
    }

    return { ir, red }
  }

  return { generate }
}
