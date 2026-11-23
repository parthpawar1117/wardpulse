import { AlarmBadge } from './AlarmBadge'
import { bedLabel, shiftClock, STATUS_BORDER, STATUS_LABEL, STATUS_TEXT } from './format'
import type { WardSnapshot } from './snapshot'

/**
 * What a doctor sees after tapping the link in a page: the whole ward as it
 * was when the message was sent. Read-only and clearly marked as not live.
 */
export function SnapshotView({ snap }: { snap: WardSnapshot }) {
  const taken = new Date(snap.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const live = `${location.origin}${location.pathname}`

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Ward<span className="text-signal">Pulse</span>
          </h1>
          <span className="text-sm text-dim">{snap.ward} · snapshot</span>
        </div>
        <a href={live} className="rounded-md border border-edge px-3 py-1 text-sm hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal">
          Open live console
        </a>
      </header>

      <p className="rounded-lg border border-watch/50 px-4 py-2 text-sm text-watch">
        Frozen snapshot from a staff alert, taken {taken} (shift {shiftClock(snap.t)}). Not live data. Patient names are not included.
      </p>

      {snap.alarms.length > 0 && (
        <section aria-label="Open alarms" className="flex flex-col gap-2">
          {snap.alarms.map((a) => (
            <div key={a.bed} className={`flex items-center gap-3 rounded-lg border px-4 py-2 ${a.priority === 'P1' ? 'border-2 border-critical' : 'border-edge'}`}>
              <AlarmBadge alarm={{ ...a, paged: [] }} />
              <span className="font-display font-semibold">{bedLabel(a.bed)}</span>
              <span>{a.reason}</span>
              <span className="ml-auto font-mono text-xs text-dim">{a.state}</span>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Beds" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {snap.beds.map((b) => (
          <div key={b.id} className={`flex flex-col gap-2 rounded-lg border bg-panel p-3 ${STATUS_BORDER[b.status]} ${b.status === 'critical' ? 'border-2' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{bedLabel(b.id)}</span>
              <span className={`font-mono text-[10px] uppercase tracking-wider ${STATUS_TEXT[b.status]}`}>{STATUS_LABEL[b.status]}</span>
            </div>
            <div className="flex gap-4 font-display text-2xl font-semibold">
              <span>{b.hr ?? '--'}<span className="ml-1 text-xs font-normal text-dim">bpm</span></span>
              <span>{b.spo2 ?? '--'}<span className="ml-1 text-xs font-normal text-dim">%</span></span>
            </div>
            <div className="font-mono text-[11px] text-dim">
              SQI {b.sqi?.toFixed(2) ?? '–'} · NEWS2* {b.news2 ?? '–'}
            </div>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-2 text-xs text-dim">
        Clinical decision support for evaluation only. Not a medical device. Patients and readings are simulated.
      </footer>
    </main>
  )
}
