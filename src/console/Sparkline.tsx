/**
 * Small SVG trend line. Nulls (untrusted readings) break the line rather than
 * being drawn as zero, and an optional dashed line marks the patient's baseline.
 */
export function Sparkline({
  values,
  baseline,
  min,
  max,
  label,
  className = '',
}: {
  values: (number | null)[]
  baseline?: number | null
  min: number
  max: number
  label: string
  className?: string
}) {
  const W = 300
  const H = 64
  const y = (v: number) => H - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * H
  const x = (i: number) => (values.length < 2 ? 0 : (i / (values.length - 1)) * W)

  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`h-16 w-full ${className}`} role="img" aria-label={label}>
      {baseline != null && (
        <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} className="stroke-dim" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
