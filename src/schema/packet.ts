/** One reading from a bedside node, relayed by the ward hub. See docs/packet-schema.md. */
export interface Packet {
  v: 1
  hub: string
  node: string
  seq: number
  ts: number
  hr: number | null
  spo2: number | null
  pi: number | null
  ir?: number[]
  red?: number[]
  batt: number
  rssi: number
}

export type ValidationResult = { ok: true; packet: Packet } | { ok: false; errors: string[] }

export function validatePacket(_input: unknown): ValidationResult {
  throw new Error('not implemented')
}
