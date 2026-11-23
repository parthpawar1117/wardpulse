import { bedLabel, STATUS_LABEL, STATUS_TEXT } from './format'
import { STATUS_ORDER, type BedView, type WardState } from './store'

/** Why a bed needs a look, in a few words. */
function reason(bed: BedView): string {
  const a = bed.latest
  if (bed.status === 'offline') return bed.lastSeen < 0 ? 'waiting for node' : 'no packets'
  if (bed.status === 'no-signal') return 'sensor off finger'
  if (bed.status === 'artefact') return 'motion artefact'
  if (bed.status === 'checking') return 'collecting waveform'
  if (!a) return ''
  const parts: string[] = []
  if (a.news2?.redFlag) parts.push(a.news2.spo2 === 3 ? `SpO₂ ${a.spo2}%` : `HR ${a.hr}`)
  if (a.trend.hr.alarm) parts.push('HR rising')
  if (a.trend.spo2.alarm) parts.push('SpO₂ falling')
  if (parts.length === 0 && a.news2) parts.push(`NEWS2* ${a.news2.score}`)
  return parts.join(' · ')
}

/**
 * The one line a nurse reads first: which beds need attention, most urgent
 * first. This block shows status only; acknowledging and escalating alarms
 * arrives with the alarm state machine.
 */
export function AttentionStrip({ state, onOpen }: { state: WardState; onOpen: (id: string) => void }) {
  const beds = state.order.map((id) => state.beds[id])
  const attention = beds
    .filter((b) => b.status !== 'stable')
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
  const stable = beds.length - attention.length

  return (
    <section aria-label="Beds needing attention" className="rounded-lg border border-edge bg-panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-dim">
          {attention.length === 0 ? 'All beds stable' : `${attention.length} need attention · ${stable} stable`}
        </span>
        {attention.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b.id)}
            className="flex items-center gap-2 rounded-md border border-edge px-2.5 py-1 text-sm hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal"
          >
            <span className={`size-2 rounded-full bg-current ${STATUS_TEXT[b.status]}`} aria-hidden="true" />
            <span className="font-mono text-xs">{bedLabel(b.id)}</span>
            <span className={`text-xs ${STATUS_TEXT[b.status]}`}>{STATUS_LABEL[b.status]}</span>
            <span className="text-xs text-dim">{reason(b)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
