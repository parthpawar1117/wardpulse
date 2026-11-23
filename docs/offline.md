# Offline-first sync and fleet health

Rural PHCs often have unreliable internet. WardPulse is built so that **losing the internet loses nothing**. Monitoring, alarms and staff phones run on the ward network. Only the upload to the district server waits.

Code: [`src/sync/`](../src/sync), [`src/console/fleet.ts`](../src/console/fleet.ts).

## Store and forward

```
monitors → ward console → outbox (IndexedDB) → syncer → district server
              │                                   ▲
              └─ alarms, phones, screen           └─ deletes only what the server confirms
```

1. **Every valid packet goes into the outbox first.** It is reduced to its vitals, and the 25 Hz waveform stays on the ward, which cuts uplink traffic about tenfold. The outbox lives in the browser's IndexedDB through [Dexie](https://dexie.org), so it survives a closed tab, a crash or a power cut.
2. **Every 2 seconds the syncer sends the oldest records** in batches of up to 200.
3. **A batch is deleted only when the server confirms it.** If the uplink drops mid-flush, the rest simply stays queued.

## Why resending is safe

The hardest case isn't "no network". It's when the server stores a batch but its confirmation is lost on the way back, so the ward thinks it failed and sends it again. Each record has an **idempotency key**: the same packet always produces the same key, and the server stores a key only once. A resend is refused as a duplicate, never stored twice.

The key is `node : seq : ts`. Node and sequence number alone are not enough, because a node that reboots starts counting from 0 again, and two different readings would collide. Adding the timestamp keeps them apart, while a true resend (byte-identical) still matches.

The demo's simulated uplink loses **10% of confirmations on purpose**. On one 13-minute run at 30×, 6,304 readings were delivered and the server held exactly 6,304, after refusing 120 duplicates from 4 resent batches.

## Try it

- **Pull the network** (in the Uplink panel) cuts the simulated uplink. The ward carries on, and *Queued on ward* climbs. The header shows `offline · N queued`.
- **Restore network** drains the queue within a couple of seconds.
- **Truly offline:** after one online visit, the service worker (vite-plugin-pwa) has cached the app. Turn off Wi-Fi and reload, and the console still loads and runs. It then reports *Browser offline* and keeps queuing.

## Fleet health

Cheap nodes fail quietly, so the **Fleet health** panel watches the hardware itself.

| Signal | How it's judged |
|---|---|
| Battery | Drain rate is a least-squares fit over the last 15 minutes of battery readings (one every 10 s, needing at least 5 minutes of history). This gives the time to empty. **Warn** below 25% or under 60 min left; **critical** below 10% or under 15 min. |
| Link | RSSI ≥ −67 dBm good, ≥ −80 fair, otherwise poor (warn). |
| Packet loss | Share of the last 120 packets that never arrived, so an old outage doesn't distort today's number. Warn above 5%. |
| Silence | No packets for 10 s is critical. |

Nodes whose battery hasn't measurably moved show `–` rather than a made-up time left. On the demo ward, Bed 07's battery is flagged about 20 minutes before it dies, and Bed 08's weak link is flagged too.

## Limits

- The district server is **simulated in the browser** and starts empty on every reload. The outbox is real and persists. A real deployment would point the transport at an HTTPS endpoint with the same contract: accept a batch, report accepted and duplicate counts.
- Alarm audit entries are not uploaded yet, only readings.
