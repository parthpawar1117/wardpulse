# Submission kit

## Devfolio fields

**Project name:** WardPulse

**Tagline:** An offline-first ward console that turns low-cost pulse oximeters into a trustworthy early-warning system.

**The problem it solves**

In district hospitals and PHCs, one nurse often watches many beds. Low-cost PPG monitors make bedside monitoring affordable, but they fail in two ways. First, they raise **false alarms**: a moving patient or a slipped clip produces a scary number, so staff learn to ignore alarms. Second, they raise **late alarms**: a fixed threshold such as HR > 110 fires only after a patient has been deteriorating for a long time. On top of that, the internet in these hospitals is unreliable, and nobody notices when a sensor's battery dies.

WardPulse is a central-station console built for that reality:

- **It knows when not to trust a reading.** Every second of the raw pulse waveform gets a signal-quality score from beat shape, rhythm and perfusion. Untrusted vitals are greyed out as "held" and never feed alarms or early-warning scores. The screen says why: motion, sensor off, or collecting.
- **It warns early.** It learns each patient's own baseline and uses CUSUM trend detection. In the simulated sepsis-style scenario it flagged deterioration about **19 minutes before** HR crossed 110, consistently across five random seeds.
- **Emergencies reach people, not just screens.** A bed that stays critical on trusted readings becomes a P1 emergency. The duty nurse's phone is paged, and if nobody acknowledges within 2 minutes, the doctor's. Staff can reply to the WardPulse bot (`status`, `bed 5`, `ack 5`), and pages link to a snapshot of the whole ward. Messages never contain patient names. Every action goes into an audit log.
- **It survives the internet dropping.** Readings queue in the browser (IndexedDB) and upload when the link returns, with idempotent keys so resends are never stored twice. After one visit, the console loads with no internet at all. A fleet panel warns before a sensor's battery dies.

**Challenges I ran into**

- **Beat detection double-counted the dicrotic notch.** That made stable patients look like motion artefact (only 94% trusted). I switched to a hysteresis trigger (fire at 65% of range, re-arm below 35%) and added a regression test. Stable beds are now trusted in over 99% of seconds.
- **Trend alarms that never cleared.** CUSUM evidence grew without limit, so a recovered patient stayed on Watch for hours. Capping it at twice the threshold made recovery clear in about 80 seconds without slowing detection.
- **Alarm fatigue versus safety.** I decided that untrusted readings can neither raise nor clear an alarm, so an emergency stays open while a crashing patient is also moving. I also made emergencies acknowledge-only, never snoozable.
- **Sync correctness.** A sequence-number key breaks when a node reboots, so the idempotency key is node + sequence + timestamp.

**Tech stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Web Workers (PPG simulator), Canvas (waveforms), Dexie / IndexedDB (offline outbox), vite-plugin-pwa (service worker), Vitest (174 tests).

**Honest notes:** Patients and readings are simulated. It is clinical decision support for evaluation, not a medical device. The early-warning score uses only the HR and SpO₂ parts of NEWS2. Built with AI-assisted development.

## Demo video script (about 2.5 minutes)

Set up first: run `npm run dev`, open http://localhost:5173, and close other tabs. Turn **Sound on** if your recorder captures audio.

| Time | Show | Say |
|---|---|---|
| 0:00 | The full console | "This is WardPulse, a ward console for low-cost patient monitors. One nurse, eight beds. Cheap monitors fail in two ways: false alarms and late alarms. WardPulse fixes both, and keeps working when the internet doesn't." |
| 0:20 | Bed 03 during motion (around 0:45 of shift time), then click it | "Bed 03's patient is moving. A normal monitor would show these numbers and maybe alarm. WardPulse scores the waveform itself, sees the beats are irregular, and holds the vitals. No false alarm." |
| 0:40 | Switch to **30×**. Bed 05 turns critical; the emergency banner and phone pop-up appear | "Bed 05 is becoming hypoxic. Once it has been critical for 15 seconds on trusted readings, it's an emergency, and the duty nurse's phone is paged." |
| 1:00 | Open **Staff phones**, type `status` on the doctor's phone, then `ack 5` on the nurse's phone | "Staff can ask the WardPulse bot for the ward status, and acknowledge from their phone, which stops escalation to the doctor. No patient names ever leave the ward." |
| 1:20 | Click **open ward snapshot** | "Every page links to a frozen snapshot of the whole ward. The data is inside the link itself, so no server is needed." |
| 1:35 | Bed 06 on **Watch** with HR still under 110; open its panel and show the trend line | "Bed 06 is slowly deteriorating. Its heart rate is still under 110, so a threshold alarm wouldn't fire. But WardPulse compares it with the patient's own baseline, and here it flagged this about 19 minutes earlier." |
| 1:55 | Scroll to the Uplink panel and click **Pull the network** | "Rural internet drops. Pull the network, and monitoring, alarms and phones carry on. Readings queue locally." |
| 2:10 | Click **Restore network** | "When it returns, the queue drains. Lost confirmations cause resends, and the server refuses the duplicates, so nothing is stored twice." |
| 2:20 | The Fleet health table | "And it watches the hardware: bed 07's battery will be empty in about 19 minutes, and bed 08 has a weak link." |
| 2:30 | Back to the full console | "WardPulse: trust the signal, warn early, reach the right people, and never lose data. Thank you." |
