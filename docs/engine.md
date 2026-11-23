# Signal engine

Every packet from a bed goes through three steps in order. The order matters: signal quality comes first, so a patient moving their hand never pages a nurse or shifts a baseline.

```
packet ─▶ SQI (is this real?) ─▶ trusted? ─┬─▶ NEWS2 subset (how sick right now?)
                                           └─▶ CUSUM trend (getting worse slowly?)
```

Code: `src/engine/` — `sqi.ts`, `news2.ts`, `trend.ts`, and `bed.ts` which joins them.

## 1. Signal quality index (SQI)

Low-cost nodes compute HR and SpO₂ on the device. Motion fools that algorithm into numbers that look plausible but are wrong. The raw waveform shows the problem, so the console checks the last 8 seconds of IR samples itself.

| Check | What it measures | Scored 0–1 |
|---|---|---|
| Morphology | Each beat is resampled to 32 points and correlated with the average beat (the template). | correlation 0.6 → 0, 0.9 → 1 |
| Rhythm | Variation in beat-to-beat interval (CV), and whether the rate is 30–220 bpm. | CV ≤ 0.08 → 1, ≥ 0.33 → 0 |
| Perfusion | Perfusion index from beat amplitude over DC level. | 1 between 0.3% and 15% |

The SQI is the product of the three checks. Readings with SQI below **0.5** are shown but not scored.

Details worth knowing:
- **Beat detection triggers at 65% of the signal range and re-arms below 35%.** A midrange trigger counted the dicrotic wave, the second bump in each beat, as an extra beat on about 6% of stable seconds. A regression test guards this.
- **No contact** (IR DC below 10,000 counts) scores 0 straight away.
- **A gap in `seq` restarts the window.** Missing samples would otherwise splice two unrelated stretches of waveform together.
- **A packet without a waveform** gets a cautious 0.5, because its vitals cannot be checked.

## 2. NEWS2 subset

The heart-rate and SpO₂ (scale 1) parts of the Royal College of Physicians' NEWS2 chart. A finger clip cannot measure the other five parameters, so:

- every result carries `partial: true`
- the maximum is 6, so NEWS2's "high" band (7+) is never reached
- a single parameter scoring 3 is flagged (`redFlag`), as NEWS2 does

## 3. Trend detection (CUSUM)

Threshold alarms miss slow drift: a patient climbing from 82 to 105 bpm over half an hour never crosses "HR > 110". The trend detector:

1. **Averages trusted readings into 10-second blocks.** This cuts one-second jitter.
2. **Learns the patient's own baseline** from the first 6 blocks (one minute).
3. **Accumulates** `cusum = max(0, cusum + (block − baseline) − allowance)` for rises (HR), and the mirror image for falls (SpO₂).
4. **Alarms** while `cusum ≥ threshold`.

| Vital | Allowance per block | Threshold |
|---|---|---|
| HR rise | 4 bpm | 30 bpm·blocks |
| SpO₂ fall | 0.75 points | 4 point·blocks |

An EWMA (α = 0.1) gives the console a smoothed value to display.

## Results on the demo ward (simulated)

These are measured by `src/engine/bed.test.ts` over a 40-minute simulated shift, and they were the same for seeds 1, 2, 3, 42 and 99.

| Bed | Story | Result |
|---|---|---|
| bed-06 | HR +44, SpO₂ −4 over 40 min | Trend alarm at **461 s**. A threshold alarm (true HR > 110) would fire at 1588 s: **about 19 minutes earlier**. |
| bed-05 | Acute hypoxia from 150 s | Trend alarm at 191 s |
| bed-03 | Motion artefact | Over 90% of moving seconds distrusted; no trend alarm |
| others | Stable, sensor-off, flat battery, packet loss | No trend alarm |

**Caveat.** The simulator's patients are calmer than real ones: reported HR noise is about ±1 bpm. That is why stable beds build no drift evidence at all. On real patients, the allowance and threshold must be tuned against recorded data before any lead-time claim is made.
