import type { RefObject } from 'react'
import { TRUST_THRESHOLD } from '../engine/bed'
import { bedLabel, STATUS_BORDER, STATUS_LABEL, STATUS_TEXT } from './format'
import type { BedView } from './store'
import type { BatchClock } from './useWard'
import { Waveform } from './Waveform'

function Vital({ label, unit, value, held }: { label: string; unit: string; value: number | null; held: boolean }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className={`font-display text-4xl font-semibold leading-none ${held ? 'text-dim' : ''}`}>
        {value ?? '--'}
        <span className="ml-1 text-xs font-normal text-dim">{unit}</span>
      </div>
    </div>
  )
}

/** One bed in the central-station grid. The whole card opens the detail drawer. */
export function BedCard({ bed, clock, onOpen }: { bed: BedView; clock: RefObject<BatchClock>; onOpen: () => void }) {
  const a = bed.latest
  const held = !a?.trusted
  const sqi = a?.sqi.sqi ?? 0
  const trending = a && (a.trend.hr.alarm || a.trend.spo2.alarm)
  const live = bed.status !== 'offline'

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${bedLabel(bed.id)}, ${bed.patient}: ${STATUS_LABEL[bed.status]}. Open details.`}
      className={`group flex flex-col gap-3 rounded-lg border bg-panel p-4 text-left transition-colors hover:bg-edge/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${STATUS_BORDER[bed.status]} ${bed.status === 'critical' ? 'border-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-xs text-dim">{bedLabel(bed.id)}</div>
          <div className="truncate font-medium">{bed.patient}</div>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider ${STATUS_TEXT[bed.status]}`}>
          <span className={`size-2 rounded-full bg-current ${bed.status === 'critical' ? 'motion-safe:animate-pulse' : ''}`} />
          {STATUS_LABEL[bed.status]}
        </span>
      </div>

      <Waveform wave={live ? bed.wave : []} clock={clock} dimmed={held} className="h-14 text-signal" />

      <div className="grid grid-cols-2 gap-3">
        <Vital label="HR" unit="bpm" value={live ? (a?.hr ?? null) : null} held={held} />
        <Vital label="SpO₂" unit="%" value={live ? (a?.spo2 ?? null) : null} held={held} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-dim">
        <span className="flex items-center gap-1.5" title="Signal quality index">
          SQI
          <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-edge">
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${sqi >= TRUST_THRESHOLD ? 'bg-signal' : 'bg-dim'}`}
              style={{ width: `${Math.round(sqi * 100)}%` }}
            />
          </span>
          {a ? sqi.toFixed(2) : '–'}
        </span>
        <span title="Partial NEWS2: heart rate and SpO2 only">NEWS2* {a?.news2?.score ?? '–'}</span>
        {trending && <span className="text-watch">↗ trend</span>}
        {held && a && live && <span>vitals held</span>}
      </div>
    </button>
  )
}
