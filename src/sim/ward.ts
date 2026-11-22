import type { Packet } from '../schema/packet'
import { createBedSimulator, type BedConfig, type SimOptions } from './bed'

export interface WardTick {
  simTime: number
  packets: Packet[]
}

export interface WardSimulator {
  tick(): WardTick
}

/**
 * The 8-bed ward the demo video follows. Times are simulation seconds.
 * Patients are fictional; every number here is synthetic.
 */
export function createDemoWard(): BedConfig[] {
  const bed = (
    id: string,
    patient: string,
    baseline: BedConfig['scenario']['baseline'],
    events: BedConfig['scenario']['events'] = [],
    extra: Partial<BedConfig> = {},
  ): BedConfig => ({
    id,
    patient,
    scenario: { baseline, events },
    battery: 0.92,
    drainPerHour: 0.02,
    rssi: -58,
    ...extra,
  })

  return [
    bed('bed-01', 'R. Patil', { hr: 78, spo2: 97, pi: 2.8 }),
    bed('bed-02', 'S. Khan', { hr: 84, spo2: 98, pi: 3.1 }),
    // Story: a restless patient. Naive threshold alarms fire; signal quality should hold them.
    bed('bed-03', 'M. Rao', { hr: 76, spo2: 96, pi: 2.2 }, [
      { kind: 'motion', start: 45, duration: 30 },
      { kind: 'motion', start: 400, duration: 20 },
    ]),
    // Story: the finger clip slips off for a minute.
    bed('bed-04', 'A. Deshmukh', { hr: 72, spo2: 96, pi: 2.0 }, [{ kind: 'sensor-off', start: 240, duration: 60 }]),
    // Story: acute hypoxia, the P1 alarm that escalates if nobody responds.
    bed('bed-05', 'G. Wankhede', { hr: 88, spo2: 95, pi: 1.9 }, [
      { kind: 'hypoxia', start: 150, onset: 90, spo2Target: 87, hrDelta: 30 },
    ]),
    // Story: slow deterioration the trend detector should catch before thresholds trip.
    bed('bed-06', 'K. Meshram', { hr: 82, spo2: 96, pi: 2.4 }, [
      { kind: 'deterioration', start: 60, duration: 2400, hrDelta: 44, spo2Delta: -4 },
    ]),
    // Story: a node with a nearly flat battery, for fleet health.
    bed('bed-07', 'P. Gawande', { hr: 69, spo2: 97, pi: 3.0 }, [], { battery: 0.22, drainPerHour: 0.4 }),
    // Story: a weak mesh link that drops packets, for sync and fleet health.
    bed('bed-08', 'N. Bhoyar', { hr: 88, spo2: 95, pi: 2.6 }, [
      { kind: 'packet-loss', start: 300, duration: 180, probability: 0.35 },
    ], { rssi: -84 }),
  ]
}

/** Ticks every bed on one shared clock, one simulated second per tick. */
export function createWardSimulator(beds: BedConfig[], opts: SimOptions): WardSimulator {
  // Each bed gets its own random stream so adding a bed never changes another bed's data.
  const sims = beds.map((cfg, i) => createBedSimulator(cfg, { ...opts, seed: opts.seed * 1000 + i }))
  let simTime = 0

  const tick = (): WardTick => {
    const packets = sims.map((s) => s.next()).filter((p): p is Packet => p !== null)
    return { simTime: simTime++, packets }
  }

  return { tick }
}
