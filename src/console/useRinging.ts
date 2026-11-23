import { useEffect, useState } from 'react'
import type { ChatMessage } from './store'

export const isPage = (m: ChatMessage) => m.kind === 'emergency' || m.kind === 'escalation'

/** The newest page for each person. */
function latestPages(messages: ChatMessage[]) {
  const out = new Map<string, ChatMessage>()
  for (const m of messages) if (isPage(m)) out.set(m.staffId, m)
  return out
}

/** How long a phone rings after a page, in real milliseconds. */
const RING_MS = 8000

/** Who is ringing right now: anyone whose newest page arrived in the last few seconds. */
export function useRinging(messages: ChatMessage[]) {
  const latest = latestPages(messages)
  const [quiet, setQuiet] = useState<Record<string, number>>({})
  const key = [...latest.values()].map((m) => `${m.staffId}:${m.id}`).join(',')

  useEffect(() => {
    if (!key) return
    const pages = key.split(',').map((p) => p.split(':'))
    const timer = window.setTimeout(
      () => setQuiet((q) => ({ ...q, ...Object.fromEntries(pages.map(([staff, id]) => [staff, Number(id)])) })),
      RING_MS,
    )
    return () => window.clearTimeout(timer)
  }, [key])

  return new Map([...latest].filter(([id, m]) => quiet[id] !== m.id))
}
