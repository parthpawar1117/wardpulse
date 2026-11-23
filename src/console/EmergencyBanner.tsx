import type { Alarm, AuditEntry } from './alarms'
import { bedLabel, shiftClock } from './format'
import type { WardActions } from './useWard'

const elapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** When each role was paged for an alarm, from the audit log. */
function pagedAt(audit: AuditEntry[], alarmId: string) {
  const at = (event: AuditEntry['event']) => audit.findLast((e) => e.alarmId === alarmId && e.event === event)?.t
  return { nurse: at('paged'), doctor: at('escalated') }
}

/**
 * Full-width emergency strip shown above everything else while any P1 alarm
 * is open. Unanswered emergencies pulse; acknowledged ones stay visible but calm.
 */
export function EmergencyBanner({
  alarms,
  audit,
  simTime,
  actions,
  onOpen,
}: {
  alarms: Alarm[]
  audit: AuditEntry[]
  simTime: number
  actions: WardActions
  onOpen: (bed: string) => void
}) {
  const emergencies = alarms.filter((a) => a.priority === 'P1')
  if (!emergencies.length) return null

  return (
    <section aria-label="Emergencies" role="alert" className="flex flex-col gap-2">
      {emergencies.map((a) => {
        const open = a.state !== 'acknowledged'
        const paged = pagedAt(audit, a.id)
        return (
          <div
            key={a.id}
            className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border-2 border-critical px-4 py-3 ${open ? 'bg-critical/15 motion-safe:animate-pulse' : 'bg-panel'}`}
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-critical">Emergency</span>
              <span className="font-display text-xl font-semibold">{bedLabel(a.bed)}</span>
              <span className="text-lg">{a.reason}</span>
              <span className="font-mono text-xs text-dim">for {elapsed(simTime - a.priorityAt)}</span>
            </div>
            <div className="font-mono text-xs text-dim">
              {paged.nurse !== undefined && <span>Nurse paged {shiftClock(paged.nurse)}</span>}
              {paged.doctor !== undefined && <span className="text-critical"> · Doctor paged {shiftClock(paged.doctor)}</span>}
              {!open && <span className="text-ink"> · Acknowledged by {a.ackBy}</span>}
            </div>
            <div className="flex gap-2">
              {open && (
                <button
                  type="button"
                  onClick={() => actions.acknowledge(a.id, 'station')}
                  className="rounded-md bg-critical px-3 py-1.5 text-sm font-semibold text-ground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical"
                >
                  Acknowledge
                </button>
              )}
              {!a.paged.includes('doctor') && (
                <button
                  type="button"
                  onClick={() => actions.escalate(a.id, 'station')}
                  className="rounded-md border border-critical px-3 py-1.5 text-sm text-critical hover:bg-critical/10 focus-visible:outline-2 focus-visible:outline-critical"
                >
                  Call doctor now
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpen(a.bed)}
                className="rounded-md border border-edge px-3 py-1.5 text-sm hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal"
              >
                Details
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
