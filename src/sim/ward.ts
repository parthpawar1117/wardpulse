import type { Packet } from '../schema/packet'
import type { BedConfig, SimOptions } from './bed'

export interface WardTick {
  simTime: number
  packets: Packet[]
}

export interface WardSimulator {
  tick(): WardTick
}

export function createDemoWard(): BedConfig[] {
  throw new Error('not implemented')
}

export function createWardSimulator(_beds: BedConfig[], _opts: SimOptions): WardSimulator {
  throw new Error('not implemented')
}
