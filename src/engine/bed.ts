import type { Packet } from '../schema/packet'
import { news2Subset, type News2Result } from './news2'
import { createSqiTracker, type SqiResult } from './sqi'
import { createTrendDetector, HR_RISE, SPO2_FALL, type TrendState } from './trend'

/** Below this SQI the reported vitals are shown greyed out and kept out of scoring. */
export const TRUST_THRESHOLD = 0.5

/** Everything the console needs to know about one bed after one packet. */
export interface BedAssessment {
  node: string
  seq: number
  ts: number
  /** Vitals as the node reported them, trusted or not. */
  hr: number | null
  spo2: number | null
  sqi: SqiResult
  /** True when the vitals are clean enough to score and alarm on. */
  trusted: boolean
  /** Null when the reading is untrusted or incomplete. */
  news2: News2Result | null
  trend: { hr: TrendState; spo2: TrendState }
  /** Packets lost since the previous one from this node. */
  missed: number
}

export interface BedEngine {
  ingest(packet: Packet): BedAssessment
}

/**
 * One bed's pipeline: signal quality first, then only trusted readings reach
 * the NEWS2 score and the trend detectors. That ordering is the point: a
 * patient moving their hand should neither page a nurse nor skew a baseline.
 */
export function createBedEngine(): BedEngine {
  const sqiTracker = createSqiTracker()
  const hrTrend = createTrendDetector(HR_RISE)
  const spo2Trend = createTrendDetector(SPO2_FALL)
  let lastSeq: number | null = null

  const ingest = (p: Packet): BedAssessment => {
    const missed = lastSeq === null ? 0 : Math.max(0, p.seq - lastSeq - 1)
    lastSeq = p.seq

    const sqi = sqiTracker.push(p)
    const trusted = sqi.sqi >= TRUST_THRESHOLD && p.hr !== null && p.spo2 !== null

    return {
      node: p.node,
      seq: p.seq,
      ts: p.ts,
      hr: p.hr,
      spo2: p.spo2,
      sqi,
      trusted,
      news2: trusted ? news2Subset(p) : null,
      trend: {
        hr: hrTrend.update(trusted ? p.hr : null),
        spo2: spo2Trend.update(trusted ? p.spo2 : null),
      },
      missed,
    }
  }

  return { ingest }
}
