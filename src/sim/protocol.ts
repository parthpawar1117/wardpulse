import type { Packet } from '../schema/packet'

/** Messages the console sends to the simulator worker. */
export type ToSimulator =
  | { type: 'start'; seed: number; speed: number; startTs: number }
  | { type: 'set-speed'; speed: number }
  | { type: 'pause' }
  | { type: 'resume' }

/** Messages the simulator worker sends back: one batch per simulated second. */
export type FromSimulator = { type: 'packets'; simTime: number; packets: Packet[] }
