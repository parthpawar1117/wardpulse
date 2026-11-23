import type { BedStatus } from './store'

export const STATUS_LABEL: Record<BedStatus, string> = {
  critical: 'Critical',
  watch: 'Watch',
  'no-signal': 'Check sensor',
  artefact: 'Artefact',
  offline: 'Offline',
  stable: 'Stable',
}

/** Text colour per status. Colour is reserved for severity; non-clinical states stay neutral. */
export const STATUS_TEXT: Record<BedStatus, string> = {
  critical: 'text-critical',
  watch: 'text-watch',
  'no-signal': 'text-watch',
  artefact: 'text-dim',
  offline: 'text-dim',
  stable: 'text-stable',
}

export const STATUS_BORDER: Record<BedStatus, string> = {
  critical: 'border-critical',
  watch: 'border-watch',
  'no-signal': 'border-watch/60',
  artefact: 'border-edge',
  offline: 'border-edge',
  stable: 'border-edge',
}

/** 'bed-01' → 'Bed 01'. Other node ids are shown as they are. */
export const bedLabel = (id: string) => (/^bed-\d+$/.test(id) ? `Bed ${id.slice(4)}` : id)

/** Simulation seconds → shift clock, e.g. 754 → '00:12:34'. */
export const shiftClock = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n) => String(n).padStart(2, '0')).join(':')
