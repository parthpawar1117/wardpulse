import { describe, expect, it } from 'vitest'
import {
  ARTEFACT_AFTER,
  CONFIRM_SECONDS,
  createAlarmEngine,
  ESCALATE_AFTER,
  RESOLVE_SECONDS,
  TECH_AFTER,
  type AlarmInput,
  type Page,
  type StaffMember,
} from './alarms'
import type { BedStatus } from './store'

const STAFF: StaffMember[] = [
  { id: 'n1', name: 'Nurse Kulkarni', role: 'nurse', phone: '+91 00000 00001' },
  { id: 'd1', name: 'Dr Mehta', role: 'doctor', phone: '+91 00000 00002' },
]

const calm = { hr: { alarm: false }, spo2: { alarm: false } }
const READINGS: Record<BedStatus, AlarmInput['latest']> = {
  critical: { hr: 118, spo2: 87, news2: { score: 5, hr: 2, spo2: 3, redFlag: true }, trend: calm },
  watch: { hr: 104, spo2: 95, news2: { score: 1, hr: 1, spo2: 0, redFlag: false }, trend: { hr: { alarm: true }, spo2: { alarm: false } } },
  stable: { hr: 80, spo2: 97, news2: { score: 0, hr: 0, spo2: 0, redFlag: false }, trend: calm },
  artefact: { hr: 150, spo2: 84, news2: null, trend: calm },
  'no-signal': null,
  checking: null,
  offline: null,
}

/** Drives one bed through a sequence of statuses, one per simulated second. */
function ward() {
  const engine = createAlarmEngine(STAFF, 'Ward A')
  let t = 0
  const pages: Page[] = []
  const feed = (status: BedStatus, seconds: number, id = 'bed-05') => {
    for (let i = 0; i < seconds; i++) pages.push(...engine.update(t++, [{ id, status, latest: READINGS[status] }]))
  }
  return { engine, feed, pages, now: () => t }
}

describe('alarm engine', () => {
  it('stays quiet while beds are stable', () => {
    const w = ward()
    w.feed('stable', 600)
    expect(w.engine.alarms()).toEqual([])
    expect(w.pages).toEqual([])
  })

  it('raises an emergency only once critical has persisted, and pages the nurse', () => {
    const w = ward()
    w.feed('critical', CONFIRM_SECONDS - 1)
    expect(w.engine.alarms()).toEqual([])
    w.feed('critical', 1)
    const [alarm] = w.engine.alarms()
    expect(alarm).toMatchObject({ bed: 'bed-05', priority: 'P1', kind: 'emergency', state: 'active', reason: 'SpO₂ 87%' })
    expect(w.pages).toHaveLength(1)
    expect(w.pages[0].to.id).toBe('n1')
    expect(w.pages[0].text).toContain('EMERGENCY')
    expect(w.pages[0].text).toContain('Bed 05')
    expect(w.pages[0].text).toContain('ack 5')
  })

  it('never raises an emergency from untrusted readings', () => {
    const w = ward()
    w.feed('artefact', 600)
    expect(w.engine.alarms().filter((a) => a.priority === 'P1')).toEqual([])
  })

  it('pauses the countdown on untrusted readings and restarts it on a trusted calm one', () => {
    const paused = ward()
    paused.feed('critical', 10)
    paused.feed('artefact', 5)
    paused.feed('critical', CONFIRM_SECONDS - 10)
    expect(paused.engine.alarms()).toHaveLength(1)

    const reset = ward()
    reset.feed('critical', 10)
    reset.feed('stable', 1)
    reset.feed('critical', CONFIRM_SECONDS - 1)
    expect(reset.engine.alarms()).toEqual([])
  })

  it('escalates to the doctor once if nobody acknowledges', () => {
    const w = ward()
    w.feed('critical', CONFIRM_SECONDS)
    w.feed('critical', ESCALATE_AFTER - 1)
    expect(w.pages.map((p) => p.to.id)).toEqual(['n1'])
    w.feed('critical', 1)
    expect(w.pages.map((p) => p.to.id)).toEqual(['n1', 'd1'])
    expect(w.pages[1].kind).toBe('escalation')
    w.feed('critical', 600)
    expect(w.pages).toHaveLength(2)
    expect(w.engine.alarms()[0].paged).toEqual(['nurse', 'doctor'])
  })

  it('stops escalation on acknowledgement and records who responded', () => {
    const w = ward()
    w.feed('critical', CONFIRM_SECONDS)
    const [alarm] = w.engine.alarms()
    expect(w.engine.acknowledge(alarm.id, 'n1', w.now())).toBe(true)
    w.feed('critical', ESCALATE_AFTER * 2)
    expect(w.pages).toHaveLength(1)
    expect(w.engine.alarms()[0]).toMatchObject({ state: 'acknowledged', ackBy: 'Nurse Kulkarni' })
    expect(w.engine.audit().map((e) => e.event)).toEqual(['raised', 'paged', 'acknowledged'])
    expect(w.engine.acknowledge(alarm.id, 'n1', w.now())).toBe(false)
  })

  it('escalates on request, straight away', () => {
    const w = ward()
    w.feed('critical', CONFIRM_SECONDS)
    const pages = w.engine.escalate(w.engine.alarms()[0].id, 'station', w.now())
    expect(pages.map((p) => p.to.id)).toEqual(['d1'])
    expect(pages[0].text).toContain('Central station')
    expect(w.engine.audit().at(-1)).toMatchObject({ event: 'escalated', actor: 'Central station' })
  })

  it('refuses to snooze an emergency', () => {
    const w = ward()
    w.feed('critical', CONFIRM_SECONDS)
    expect(w.engine.snooze(w.engine.alarms()[0].id, 'n1', 'busy', 300, w.now())).toBe(false)
  })

  it('raises deterioration on persistent watch without paging anyone', () => {
    const w = ward()
    w.feed('watch', CONFIRM_SECONDS)
    expect(w.engine.alarms()[0]).toMatchObject({ priority: 'P2', kind: 'deterioration', reason: 'HR rising' })
    expect(w.pages).toEqual([])
  })

  it('needs a reason to snooze, and the alarm returns when the snooze ends', () => {
    const w = ward()
    w.feed('watch', CONFIRM_SECONDS)
    const id = w.engine.alarms()[0].id
    expect(w.engine.snooze(id, 'n1', '   ', 300, w.now())).toBe(false)
    expect(w.engine.snooze(id, 'n1', 'Post-op, reviewed by Dr Mehta', 300, w.now())).toBe(true)
    expect(w.engine.alarms()[0]).toMatchObject({ state: 'snoozed', snoozeReason: 'Post-op, reviewed by Dr Mehta' })
    w.feed('watch', 299)
    expect(w.engine.alarms()[0].state).toBe('snoozed')
    w.feed('watch', 1)
    expect(w.engine.alarms()[0].state).toBe('active')
    expect(w.engine.audit().map((e) => e.event)).toContain('unsnoozed')
  })

  it('resolves an emergency after trusted calm readings and tells whoever was paged', () => {
    const w = ward()
    w.feed('critical', CONFIRM_SECONDS)
    w.feed('stable', RESOLVE_SECONDS - 1)
    expect(w.engine.alarms()).toHaveLength(1)
    w.feed('stable', 1)
    expect(w.engine.alarms()).toEqual([])
    expect(w.pages.at(-1)).toMatchObject({ kind: 'resolved' })
    expect(w.pages.at(-1)!.to.id).toBe('n1')
    expect(w.engine.audit().at(-1)!.event).toBe('resolved')
  })

  it('keeps an emergency open while the signal is untrusted', () => {
    const w = ward()
    w.feed('critical', CONFIRM_SECONDS)
    w.feed('artefact', 300)
    expect(w.engine.alarms()[0].priority).toBe('P1')
  })

  it('downgrades an emergency to deterioration when the bed settles on watch', () => {
    const w = ward()
    w.feed('critical', CONFIRM_SECONDS)
    w.feed('watch', RESOLVE_SECONDS)
    expect(w.engine.alarms()[0]).toMatchObject({ priority: 'P2', kind: 'deterioration' })
    expect(w.engine.audit().map((e) => e.event)).toContain('downgraded')
  })

  it('upgrades deterioration to an emergency, pages, and clears an earlier snooze', () => {
    const w = ward()
    w.feed('watch', CONFIRM_SECONDS)
    const id = w.engine.alarms()[0].id
    w.engine.snooze(id, 'n1', 'Known tachycardia', 3600, w.now())
    w.feed('critical', CONFIRM_SECONDS)
    expect(w.engine.alarms()[0]).toMatchObject({ id, priority: 'P1', state: 'active', snoozeUntil: null })
    expect(w.pages).toHaveLength(1)
    expect(w.engine.audit().map((e) => e.event)).toContain('upgraded')
  })

  it('raises a technical alarm for a sensor that stays off, and clears it when contact returns', () => {
    const w = ward()
    w.feed('no-signal', TECH_AFTER - 1)
    expect(w.engine.alarms()).toEqual([])
    w.feed('no-signal', 1)
    expect(w.engine.alarms()[0]).toMatchObject({ priority: 'P3', kind: 'technical', reason: 'Sensor off finger' })
    w.feed('stable', 10)
    expect(w.engine.alarms()).toEqual([])
    expect(w.pages).toEqual([])
  })

  it('tolerates short bursts of motion before calling the signal unusable', () => {
    const w = ward()
    w.feed('artefact', ARTEFACT_AFTER - 1)
    expect(w.engine.alarms()).toEqual([])
    w.feed('artefact', 1)
    expect(w.engine.alarms()[0].reason).toBe('Signal unusable (motion)')
  })

  it('lists emergencies first', () => {
    const engine = createAlarmEngine(STAFF, 'Ward A')
    for (let t = 0; t < 60; t++) {
      engine.update(t, [
        { id: 'bed-07', status: 'offline', latest: null },
        { id: 'bed-06', status: 'watch', latest: READINGS.watch },
        { id: 'bed-05', status: 'critical', latest: READINGS.critical },
      ])
    }
    expect(engine.alarms().map((a) => a.priority)).toEqual(['P1', 'P2', 'P3'])
  })
})
