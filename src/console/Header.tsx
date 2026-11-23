import { shiftClock } from './format'
import { SPEEDS, type Speed } from './useWard'

export function Header({
  simTime,
  speed,
  onSpeed,
  paused,
  onTogglePause,
  rejected,
  sound,
  onToggleSound,
  pages,
  onPhones,
}: {
  simTime: number
  speed: Speed
  onSpeed: (s: Speed) => void
  paused: boolean
  onTogglePause: () => void
  rejected: number
  sound: boolean
  onToggleSound: () => void
  /** Pages sent to staff phones this shift. */
  pages: number
  onPhones: () => void
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Ward<span className="text-signal">Pulse</span>
        </h1>
        <span className="text-sm text-dim">Ward A · central station</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded border border-watch/50 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-watch">
          Simulated data
        </span>
        <span className="font-mono text-sm" title="Time since the shift started (simulated)">
          <span className="text-dim">shift </span>
          {shiftClock(simTime)}
        </span>
        {rejected > 0 && (
          <span className="font-mono text-[11px] text-dim" title="Packets that failed validation">
            {rejected} rejected
          </span>
        )}
        <div role="group" aria-label="Simulation speed" className="flex overflow-hidden rounded-md border border-edge">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeed(s)}
              aria-pressed={speed === s}
              className={`px-2.5 py-1 font-mono text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal ${speed === s ? 'bg-signal text-ground' : 'text-dim hover:bg-edge/50'}`}
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onTogglePause}
          className="rounded-md border border-edge px-3 py-1 text-sm hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={onToggleSound}
          aria-pressed={sound}
          title="Alarm sound for unanswered emergencies"
          className="rounded-md border border-edge px-3 py-1 text-sm hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal"
        >
          {sound ? 'Sound on' : 'Sound off'}
        </button>
        <button
          type="button"
          onClick={onPhones}
          className="flex items-center gap-2 rounded-md border border-edge px-3 py-1 text-sm hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal"
        >
          Staff phones
          {pages > 0 && <span className="rounded-full bg-critical px-1.5 font-mono text-[10px] font-bold text-ground">{pages}</span>}
        </button>
      </div>
    </header>
  )
}
