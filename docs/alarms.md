# Alarms, staff phones and the WardPulse bot

A bed's **status** says how it looks right now. An **alarm** says someone must act. Most alarm fatigue comes from treating these as the same thing, so WardPulse keeps them apart.

Code: [`src/console/alarms.ts`](../src/console/alarms.ts), [`bot.ts`](../src/console/bot.ts), [`snapshot.ts`](../src/console/snapshot.ts).

## Priorities

| Priority | Raised when | Who hears about it |
|---|---|---|
| **P1 Emergency** | Critical (NEWS2 red flag or medium band) for **15 s** of trusted readings | Duty nurse's phone at once; duty doctor if nobody acknowledges within **2 min** |
| **P2 Deterioration** | Watch (trend alarm or NEWS2* ≥ 3) for 15 s | Central station only |
| **P3 Technical** | Sensor off or node silent for 30 s, or motion for 60 s | Central station only |

## Rules

- **Only trusted readings move an alarm.** A reading with low signal quality pauses the P1 countdown but never advances it, so motion or a loose clip cannot page anyone. The same readings also cannot clear an open emergency: a patient can be crashing and moving at the same time.
- **Emergencies are acknowledged, never snoozed.** Acknowledging stops escalation. P2 and P3 can be snoozed for 15, 30 or 60 minutes, and only with a written reason.
- **Severity can change.** A P2 that turns critical becomes a P1. Earlier acknowledgements and snoozes no longer apply, and the nurse is paged. A P1 whose bed settles on Watch for 30 s steps down to P2. Alarms clear after 30 s of trusted stable readings, or 10 s of usable signal for P3.
- **Whoever was paged hears when it ends.** Resolution and step-down messages go to everyone already paged.
- **Everything is audited.** Every raise, page, escalation, acknowledgement, snooze, step up, step down and resolution is logged with time, actor and detail.

The trend evidence (CUSUM) is capped at twice its threshold. A patient who drifted for half an hour still drops below the alarm line about 80 s after recovering, instead of staying on Watch for hours.

## What happens on the demo ward (seed 42)

| Shift time | Bed | Event |
|---|---|---|
| 03:08 | 05 | P2 raised (NEWS2* 3, HR climbing) |
| 03:32 | 05 | Stepped up to **P1**, SpO₂ 90%, nurse paged |
| 04:35 | 04 | P3 raised: sensor off finger |
| 05:16 | 04 | P3 resolved: signal restored |
| 05:32 | 05 | No response in 2 min: **doctor paged** |
| 07:55 | 06 | P2 raised: HR rising (HR still under 110) |

Bed 03 (motion bursts of 30 s and 20 s) and bed 08 (35% packet loss) raise nothing. This is checked by a test that runs the whole demo ward through the store.

## Staff phones

The **Staff phones** panel shows what the duty nurse and doctor would receive. A phone rings when a page arrives, and a pop-up shows on the station screen even when the panel is closed. Typing on a phone goes through the same bot a real WhatsApp number would use.

| Command | Reply |
|---|---|
| `status` | The ward grouped by status, most urgent first, plus a link to the full ward |
| `bed 5` | HR, SpO₂, SQI and NEWS2* for one bed, and its alarm. Untrusted vitals are held back, not quoted |
| `alarms` | Open alarms |
| `ack 5` | Acknowledges the alarm on bed 5 as the sender, and stops doctor escalation |
| `help` | The list above |

Only registered staff numbers get a reply. The demo numbers (`+91 00000 0000x`) are deliberately invalid.

## The snapshot link

Each page links to a frozen snapshot of the whole ward at that moment. The snapshot is JSON, base64url-encoded into the URL **fragment** (`#snap=…`). Browsers never send the fragment to the server, so the link needs no backend, and the readings don't pass through the host. A ward of 8 beds fits in under 1,000 characters.

## Privacy

Messages and snapshots carry bed numbers and vitals, **never patient names**. Tests check that no name appears in any bot reply or snapshot. Anyone holding a snapshot link can read it, as with any shared message, so the link itself is the thing to protect.

## From demo to real WhatsApp

The bot is pure text in, text out, so a real channel only needs a thin adapter:

1. A WhatsApp Business account on Meta's Cloud API. Its free test number can message up to 5 registered phones.
2. A small webhook server that receives staff messages, calls `replyTo()`, and sends the answer back.
3. The console pushing ward state to that server, so the bot answers from live data.
4. Pre-approved message templates for pages that WardPulse starts. Replies within 24 hours of a staff message don't need templates. Meta charges per message for business-initiated messages; check current pricing.

None of this is built yet. The in-app phones demonstrate the same logic without accounts, cost or internet.
