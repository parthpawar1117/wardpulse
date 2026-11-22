/** One reading from a bedside node, relayed by the ward hub. See docs/packet-schema.md. */
export interface Packet {
  v: 1
  hub: string
  node: string
  /** Per-node monotonic counter. Makes sync idempotent and reveals mesh packet loss. */
  seq: number
  /** Unix epoch milliseconds, stamped by the hub. */
  ts: number
  /** Heart rate in bpm, or null when the node cannot compute it. */
  hr: number | null
  /** Peripheral oxygen saturation in %, or null when the node cannot compute it. */
  spo2: number | null
  /** Perfusion index in %, or null. Low PI means a weak pulse signal. */
  pi: number | null
  /** Raw infrared PPG samples since the last packet (optional, used for signal quality). */
  ir?: number[]
  /** Raw red PPG samples, same length as ir. */
  red?: number[]
  /** Node battery, 0 to 1. */
  batt: number
  /** Received signal strength at the hub, in dBm. */
  rssi: number
}

export type ValidationResult = { ok: true; packet: Packet } | { ok: false; errors: string[] }

/** Plausibility limits. Values outside these are sensor faults, not patients. */
export const LIMITS = {
  hr: { min: 20, max: 300 },
  spo2: { min: 50, max: 100 },
  pi: { min: 0, max: 20 },
  batt: { min: 0, max: 1 },
  rssi: { min: -120, max: 0 },
  maxSamples: 250,
} as const

const isFiniteNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isNonEmptyString = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0

function checkRange(
  errors: string[],
  name: string,
  value: unknown,
  { min, max }: { min: number; max: number },
  nullable: boolean,
): void {
  if (value === null && nullable) return
  if (!isFiniteNumber(value) || value < min || value > max) {
    errors.push(`${name} must be a number from ${min} to ${max}${nullable ? ' or null' : ''}`)
  }
}

function checkSamples(errors: string[], name: string, value: unknown): void {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > LIMITS.maxSamples || !value.every(isFiniteNumber)) {
    errors.push(`${name} must be an array of at most ${LIMITS.maxSamples} finite numbers`)
  }
}

/**
 * Validates an untrusted packet from the hub. Never throws: a flaky mesh must not
 * crash the console. Collects every problem so firmware developers can fix them in one pass.
 */
export function validatePacket(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['packet must be a JSON object'] }
  }
  const p = input as Record<string, unknown>
  const errors: string[] = []

  if (p.v !== 1) errors.push('v must be 1')
  if (!isNonEmptyString(p.hub)) errors.push('hub must be a non-empty string')
  if (!isNonEmptyString(p.node)) errors.push('node must be a non-empty string')
  if (!Number.isSafeInteger(p.seq) || (p.seq as number) < 0) {
    errors.push('seq must be a non-negative integer')
  }
  if (!Number.isSafeInteger(p.ts) || (p.ts as number) <= 0) {
    errors.push('ts must be a positive integer (epoch ms)')
  }

  checkRange(errors, 'hr', p.hr, LIMITS.hr, true)
  checkRange(errors, 'spo2', p.spo2, LIMITS.spo2, true)
  checkRange(errors, 'pi', p.pi, LIMITS.pi, true)
  checkRange(errors, 'batt', p.batt, LIMITS.batt, false)
  checkRange(errors, 'rssi', p.rssi, LIMITS.rssi, false)

  checkSamples(errors, 'ir', p.ir)
  checkSamples(errors, 'red', p.red)
  if (Array.isArray(p.ir) !== Array.isArray(p.red)) {
    errors.push('ir and red must be sent together')
  } else if (Array.isArray(p.ir) && Array.isArray(p.red) && p.ir.length !== p.red.length) {
    errors.push('ir and red must have the same length')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, packet: p as unknown as Packet }
}
