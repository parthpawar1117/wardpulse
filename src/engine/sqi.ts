import type { Packet } from '../schema/packet'

/**
 * Signal quality index: how far to trust the numbers a bedside node reports.
 *
 * Cheap PPG nodes compute HR and SpO2 on the device, and motion fools that
 * algorithm into plausible-looking but wrong values. The raw waveform shows
 * the problem plainly, so the console re-checks it before raising alarms.
 * Three checks, each scored 0 to 1 and multiplied together:
 *   morphology – do the beats look like each other (template correlation)?
 *   rhythm     – are beat intervals regular and physiologically possible?
 *   perfusion  – is the pulse amplitude believable for a finger?
 */

export type SqiReason =
  | 'insufficient-data'
  | 'no-contact'
  | 'no-beats'
  | 'artefact'
  | 'implausible-rate'
  | 'low-perfusion'
  | 'no-waveform'

export interface SqiResult {
  /** 0 = ignore these vitals, 1 = clean signal. */
  sqi: number
  /** Why the score is below 1. Empty for a clean signal. */
  reasons: SqiReason[]
  /** Pulse rate recovered from the waveform, in bpm. */
  hr: number | null
  /** Perfusion index recovered from the waveform, in percent. */
  pi: number | null
}

const DEFAULT_FS = 25
const MIN_SECONDS = 3
/** Below this IR level there is no finger: the photodiode only sees ambient light. */
const CONTACT_MIN_DC = 10_000
const HR_RANGE = { min: 30, max: 220 }
/** Beats are resampled to this many points before comparing shapes. */
const TEMPLATE_POINTS = 32

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const std = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** Subtracts a centred moving average, removing baseline wander slower than about one beat. */
function detrend(x: number[], width: number): number[] {
  const half = Math.floor(width / 2)
  const prefix = [0]
  for (const v of x) prefix.push(prefix[prefix.length - 1] + v)
  return x.map((v, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(x.length, i + half + 1)
    return v - (prefix[hi] - prefix[lo]) / (hi - lo)
  })
}

/**
 * Beat onsets as upward crossings of a level set from the window's range, not
 * its mean, because a PPG beat is asymmetric. The trigger sits at 65% of the
 * range and re-arms below 35%: the dicrotic wave peaks near 40% of a beat, so
 * a midrange trigger (50%) let noise count it as a second beat.
 */
function beatOnsets(x: number[], fs: number): number[] {
  const lo = Math.min(...x)
  const hi = Math.max(...x)
  const trigger = lo + (hi - lo) * 0.65
  const rearm = lo + (hi - lo) * 0.35
  const refractory = Math.round(fs * 0.25)
  const onsets: number[] = []
  let armed = false
  for (let i = 0; i < x.length; i++) {
    if (x[i] < rearm) armed = true
    else if (armed && x[i] >= trigger && (onsets.length === 0 || i - onsets[onsets.length - 1] >= refractory)) {
      onsets.push(i)
      armed = false
    }
  }
  return onsets
}

function resample(seg: number[], n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const p = (i * (seg.length - 1)) / (n - 1)
    const j = Math.floor(p)
    const f = p - j
    return j + 1 < seg.length ? seg[j] * (1 - f) + seg[j + 1] * f : seg[j]
  })
}

function correlation(a: number[], b: number[]): number {
  const ma = mean(a)
  const mb = mean(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db)
}

/** Scores one window of raw IR samples. Pure, so it is easy to test against the simulator. */
export function signalQuality(ir: number[], fs = DEFAULT_FS): SqiResult {
  if (ir.length < MIN_SECONDS * fs) return { sqi: 0, reasons: ['insufficient-data'], hr: null, pi: null }

  const dc = mean(ir)
  if (dc < CONTACT_MIN_DC) return { sqi: 0, reasons: ['no-contact'], hr: null, pi: null }

  // The sensor sees absorption, so beats are dips. Invert so beats are peaks.
  const pulse = ir.map((v) => dc - v)
  const hp = detrend(pulse, fs)
  const onsets = beatOnsets(hp, fs)
  if (onsets.length < 3) return { sqi: 0, reasons: ['no-beats'], hr: null, pi: null }

  const beats = onsets.slice(1).map((end, i) => pulse.slice(onsets[i], end))
  const intervals = beats.map((b) => b.length)

  // Perfusion index: median beat amplitude over DC, in percent.
  const pi = (median(beats.map((b) => Math.max(...b) - Math.min(...b))) / dc) * 100
  const perfusion = pi < 0.3 ? clamp01((pi - 0.05) / 0.25) : pi > 15 ? clamp01((25 - pi) / 10) : 1

  // Mean spacing, not the median: at 25 Hz a 120 bpm beat is 12.5 samples, so
  // intervals alternate 12/13 and a median would snap the rate to 115 or 125.
  const hr = (60 * fs * (onsets.length - 1)) / (onsets[onsets.length - 1] - onsets[0])
  const cv = std(intervals) / mean(intervals)
  const plausible = hr >= HR_RANGE.min && hr <= HR_RANGE.max
  const rhythm = plausible ? clamp01(1 - (cv - 0.08) / 0.25) : 0

  const shapes = beats.map((b) => resample(b, TEMPLATE_POINTS))
  const template = shapes[0].map((_, i) => mean(shapes.map((s) => s[i])))
  const meanCorr = mean(shapes.map((s) => correlation(s, template)))
  const morphology = clamp01((meanCorr - 0.6) / 0.3)

  const reasons: SqiReason[] = []
  if (!plausible) reasons.push('implausible-rate')
  if (morphology < 0.7 || (plausible && rhythm < 0.7)) reasons.push('artefact')
  if (perfusion < 1) reasons.push('low-perfusion')

  const sqi = Math.round(morphology * rhythm * perfusion * 100) / 100
  return { sqi, reasons, hr: plausible ? Math.round(hr) : null, pi: Math.round(pi * 100) / 100 }
}

export interface SqiTracker {
  push(packet: Packet): SqiResult
}

/**
 * Keeps a rolling window of one bed's raw samples across packets. A gap in
 * seq means samples are missing, so the window restarts rather than splicing
 * two unrelated stretches of waveform together.
 */
export function createSqiTracker(windowSeconds = 8, fs = DEFAULT_FS): SqiTracker {
  let buffer: number[] = []
  let lastSeq: number | null = null

  const push = (p: Packet): SqiResult => {
    if (!p.ir) {
      buffer = []
      lastSeq = null
      // Without a waveform the vitals can't be checked: trust them only halfway.
      return p.hr === null
        ? { sqi: 0, reasons: ['no-contact'], hr: null, pi: null }
        : { sqi: 0.5, reasons: ['no-waveform'], hr: p.hr, pi: p.pi }
    }
    if (lastSeq !== null && p.seq !== lastSeq + 1) buffer = []
    lastSeq = p.seq
    buffer = buffer.concat(p.ir).slice(-windowSeconds * fs)
    return signalQuality(buffer, fs)
  }

  return { push }
}
