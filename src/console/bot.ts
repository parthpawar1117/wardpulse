import type { Alarm, StaffMember } from './alarms'
import { bedLabel, shiftClock, STATUS_LABEL } from './format'
import { STATUS_ORDER, type BedStatus, type WardState } from './store'

/**
 * The WardPulse chat bot: what a nurse or doctor gets back when they message
 * the ward number. Pure text in, text out, so the in-app phone and a real
 * WhatsApp webhook can share it unchanged.
 *
 * Only registered staff numbers get an answer, and replies carry bed numbers,
 * never patient names: a chat app is not the place for identifiable records.
 */

export interface BotContext {
  staff: StaffMember[]
  ward: string
  state: WardState
  /** Open alarms, most urgent first. */
  alarms: Alarm[]
  /** Link to a snapshot of the whole ward. */
  link: string
  acknowledge(alarmId: string, actorId: string): boolean
}

const HELP = [
  'WardPulse commands:',
  '• status: the whole ward',
  '• bed 5: one bed in detail',
  '• alarms: open alarms',
  '• ack 5: acknowledge the alarm on bed 5',
].join('\n')

const DOT: Record<BedStatus, string> = {
  critical: '🔴',
  watch: '🟠',
  'no-signal': '🟡',
  artefact: '⚪',
  checking: '⚪',
  offline: '⚪',
  stable: '🟢',
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, '')
const idFor = (n: string) => `bed-${n.padStart(2, '0')}`

function status(ctx: BotContext): string {
  const { state, alarms } = ctx
  const lines = [`${ctx.ward} · ${shiftClock(state.simTime)}`]
  for (const s of STATUS_ORDER) {
    const ids = state.order.filter((id) => state.beds[id].status === s)
    if (!ids.length) continue
    if (s === 'stable') {
      lines.push(`${DOT[s]} ${ids.length} stable`)
      continue
    }
    const beds = ids.map((id) => {
      const a = alarms.find((x) => x.bed === id)
      return a ? `${bedLabel(id)} (${a.reason})` : bedLabel(id)
    })
    lines.push(`${DOT[s]} ${STATUS_LABEL[s]}: ${beds.join(', ')}`)
  }
  lines.push(`Full ward: ${ctx.link}`)
  return lines.join('\n')
}

function describeAlarm(a: Alarm): string {
  const paged = a.paged.length ? ` · paged ${a.paged.join(', ')}` : ''
  const ack = a.state === 'acknowledged' ? `acknowledged by ${a.ackBy}` : a.state === 'snoozed' ? 'snoozed' : 'not acknowledged'
  return `${a.priority} ${a.reason}${paged} · ${ack}`
}

function bedDetail(ctx: BotContext, n: string): string {
  const id = idFor(n)
  const b = ctx.state.beds[id]
  if (!b) return `No Bed ${n.padStart(2, '0')} in ${ctx.ward}.`
  const lines = [`${bedLabel(id)} · ${STATUS_LABEL[b.status]}`]
  const a = b.status !== 'offline' ? b.latest : null
  if (!a) lines.push('No recent data from the node.')
  else if (!a.trusted) lines.push(`Vitals held: signal not trusted (SQI ${a.sqi.sqi.toFixed(2)}).`)
  else lines.push(`HR ${a.hr} bpm · SpO₂ ${a.spo2}% · SQI ${a.sqi.sqi.toFixed(2)} · NEWS2* ${a.news2?.score ?? '–'}`)
  const alarm = ctx.alarms.find((x) => x.bed === id)
  lines.push(alarm ? `Alarm: ${describeAlarm(alarm)}` : 'No open alarm.')
  return lines.join('\n')
}

function ack(ctx: BotContext, n: string, sender: StaffMember): string {
  const id = idFor(n)
  const label = ctx.state.beds[id] ? bedLabel(id) : `Bed ${n.padStart(2, '0')}`
  const alarm = ctx.alarms.find((x) => x.bed === id)
  if (!alarm) return `No open alarm on ${label}.`
  if (alarm.state === 'acknowledged') return `Already acknowledged by ${alarm.ackBy}.`
  if (!ctx.acknowledge(alarm.id, sender.id)) return `Could not acknowledge ${label}. Check the central station.`
  const stop = alarm.priority === 'P1' && !alarm.paged.includes('doctor') ? ' Doctor escalation stopped.' : ''
  return `Acknowledged ${label} (${alarm.reason}) as ${sender.name}.${stop}`
}

function alarmList(ctx: BotContext): string {
  if (!ctx.alarms.length) return `No open alarms in ${ctx.ward}.`
  return ctx.alarms.map((a) => `${a.priority} ${bedLabel(a.bed)} · ${a.reason} · ${a.state}`).join('\n')
}

/** The bot's reply, or null when the sender is not registered staff. */
export function replyTo(fromPhone: string, text: string, ctx: BotContext): string | null {
  const sender = ctx.staff.find((s) => digits(s.phone) === digits(fromPhone))
  if (!sender) return null
  const msg = text.trim().toLowerCase().replace(/\s+/g, ' ')
  let m: RegExpExecArray | null
  if (msg === 'status') return status(ctx)
  if (msg === 'alarms') return alarmList(ctx)
  if ((m = /^bed (\d{1,3})$/.exec(msg))) return bedDetail(ctx, m[1])
  if ((m = /^ack (\d{1,3})$/.exec(msg))) return ack(ctx, m[1], sender)
  if (['help', 'hi', 'hello', 'menu'].includes(msg)) return HELP
  return `Sorry, I didn't get that. Send "help" for commands.`
}
