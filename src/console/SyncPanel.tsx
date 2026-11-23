import type { SyncState } from '../sync/useSync'

function Stat({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className={`font-display text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

const ago = (at: number | null) => {
  if (at === null) return 'never'
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  return s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`
}

/**
 * The ward's link to the district server, with a switch to cut it. Cutting
 * it shows the point of the design: monitoring, alarms and phones carry on,
 * readings pile up safely, and they drain without duplicates when it returns.
 */
export function SyncPanel({ sync }: { sync: SyncState }) {
  const { stats, server, online, setOnline } = sync
  const up = stats.online
  return (
    <section aria-label="Uplink" className="flex flex-col gap-4 rounded-lg border border-edge bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-dim">Uplink to district server (simulated)</h2>
          <div className={`mt-1 flex items-center gap-2 font-medium ${up ? 'text-stable' : 'text-watch'}`}>
            <span className={`size-2 rounded-full bg-current ${stats.syncing ? 'motion-safe:animate-pulse' : ''}`} aria-hidden="true" />
            {up ? (stats.queued > 0 ? 'Online · catching up' : 'Online · in sync') : online ? 'Browser offline' : 'Network pulled'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOnline(!online)}
          aria-pressed={!online}
          className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${online ? 'border border-watch text-watch hover:bg-watch/10' : 'bg-signal text-ground hover:opacity-90'}`}
        >
          {online ? 'Pull the network' : 'Restore network'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Queued on ward" value={stats.queued} tone={stats.queued > 0 && !up ? 'text-watch' : ''} />
        <Stat label="Delivered" value={stats.sent} />
        <Stat label="Duplicates refused" value={stats.duplicates} />
        <Stat label="Server holds" value={server.stored} />
      </div>

      <p className="font-mono text-[11px] text-dim">
        Last sync {ago(stats.lastSyncAt)} · {stats.failures} failed or unacknowledged batches retried
      </p>
      <p className="text-xs text-dim">
        Monitoring, alarms and staff phones run on the ward network and do not need the internet. Readings wait in this
        browser&apos;s storage (IndexedDB) and upload when the link returns. A batch is deleted only after the server confirms
        it; if a confirmation is lost the batch is resent, and the server recognises each reading by its key and stores it once.
      </p>
    </section>
  )
}
