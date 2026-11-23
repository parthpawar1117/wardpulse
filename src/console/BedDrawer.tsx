import { useEffect, useRef, type ReactNode } from 'react'
import type { SqiReason } from '../engine/sqi'
import { HR_RISE, SPO2_FALL } from '../engine/trend'
import { bedLabel, STATUS_LABEL, STATUS_TEXT } from './format'
import type { BedView } from './store'
import { Sparkline } from './Sparkline'

const REASON_TEXT: Record<SqiReason, string> = {
  'insufficient-data': 'Collecting a few seconds of waveform',
  'no-contact': 'No finger on the sensor',
  'no-beats': 'No pulse beats found in the waveform',
  artefact: 'Beats are irregular in shape or timing (likely motion)',
  'implausible-rate': 'Pulse rate outside 30–220 bpm',
  'low-perfusion': 'Pulse amplitude is too weak or too strong to trust',
  'no-waveform': 'Node sent no waveform, so vitals cannot be checked',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-edge pt-4">
      <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-dim">{title}</h3>
      {children}
    </section>
  )
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 text-dim">{label}</span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-edge" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <span className={`absolute inset-y-0 left-0 rounded-full ${pct >= 100 ? 'bg-watch' : 'bg-signal'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`w-20 text-right font-mono text-xs ${pct >= 100 ? 'text-watch' : 'text-dim'}`}>
        {pct >= 100 ? 'alarm' : `${value.toFixed(1)} / ${max}`}
      </span>
    </div>
  )
}

/** Side panel with the reasoning behind a bed's status. */
export function BedDrawer({ bed, onClose }: { bed: BedView; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  const a = bed.latest

  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${bedLabel(bed.id)} details`}
        className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-edge bg-panel p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-xs text-dim">{bedLabel(bed.id)}</div>
            <h2 className="font-display text-xl font-semibold">{bed.patient}</h2>
            <div className={`mt-1 font-mono text-xs uppercase tracking-wider ${STATUS_TEXT[bed.status]}`}>{STATUS_LABEL[bed.status]}</div>
          </div>
          <button ref={close} type="button" onClick={onClose} className="rounded-md border border-edge px-3 py-1 text-sm hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal">
            Close
          </button>
        </div>

        <Section title="Early warning score (partial NEWS2)">
          {a?.news2 ? (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-dim">Heart rate {a.hr} bpm</span><span className="font-mono">{a.news2.hr}</span></div>
              <div className="flex justify-between"><span className="text-dim">SpO₂ {a.spo2}%</span><span className="font-mono">{a.news2.spo2}</span></div>
              <div className="flex justify-between border-t border-edge pt-1 font-medium"><span>Subtotal</span><span className="font-mono">{a.news2.score}</span></div>
              <p className="pt-1 text-xs text-dim">Respiration, blood pressure, temperature, consciousness and oxygen are not measured by this monitor, so this is not a full NEWS2.</p>
            </div>
          ) : (
            <p className="text-sm text-dim">Not scored: the current reading is not trusted.</p>
          )}
        </Section>

        <Section title="Signal quality">
          <div className="mb-2 font-mono text-2xl">{a ? a.sqi.sqi.toFixed(2) : '–'}</div>
          {a && a.sqi.reasons.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-dim">
              {a.sqi.reasons.map((r) => <li key={r}>{REASON_TEXT[r]}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-dim">{a ? 'Clean waveform: beats are regular and alike.' : 'No data yet.'}</p>
          )}
        </Section>

        <Section title="Trend, last 10 minutes">
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm"><span>Heart rate</span><span className="font-mono text-xs text-dim">baseline {a?.trend.hr.baseline?.toFixed(0) ?? 'learning'}</span></div>
              <Sparkline values={bed.hrHistory} baseline={a?.trend.hr.baseline} min={40} max={160} span={20} label="Heart rate trend" className="text-signal" />
              {a && <Meter value={a.trend.hr.cusum} max={HR_RISE.threshold} label="Rise evidence" />}
            </div>
            <div>
              <div className="flex justify-between text-sm"><span>SpO₂</span><span className="font-mono text-xs text-dim">baseline {a?.trend.spo2.baseline?.toFixed(1) ?? 'learning'}</span></div>
              <Sparkline values={bed.spo2History} baseline={a?.trend.spo2.baseline} min={80} max={100} span={4} label="SpO2 trend" className="text-signal" />
              {a && <Meter value={a.trend.spo2.cusum} max={SPO2_FALL.threshold} label="Fall evidence" />}
            </div>
            <p className="text-xs text-dim">Evidence builds when readings stay beyond the patient's own baseline. At full scale the bed moves to Watch.</p>
          </div>
        </Section>

        <Section title="Node">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-dim">Battery</dt><dd className="text-right font-mono">{bed.batt === null ? '–' : `${Math.round(bed.batt * 100)}%`}</dd>
            <dt className="text-dim">Link</dt><dd className="text-right font-mono">{bed.rssi === null ? '–' : `${bed.rssi} dBm`}</dd>
            <dt className="text-dim">Packets lost</dt><dd className="text-right font-mono">{bed.lost}</dd>
          </dl>
        </Section>
      </aside>
    </div>
  )
}
