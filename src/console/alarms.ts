import type { BedAssessment } from '../engine/bed'
import { bedLabel } from './format'
import type { BedStatus } from './store'

/**
 * Alarm state machine for the ward.
 *
 * A bed's status says how it looks right now; an alarm says someone must act.
 * The gap between the two is where alarm fatigue is won or lost, so:
 *
 * - Alarms are raised and cleared only by trusted readings. Motion or a loose
 *   clip pauses an emergency countdown but never advances or clears it.
 * - Only emergencies (P1) leave the screen: the nurse is paged, then the
 *   doctor if nobody acknowledges in time.
 * - Emergencies can be acknowledged, never snoozed. Lower priorities can be
 *   snoozed, but only with a reason.
 * - Every step lands in the audit log.
 *
 * Times are simulation seconds, so the rules run the same at any demo speed.
 */

export type AlarmPriority = 'P1' | 'P2' | 'P3'
export type AlarmKind = 'emergency' | 'deterioration' | 'technical'
export type AlarmState = 'active' | 'acknowledged' | 'snoozed'
export type Role = 'nurse' | 'doctor'

export interface StaffMember {
  id: string
  name: string
  role: Role
  phone: string
}

export interface Alarm {
  id: string
  bed: string
  priority: AlarmPriority
  kind: AlarmKind
  reason: string
  /** When the alarm was first raised. */
  raisedAt: number
  /** When it reached its current priority; escalation counts from here. */
  priorityAt: number
  state: AlarmState
  ackBy: string | null
  ackAt: number | null
  snoozeUntil: number | null
  snoozeReason: string | null
  /** Roles paged for this alarm, in order. */
  paged: Role[]
}

export type AuditEvent =
  | 'raised'
  | 'paged'
  | 'escalated'
  | 'acknowledged'
  | 'snoozed'
  | 'unsnoozed'
  | 'upgraded'
  | 'downgraded'
  | 'resolved'

export interface AuditEntry {
  t: number
  bed: string
  alarmId: string
  event: AuditEvent
  actor: string
  detail: string
}

/** A message for one person's phone. */
export interface Page {
  t: number
  to: StaffMember
  alarmId: string
  bed: string
  kind: 'emergency' | 'escalation' | 'resolved'
  text: string
}

export interface AlarmInput {
  id: string
  status: BedStatus
  latest: Pick<BedAssessment, 'hr' | 'spo2'> & {
    news2: Pick<NonNullable<BedAssessment['news2']>, 'score' | 'hr' | 'spo2' | 'redFlag'> | null
    trend: { hr: { alarm: boolean }; spo2: { alarm: boolean } }
  } | null
}

/** Seconds a trusted state must persist before an alarm is raised. */
export const CONFIRM_SECONDS = 15
/** Seconds an emergency may go unacknowledged before the doctor is paged. */
export const ESCALATE_AFTER = 120
/** Seconds of trusted calmer readings before an alarm steps down or clears. */
export const RESOLVE_SECONDS = 30
/** Seconds a sensor may be off, or a node silent, before a technical alarm. */
export const TECH_AFTER = 30
/** Motion is common and brief, so it gets longer before it counts as a fault. */
export const ARTEFACT_AFTER = 60
/** Seconds of usable signal before a technical alarm clears. */
export const TECH_CLEAR = 10
const AUDIT_LIMIT = 1000

const TRUSTED: BedStatus[] = ['critical', 'watch', 'stable']
const TECH_REASON: Partial<Record<BedStatus, string>> = {
  'no-signal': 'Sensor off finger',
  offline: 'Node offline',
  artefact: 'Signal unusable (motion)',
}
const PRIORITY_RANK: Record<AlarmPriority, number> = { P1: 0, P2: 1, P3: 2 }

/** 'bed-05' → '5', the number staff type when replying. */
export const bedNumber = (id: string) => (/^bed-\d+$/.test(id) ? String(Number(id.slice(4))) : id)

function emergencyReason(latest: AlarmInput['latest']): string {
  if (!latest?.news2) return 'Critical'
  const parts: string[] = []
  if (latest.news2.spo2 === 3) parts.push(`SpO₂ ${latest.spo2}%`)
  if (latest.news2.hr === 3) parts.push(`HR ${latest.hr} bpm`)
  return parts.length ? parts.join(' · ') : `NEWS2* ${latest.news2.score}`
}

function deteriorationReason(latest: AlarmInput['latest']): string {
  const parts: string[] = []
  if (latest?.trend.hr.alarm) parts.push('HR rising')
  if (latest?.trend.spo2.alarm) parts.push('SpO₂ falling')
  return parts.length ? parts.join(' · ') : `NEWS2* ${latest?.news2?.score ?? '–'}`
}

interface Tracker {
  /** Trusted critical readings in a row; untrusted readings pause it. */
  critical: number
  watch: number
  /** Trusted non-critical readings in a row. */
  calmer: number
  /** Trusted stable readings in a row. */
  stable: number
  tech: number
  techStatus: BedStatus | null
  usable: number
  alarm: Alarm | null
}

export interface AlarmEngine {
  /** Call once per simulated second with every bed. Returns pages to send. */
  update(t: number, beds: AlarmInput[]): Page[]
  acknowledge(alarmId: string, actorId: string, t: number): boolean
  snooze(alarmId: string, actorId: string, reason: string, seconds: number, t: number): boolean
  /** Pages the doctor now, whatever the timer says. */
  escalate(alarmId: string, actorId: string, t: number): Page[]
  /** Open alarms, most urgent first. */
  alarms(): Alarm[]
  audit(): AuditEntry[]
  reset(): void
}

export function createAlarmEngine(staff: StaffMember[], ward: string): AlarmEngine {
  let trackers = new Map<string, Tracker>()
  let log: AuditEntry[] = []
  let counter = 0

  const actorName = (id: string) => staff.find((s) => s.id === id)?.name ?? 'Central station'
  const record = (t: number, a: Alarm, event: AuditEvent, actor: string, detail = a.reason) => {
    log = [...log, { t, bed: a.bed, alarmId: a.id, event, actor, detail }].slice(-AUDIT_LIMIT)
  }
  const find = (id: string) => [...trackers.values()].find((tr) => tr.alarm?.id === id)?.alarm ?? null

  const page = (t: number, a: Alarm, role: Role, kind: Page['kind'], text: string): Page[] =>
    staff.filter((s) => s.role === role).map((to) => ({ t, to, alarmId: a.id, bed: a.bed, kind, text }))

  const label = (a: Alarm) => bedLabel(a.bed)
  const replyHint = (a: Alarm) => `Reply "ack ${bedNumber(a.bed)}" to respond, "status" for the ward.`

  const pageNurses = (t: number, a: Alarm): Page[] => {
    a.paged = ['nurse']
    record(t, a, 'paged', 'WardPulse', 'Nurse paged')
    return page(t, a, 'nurse', 'emergency', `🚨 EMERGENCY · ${label(a)} · ${a.reason}\nWardPulse ${ward}. ${replyHint(a)}`)
  }

  const pageDoctors = (t: number, a: Alarm, why: string, actor: string): Page[] => {
    if (a.paged.includes('doctor')) return []
    a.paged = [...a.paged, 'doctor']
    record(t, a, 'escalated', actor, why)
    return page(t, a, 'doctor', 'escalation', `🚨 ESCALATED · ${label(a)} · ${a.reason}\n${why}. WardPulse ${ward}. ${replyHint(a)}`)
  }

  const tellPaged = (t: number, a: Alarm, text: string): Page[] => a.paged.flatMap((role) => page(t, a, role, 'resolved', text))

  const raise = (t: number, bed: string, priority: AlarmPriority, kind: AlarmKind, reason: string): Alarm => {
    const a: Alarm = {
      id: `A${++counter}`,
      bed,
      priority,
      kind,
      reason,
      raisedAt: t,
      priorityAt: t,
      state: 'active',
      ackBy: null,
      ackAt: null,
      snoozeUntil: null,
      snoozeReason: null,
      paged: [],
    }
    record(t, a, 'raised', 'WardPulse', `${priority} ${reason}`)
    return a
  }

  /** Moves an alarm to a new priority; a step up is a new situation, so earlier acks and snoozes no longer apply. */
  const reprioritise = (t: number, a: Alarm, priority: AlarmPriority, kind: AlarmKind, reason: string) => {
    const up = PRIORITY_RANK[priority] < PRIORITY_RANK[a.priority]
    Object.assign(a, { priority, kind, reason, priorityAt: t })
    if (up) Object.assign(a, { state: 'active', ackBy: null, ackAt: null, snoozeUntil: null, snoozeReason: null, paged: [] })
    record(t, a, up ? 'upgraded' : 'downgraded', 'WardPulse', `${priority} ${reason}`)
  }

  const step = (t: number, { id, status, latest }: AlarmInput): Page[] => {
    let tr = trackers.get(id)
    if (!tr) {
      tr = { critical: 0, watch: 0, calmer: 0, stable: 0, tech: 0, techStatus: null, usable: 0, alarm: null }
      trackers.set(id, tr)
    }
    const trusted = TRUSTED.includes(status)
    // Trusted readings move the counters; untrusted ones leave them where they were.
    if (trusted) {
      tr.critical = status === 'critical' ? tr.critical + 1 : 0
      tr.watch = status === 'watch' ? tr.watch + 1 : 0
      tr.calmer = status !== 'critical' ? tr.calmer + 1 : 0
      tr.stable = status === 'stable' ? tr.stable + 1 : 0
    }
    const techReason = TECH_REASON[status]
    tr.tech = techReason ? (tr.techStatus === status ? tr.tech + 1 : 1) : 0
    tr.techStatus = techReason ? status : null
    tr.usable = techReason ? 0 : tr.usable + 1

    const pages: Page[] = []
    let a = tr.alarm

    if (a?.state === 'snoozed' && a.snoozeUntil !== null && t >= a.snoozeUntil) {
      Object.assign(a, { state: 'active', snoozeUntil: null, snoozeReason: null })
      record(t, a, 'unsnoozed', 'WardPulse', 'Snooze ended')
    }

    // Raise or step up.
    if (tr.critical >= CONFIRM_SECONDS && a?.priority !== 'P1') {
      const reason = emergencyReason(latest)
      if (a) reprioritise(t, a, 'P1', 'emergency', reason)
      else a = tr.alarm = raise(t, id, 'P1', 'emergency', reason)
      pages.push(...pageNurses(t, a))
    } else if (tr.watch >= CONFIRM_SECONDS && (!a || a.priority === 'P3')) {
      const reason = deteriorationReason(latest)
      if (a) reprioritise(t, a, 'P2', 'deterioration', reason)
      else a = tr.alarm = raise(t, id, 'P2', 'deterioration', reason)
    } else if (!a && techReason && tr.tech >= (status === 'artefact' ? ARTEFACT_AFTER : TECH_AFTER)) {
      a = tr.alarm = raise(t, id, 'P3', 'technical', techReason)
    }
    if (!a) return pages

    // Keep the reason current while readings support it.
    if (a.priority === 'P1' && status === 'critical') a.reason = emergencyReason(latest)
    if (a.priority === 'P2' && status === 'watch') a.reason = deteriorationReason(latest)

    // Escalate an emergency nobody has answered.
    if (a.priority === 'P1' && a.state === 'active' && t - a.priorityAt >= ESCALATE_AFTER) {
      pages.push(...pageDoctors(t, a, `No response for ${ESCALATE_AFTER / 60} min`, 'WardPulse'))
    }

    // Step down or clear.
    const clear = (detail: string) => {
      record(t, a, 'resolved', 'WardPulse', detail)
      pages.push(...tellPaged(t, a, `✅ ${label(a)} · ${detail}. WardPulse ${ward}.`))
      tr.alarm = null
    }
    if (a.priority === 'P1' && tr.calmer >= RESOLVE_SECONDS) {
      if (status === 'watch') {
        reprioritise(t, a, 'P2', 'deterioration', deteriorationReason(latest))
        pages.push(...tellPaged(t, a, `⬇️ ${label(a)} · no longer critical, still on Watch. WardPulse ${ward}.`))
      } else if (status === 'stable') clear('back to stable')
    } else if (a.priority === 'P2' && tr.stable >= RESOLVE_SECONDS) {
      clear('back to stable')
    } else if (a.priority === 'P3' && tr.usable >= TECH_CLEAR) {
      clear('signal restored')
    }
    return pages
  }

  return {
    update: (t, beds) => beds.flatMap((b) => step(t, b)),

    acknowledge(alarmId, actorId, t) {
      const a = find(alarmId)
      if (!a || a.state === 'acknowledged') return false
      Object.assign(a, { state: 'acknowledged', ackBy: actorName(actorId), ackAt: t, snoozeUntil: null, snoozeReason: null })
      record(t, a, 'acknowledged', a.ackBy!)
      return true
    },

    snooze(alarmId, actorId, reason, seconds, t) {
      const a = find(alarmId)
      const why = reason.trim()
      if (!a || a.priority === 'P1' || !why || seconds <= 0) return false
      Object.assign(a, { state: 'snoozed', snoozeUntil: t + seconds, snoozeReason: why })
      record(t, a, 'snoozed', actorName(actorId), `${Math.round(seconds / 60)} min: ${why}`)
      return true
    },

    escalate(alarmId, actorId, t) {
      const a = find(alarmId)
      if (!a) return []
      return pageDoctors(t, a, `Escalated by ${actorName(actorId)}`, actorName(actorId))
    },

    alarms: () =>
      [...trackers.values()]
        .flatMap((tr) => (tr.alarm ? [{ ...tr.alarm }] : []))
        .sort((x, y) => PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority] || x.raisedAt - y.raisedAt),

    audit: () => log,

    reset() {
      trackers = new Map()
      log = []
      counter = 0
    },
  }
}
