import { fleetHealth, type FleetHealth } from './fleet'
import { bedLabel } from './format'
import type { WardState } from './store'

const TONE: Record<FleetHealth['status'], string> = { ok: 'text-stable', warn: 'text-watch', critical: 'text-critical' }

const timeLeft = (m: number | null) => (m === null ? '–' : m >= 24 * 60 ? '> 24 h' : m >= 90 ? `~${Math.round(m / 60)} h` : `~${Math.round(m)} min`)

/** Battery, radio link and packet loss for every node, with what needs doing. */
export function FleetPanel({ state }: { state: WardState }) {
  const rows = state.order.map((id) => fleetHealth(state.beds[id], state.simTime))
  const attention = rows.filter((r) => r.status !== 'ok').length

  return (
    <section aria-label="Fleet health" className="flex min-w-0 flex-col gap-3 rounded-lg border border-edge bg-panel p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-dim">
        Fleet health · {attention === 0 ? 'all nodes OK' : `${attention} ${attention === 1 ? 'node needs' : 'nodes need'} attention`}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="font-mono text-[10px] uppercase tracking-wider text-dim">
            <tr>
              <th className="py-1 pr-3 font-normal">Node</th>
              <th className="py-1 pr-3 font-normal">Battery</th>
              <th className="py-1 pr-3 font-normal">Time left</th>
              <th className="py-1 pr-3 font-normal">Link</th>
              <th className="py-1 pr-3 font-normal">Loss (2 min)</th>
              <th className="py-1 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-edge align-top">
                <td className="py-1.5 pr-3 font-mono text-xs">{bedLabel(r.id)}</td>
                <td className="py-1.5 pr-3">
                  {r.batt === null ? (
                    '–'
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-edge">
                        <span
                          className={`absolute inset-y-0 left-0 rounded-full ${r.batt < 0.1 ? 'bg-critical' : r.batt < 0.25 ? 'bg-watch' : 'bg-signal'}`}
                          style={{ width: `${Math.round(r.batt * 100)}%` }}
                        />
                      </span>
                      <span className="font-mono text-xs">{Math.round(r.batt * 100)}%</span>
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 font-mono text-xs">{timeLeft(r.minutesLeft)}</td>
                <td className="py-1.5 pr-3 font-mono text-xs">
                  {r.rssi === null ? '–' : `${r.rssi} dBm`} <span className="text-dim">{r.signal ?? ''}</span>
                </td>
                <td className="py-1.5 pr-3 font-mono text-xs">{r.lossPct === null ? '–' : `${Math.round(r.lossPct)}%`}</td>
                <td className={`py-1.5 text-xs ${TONE[r.status]}`}>
                  {r.status === 'ok' ? 'OK' : r.issues.join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
