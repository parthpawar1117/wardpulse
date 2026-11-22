# WardPulse

**An offline-first ward console for low-cost patient monitors.**

One nurse watching many beds needs to know three things: which patient is getting worse, which alarm is only a loose sensor, and whether any data was lost when the internet dropped. WardPulse answers all three for monitors that cost thousands of rupees, not lakhs.

> Built during CODEFESTTHON 2026 (22–24 Nov 2026). The commit history in this repo is the build log.

## Status

| Part | State |
|---|---|
| Packet schema and validator | ✅ done, tested |
| Ward simulator (PPG + scenarios) | ✅ done, tested |
| Signal engine (SQI, NEWS2 subset, trend detection) | ⏳ next |
| Central station UI | ⏳ |
| Alarm escalation and audit log | ⏳ |
| Offline-first sync and fleet health | ⏳ |
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
- **Signal engine** scores signal quality, computes early-warning scores and detects trends.
- **Console** shows every bed, raises and escalates alarms, and keeps working offline.

A fuller architecture section will come with the engine.

## Important limitations

- **Not a medical device.** WardPulse is clinical decision support for evaluation and pilots. It does not diagnose, and it has not been clinically validated.
- **The demo uses simulated patients.** Scenario data is synthetic, and any lead-time numbers shown in the demo come from those simulations, not from real patients.
- **The early-warning score is partial.** It uses only the heart-rate and SpO₂ parts of NEWS2, because low-cost PPG monitors don't measure the other vital signs.

## Licence

MIT
