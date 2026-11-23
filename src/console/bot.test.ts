import { describe, expect, it, vi } from 'vitest'
import type { Alarm, StaffMember } from './alarms'
import { replyTo, type BotContext } from './bot'
import type { BedView, WardState } from './store'

const STAFF: StaffMember[] = [
  { id: 'n1', name: 'Nurse Kulkarni', role: 'nurse', phone: '+91 00000 00001' },
  { id: 'd1', name: 'Dr Mehta', role: 'doctor', phone: '+91 00000 00002' },
]

function bed(id: string, patient: string, status: BedView['status'], trusted = true): BedView {
  return {
    id,
    patient,
    status,
    latest: { trusted, hr: 118, spo2: 87, sqi: { sqi: trusted ? 0.93 : 0.2 }, news2: trusted ? { score: 5 } : null } as BedView['latest'],
    wave: [],
    hrHistory: [],
    spo2History: [],
    lastSeen: 100,
    lost: 0,
    batt: 0.9,
    rssi: -60,
  }
}

const STATE: WardState = {
  simTime: 754,
  order: ['bed-01', 'bed-03', 'bed-05', 'bed-07'],
  beds: {
    'bed-01': bed('bed-01', 'R. Patil', 'stable'),
    'bed-03': bed('bed-03', 'M. Rao', 'artefact', false),
    'bed-05': bed('bed-05', 'G. Wankhede', 'critical'),
    'bed-07': bed('bed-07', 'P. Gawande', 'offline'),
  },
  rejected: 0,
  alarms: [],
  audit: [],
  messages: [],
}

const ALARM = {
  id: 'A1',
  bed: 'bed-05',
  priority: 'P1',
  kind: 'emergency',
  reason: 'SpO₂ 87%',
  state: 'active',
  ackBy: null,
  paged: ['nurse'],
} as Alarm

function ctx(alarms: Alarm[] = [ALARM]): BotContext {
  return {
    staff: STAFF,
    ward: 'Ward A',
    state: STATE,
    alarms,
    link: 'https://example.org/#snap=abc',
    acknowledge: vi.fn(() => true),
  }
}

const NURSE = '+91 00000 00001'

describe('WardPulse bot', () => {
  it('ignores numbers that are not registered staff', () => {
    expect(replyTo('+91 99999 99999', 'status', ctx())).toBeNull()
  })

  it('matches registered numbers however they are spaced', () => {
    expect(replyTo('+910000000001', 'help', ctx())).toContain('status')
  })

  it('summarises the ward on "status", most urgent first, with the full-ward link', () => {
    const reply = replyTo(NURSE, '  Status ', ctx())!
    expect(reply).toContain('Ward A · 00:12:34')
    expect(reply.indexOf('Bed 05')).toBeLessThan(reply.indexOf('Bed 03'))
    expect(reply).toContain('Critical: Bed 05 (SpO₂ 87%)')
    expect(reply).toContain('1 stable')
    expect(reply).toContain('https://example.org/#snap=abc')
  })

  it('gives one bed in detail', () => {
    const reply = replyTo(NURSE, 'bed 5', ctx())!
    expect(reply).toContain('Bed 05 · Critical')
    expect(reply).toContain('HR 118 bpm')
    expect(reply).toContain('SpO₂ 87%')
    expect(reply).toContain('P1 SpO₂ 87%')
    expect(reply).toContain('not acknowledged')
  })

  it('holds untrusted vitals back instead of quoting them', () => {
    const reply = replyTo(NURSE, 'bed 3', ctx())!
    expect(reply).not.toContain('118')
    expect(reply).toContain('held')
  })

  it('says so when a bed does not exist', () => {
    expect(replyTo(NURSE, 'bed 12', ctx())).toContain('No Bed 12')
  })

  it('acknowledges an alarm from the phone as the sender', () => {
    const c = ctx()
    const reply = replyTo(NURSE, 'ACK 5', c)!
    expect(c.acknowledge).toHaveBeenCalledWith('A1', 'n1')
    expect(reply).toContain('Acknowledged Bed 05')
  })

  it('explains when there is nothing to acknowledge', () => {
    expect(replyTo(NURSE, 'ack 1', ctx())).toContain('No open alarm on Bed 01')
    const done = { ...ALARM, state: 'acknowledged', ackBy: 'Dr Mehta' } as Alarm
    expect(replyTo(NURSE, 'ack 5', ctx([done]))).toContain('Already acknowledged by Dr Mehta')
  })

  it('lists open alarms', () => {
    expect(replyTo(NURSE, 'alarms', ctx())).toContain('P1 Bed 05 · SpO₂ 87%')
    expect(replyTo(NURSE, 'alarms', ctx([]))).toContain('No open alarms')
  })

  it('points to help when it does not understand', () => {
    expect(replyTo(NURSE, 'what is happening', ctx())).toContain('help')
  })

  it('never sends patient names', () => {
    for (const text of ['status', 'bed 5', 'bed 3', 'alarms', 'ack 5', 'help']) {
      const reply = replyTo(NURSE, text, ctx())!
      for (const name of ['Patil', 'Rao', 'Wankhede', 'Gawande']) expect(reply).not.toContain(name)
    }
  })
})
