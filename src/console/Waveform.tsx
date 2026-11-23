import { useEffect, useRef, type RefObject } from 'react'
import { SAMPLE_RATE } from '../sim/ppg'
import { WAVE_SAMPLES } from './store'
import type { BatchClock } from './useWard'

/** Seconds on screen. One extra second is buffered so the trace can scroll smoothly into it. */
const VISIBLE = WAVE_SAMPLES - SAMPLE_RATE

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Scrolling PPG trace on a canvas. The sensor reports absorption, so beats are
 * dips in the raw signal; the trace is inverted so they read as peaks, the way
 * clinicians expect. NaN samples (lost packets) are drawn as breaks.
 */
export function Waveform({
  wave,
  clock,
  dimmed,
  className = '',
}: {
  wave: number[]
  clock: RefObject<BatchClock>
  dimmed: boolean
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // The draw loop reads the latest samples through a ref so it never restarts on new data.
  const data = useRef(wave)
  useEffect(() => {
    data.current = wave
  }, [wave])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const w = el.clientWidth
      const h = el.clientHeight
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr)
        el.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const samples = data.current
      if (samples.length < 2) return

      // How far into the next second we are, so the trace glides instead of jumping once a second.
      const { lastBatchAt, periodMs } = clock.current
      const frac = reducedMotion() ? 1 : Math.min(1, Math.max(0, (performance.now() - lastBatchAt) / periodMs))
      const end = samples.length - SAMPLE_RATE + frac * SAMPLE_RATE
      const start = end - VISIBLE

      let lo = Infinity
      let hi = -Infinity
      for (let i = Math.max(0, Math.floor(start)); i < Math.min(samples.length, Math.ceil(end)); i++) {
        const v = samples[i]
        if (Number.isNaN(v)) continue
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      if (!Number.isFinite(lo)) return
      const span = hi - lo || 1
      const pad = 4

      ctx.strokeStyle = getComputedStyle(el).color
      ctx.lineWidth = 1.75
      ctx.lineJoin = 'round'
      ctx.globalAlpha = dimmed ? 0.45 : 1
      ctx.beginPath()
      let pen = false
      for (let i = Math.max(0, Math.floor(start)); i < Math.min(samples.length, Math.ceil(end) + 1); i++) {
        const v = samples[i]
        if (Number.isNaN(v)) {
          pen = false
          continue
        }
        const x = ((i - start) / VISIBLE) * w
        // Inverted: lower raw value (more absorption) is drawn higher.
        const y = pad + ((v - lo) / span) * (h - 2 * pad)
        if (pen) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
        pen = true
      }
      ctx.stroke()
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [clock, dimmed])

  return <canvas ref={canvas} className={`block w-full ${className}`} aria-hidden="true" />
}
