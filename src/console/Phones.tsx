import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { StaffMember } from './alarms'
import { shiftClock } from './format'
import type { ChatMessage } from './store'
import { isPage } from './useRinging'
import { linkFor } from './useWard'

const QUICK = ['status', 'ack 5', 'bed 5', 'alarms', 'help']

/** Message text with any links made clickable. */
function Linked({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/\S+)/).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-signal underline">
            open ward snapshot
          </a>
        ) : (
          part
        ),
      )}
    </>
  )
}

function Phone({
  person,
  messages,
  ringing,
  onSend,
}: {
  person: StaffMember
  messages: ChatMessage[]
  ringing: boolean
  onSend: (text: string) => void
}) {
  const [draft, setDraft] = useState('')
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight })
  }, [messages.length])

  const send = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <div
      className={`flex h-[540px] w-[300px] max-w-full flex-col overflow-hidden rounded-[2rem] border-4 bg-ground ${ringing ? 'border-critical motion-safe:animate-pulse' : 'border-edge'}`}
      aria-label={`Phone of ${person.name}`}
      role="group"
    >
      <div className="flex items-center gap-2 border-b border-edge bg-panel px-4 py-3">
        <span className="grid size-8 place-items-center rounded-full bg-signal font-mono text-xs font-bold text-ground">WP</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">WardPulse</div>
          <div className="truncate font-mono text-[10px] text-dim">
            to {person.name} · {person.phone}
          </div>
        </div>
        {ringing && <span className="font-mono text-[10px] uppercase tracking-wider text-critical">ringing</span>}
      </div>

      <div ref={body} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="m-auto text-center text-xs text-dim">No messages yet. Pages arrive here during an emergency.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-snug break-words whitespace-pre-line ${
              m.from === 'staff' ? 'self-end bg-signal/20' : `self-start bg-panel ${isPage(m) ? 'border-l-4 border-critical' : ''}`
            }`}
          >
            <Linked text={m.text} />
            {m.snapshot && (
              <a href={linkFor(m.snapshot)} target="_blank" rel="noreferrer" className="mt-1 block text-signal underline">
                Open ward snapshot ↗
              </a>
            )}
            <div className="mt-1 text-right font-mono text-[10px] text-dim">{shiftClock(m.t)}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-edge px-2 pt-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSend(q)}
            className="shrink-0 rounded-full border border-edge px-2.5 py-0.5 font-mono text-[11px] text-dim hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal"
          >
            {q}
          </button>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 p-2">
        <label className="sr-only" htmlFor={`msg-${person.id}`}>
          Message WardPulse as {person.name}
        </label>
        <input
          id={`msg-${person.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message WardPulse"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-edge bg-panel px-3 py-1.5 text-sm placeholder:text-dim focus-visible:outline-2 focus-visible:outline-signal"
        />
        <button
          type="submit"
          className="rounded-full bg-signal px-3 py-1.5 text-sm font-medium text-ground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          Send
        </button>
      </form>
    </div>
  )
}

/**
 * Demo stand-ins for the duty staff's phones. Pages from the alarm engine
 * arrive here, and anything typed goes to the same bot a WhatsApp number
 * would answer with.
 */
export function PhonesPanel({
  staff,
  messages,
  ringing,
  onSend,
  onClose,
}: {
  staff: StaffMember[]
  messages: ChatMessage[]
  ringing: Map<string, ChatMessage>
  onSend: (staffId: string, text: string) => void
  onClose: () => void
}) {
  return (
    <aside
      aria-label="Staff phones"
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[720px] flex-col gap-4 overflow-y-auto border-l border-edge bg-panel p-5 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Staff phones</h2>
          <p className="text-xs text-dim">
            Demo of what the duty nurse and doctor receive. Messages carry bed numbers, never patient names. Try{' '}
            <span className="font-mono">status</span> or <span className="font-mono">ack 5</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-edge px-3 py-1 text-sm hover:bg-edge/50 focus-visible:outline-2 focus-visible:outline-signal"
        >
          Close
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-6">
        {staff.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-dim">{p.role === 'nurse' ? 'Duty nurse' : 'Duty doctor'}</div>
            <Phone
              person={p}
              messages={messages.filter((m) => m.staffId === p.id)}
              ringing={ringing.has(p.id)}
              onSend={(text) => onSend(p.id, text)}
            />
          </div>
        ))}
      </div>
    </aside>
  )
}

/** Pop-up on the station screen while a phone is ringing. */
export function RingToast({
  staff,
  ringing,
  onOpen,
}: {
  staff: StaffMember[]
  ringing: Map<string, ChatMessage>
  onOpen: () => void
}) {
  const calls = [...ringing.values()]
  if (!calls.length) return null
  return (
    <div className="fixed right-4 bottom-4 z-20 flex flex-col gap-2" role="status">
      {calls.map((m) => {
        const person = staff.find((s) => s.id === m.staffId)
        return (
          <button
            key={m.id}
            type="button"
            onClick={onOpen}
            className="flex max-w-xs items-start gap-3 rounded-lg border-2 border-critical bg-panel px-4 py-3 text-left shadow-lg focus-visible:outline-2 focus-visible:outline-critical"
          >
            <span className="text-xl motion-safe:animate-bounce" aria-hidden="true">
              📳
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Paging {person?.name ?? m.staffId}</span>
              <span className="block truncate text-xs text-dim">{m.text.split('\n')[0]}</span>
              <span className="block font-mono text-[10px] text-signal">Open phones</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
