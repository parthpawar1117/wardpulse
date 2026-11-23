/**
 * The heart-rate and SpO2 parts of NEWS2 (Royal College of Physicians, 2017).
 * Full NEWS2 also scores respiration rate, blood pressure, temperature,
 * consciousness and supplemental oxygen, which a PPG finger clip cannot
 * measure, so every result here is marked partial.
 */

export type News2Band = 'low' | 'low-medium' | 'medium'

export interface News2Result {
  score: number
  hr: number
  spo2: number
  /** Low: 0–4. Low-medium: any single parameter scoring 3. Medium: 5 or more. */
  band: News2Band
  /** True when one parameter alone scores 3, which NEWS2 treats as an urgent review trigger. */
  redFlag: boolean
  partial: true
}

/** SpO2 scale 1, for patients without hypercapnic respiratory failure. */
export function spo2Points(spo2: number): number {
  const s = Math.round(spo2)
  if (s >= 96) return 0
  if (s >= 94) return 1
  if (s >= 92) return 2
  return 3
}

export function hrPoints(hr: number): number {
  const h = Math.round(hr)
  if (h <= 40) return 3
  if (h <= 50) return 1
  if (h <= 90) return 0
  if (h <= 110) return 1
  if (h <= 130) return 2
  return 3
}

export function news2Subset(v: { hr: number | null; spo2: number | null }): News2Result | null {
  if (v.hr === null || v.spo2 === null) return null
  const hr = hrPoints(v.hr)
  const spo2 = spo2Points(v.spo2)
  const score = hr + spo2
  const redFlag = hr === 3 || spo2 === 3
  // The maximum here is 6, so NEWS2's "high" band (7+) cannot be reached by this subset.
  const band: News2Band = score >= 5 ? 'medium' : redFlag ? 'low-medium' : 'low'
  return { score, hr, spo2, band, redFlag, partial: true }
}
