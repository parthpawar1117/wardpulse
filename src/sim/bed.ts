import type { Packet } from '../schema/packet'
import type { BedScenario } from './scenario'

export interface BedConfig {
  id: string
  /** Display label. Demo patients are fictional. */
  patient: string
  scenario: BedScenario
  /** Starting battery fraction, 0 to 1. */
  battery: number
  drainPerHour: number
  /** Typical link strength at the hub, in dBm. */
  rssi: number
}

export interface SimOptions {
  hub: string
  startTs: number
  seed: number
}

export interface BedSimulator {
  /** Advances one second. Returns null when the packet is lost or the node is dead. */
  next(): Packet | null
}

export function createBedSimulator(_cfg: BedConfig, _opts: SimOptions): BedSimulator {
  throw new Error('not implemented')
}
