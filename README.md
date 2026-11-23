# WardPulse

**An offline-first ward console for low-cost patient monitors.**

One nurse watching many beds needs to know three things: which patient is getting worse, which alarm is only a loose sensor, and whether any data was lost when the internet dropped. WardPulse answers all three for monitors that cost thousands of rupees, not lakhs.

> Built during CODEFESTTHON 2026 (22–24 Nov 2026). The commit history in this repo is the build log.

## Status

| Part | State |
|---|---|
| Packet schema and validator | ✅ done, tested |
| Ward simulator (PPG + scenarios) | ✅ done, tested |
| Signal engine (SQI, NEWS2 subset, trend detection) | ✅ done, tested |
| Central station UI | ✅ done, tested |
| Alarm escalation, staff phones and audit log | ✅ done, tested |
| Offline-first sync and fleet health | ⏳ next |
| Validation lab and shift handover | ⏳ |
| Hardware bridge (`bridge.py`) | ⏳ |

## Run it

```bash
npm install
npm run dev      # console at http://localhost:5173
npm test         # unit tests
npm run build    # production build
```

## How it fits together

- **Hub or simulator** sends JSON packets (see [docs/packet-schema.md](docs/packet-schema.md)).
- **Signal engine** scores signal quality, computes early-warning scores and detects trends (see [docs/engine.md](docs/engine.md)).
- **Console** shows every bed, raises and escalates alarms, and keeps working offline.

### The central station

- **Bed grid.** Each card shows a live, smoothly scrolling PPG trace, HR, SpO₂, signal quality and the partial NEWS2. Vitals the engine doesn't trust are greyed out as *held*.
- **Attention strip.** Lists the beds that need a look, most urgent first: Critical, Watch, Check sensor, Artefact, Checking, Offline.
- **Bed drawer.** Explains *why* a bed has its status: the NEWS2 breakdown, signal-quality reasons in plain words, ten-minute trend lines against the patient's own baseline, and node battery, link and packet loss.
- **Simulator.** Runs in a Web Worker at 1×, 10× or 30×. The *simulated data* label is always on screen.

### Alarms and staff phones

- **Emergencies page people.** A bed that stays critical for 15 s on trusted readings becomes a P1 emergency: a banner across the console and a page to the duty nurse's phone. If nobody acknowledges within 2 minutes, the duty doctor is paged.
- **Motion can't page anyone.** Untrusted readings neither raise nor clear alarms. On the demo ward, the motion and packet-loss beds raise nothing.
- **Acknowledge, snooze, escalate.** Emergencies can be acknowledged, never snoozed. Lower priorities can be snoozed, with a required reason. Every action is in the audit log.
- **WardPulse bot.** Staff can text `status`, `bed 5`, `alarms` or `ack 5`. Pages link to a frozen snapshot of the whole ward that needs no server. Messages never contain patient names.

See [docs/alarms.md](docs/alarms.md) for the rules, the demo timeline and the path to a real WhatsApp number.

On the simulated demo ward, the trend detector flags a slow deterioration about 19 minutes before a conventional HR > 110 alarm would. That number comes from synthetic patients; see the caveat in the engine docs.

## Important limitations

- **Not a medical device.** WardPulse is clinical decision support for evaluation and pilots. It does not diagnose, and it has not been clinically validated.
- **The demo uses simulated patients.** Scenario data is synthetic, and any lead-time numbers shown in the demo come from those simulations, not from real patients.
- **The early-warning score is partial.** It uses only the heart-rate and SpO₂ parts of NEWS2, because low-cost PPG monitors don't measure the other vital signs.

## Licence

MIT
