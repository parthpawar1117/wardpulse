import type { Alarm } from './alarms'
import { PRIORITY_LABEL, PRIORITY_TEXT } from './format'

/** Small pill with an alarm's priority and where it stands. */
export function AlarmBadge({ alarm }: { alarm: Pick<Alarm, 'priority' | 'state' | 'paged'> }) {
  const where =
    alarm.state === 'acknowledged'
      ? 'ack’d'
      : alarm.state === 'snoozed'
        ? 'snoozed'
        : alarm.paged.includes('doctor')
          ? 'doctor paged'
          : alarm.paged.length
            ? 'nurse paged'
            : null
  return (
    <span
      title={PRIORITY_LABEL[alarm.priority]}
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 font-mono text-[10px] leading-4 ${PRIORITY_TEXT[alarm.priority]} ${alarm.state !== 'active' ? 'opacity-60' : ''}`}
    >
      {alarm.priority}
      {where && <span className="text-dim">· {where}</span>}
    </span>
  )
}
