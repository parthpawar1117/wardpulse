import type { AuditEntry } from './alarms'
import { bedLabel, shiftClock } from './format'

/** The ward's alarm audit trail, newest first: who was told what, and who responded. */
export function AuditLog({ audit }: { audit: AuditEntry[] }) {
  return (
    <details className="rounded-lg border border-edge bg-panel px-4 py-3">
      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-dim">
        Alarm audit log · {audit.length} {audit.length === 1 ? 'entry' : 'entries'}
      </summary>
      {audit.length === 0 ? (
        <p className="mt-3 text-sm text-dim">Nothing yet. Every alarm, page, acknowledgement and snooze is recorded here.</p>
      ) : (
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-panel text-dim">
              <tr>
                <th className="py-1 pr-3 font-normal">Time</th>
                <th className="py-1 pr-3 font-normal">Bed</th>
                <th className="py-1 pr-3 font-normal">Event</th>
                <th className="py-1 pr-3 font-normal">By</th>
                <th className="py-1 font-normal">Detail</th>
              </tr>
            </thead>
            <tbody>
              {[...audit].reverse().slice(0, 200).map((e, i) => (
                <tr key={i} className="border-t border-edge">
                  <td className="py-1 pr-3 font-mono text-dim">{shiftClock(e.t)}</td>
                  <td className="py-1 pr-3 font-mono">{bedLabel(e.bed)}</td>
                  <td className="py-1 pr-3">{e.event}</td>
                  <td className="py-1 pr-3 text-dim">{e.actor}</td>
                  <td className="py-1">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}
