# WardPulse packet schema (v1)

This is the contract between a ward hub and the WardPulse console. Any hub that sends these packets works with WardPulse. The reference hardware is a MAXREFDES117 PPG sensor on an ESP32 node, relayed over ESP-NOW to an ESP32-S3 hub, but nothing here is specific to that hardware.

The built-in simulator emits exactly the same packets, so the console cannot tell simulated beds from real ones. That is deliberate: replacing the simulator with real hardware needs no console changes.

## Example

```json
{ "v": 1, "hub": "ward-a", "node": "bed-05", "seq": 48213, "ts": 1795400000123,
  "hr": 118, "spo2": 89, "pi": 1.8,
  "ir": [51234, 51290, 51410], "red": [40211, 40250, 40330],
  "batt": 0.62, "rssi": -71 }
```

## Fields

| Field | Type | Required | Rule | Why it exists |
|---|---|---|---|---|
| `v` | integer | yes | must be `1` | Lets the schema evolve without breaking old hubs |
| `hub` | string | yes | non-empty | Identifies the ward hub |
| `node` | string | yes | non-empty | Identifies the bedside node |
| `seq` | integer | yes | ≥ 0, increases per node | Makes sync idempotent and shows packet loss as gaps |
| `ts` | integer | yes | epoch milliseconds, > 0 | When the hub received the reading |
| `hr` | number or null | yes | 20–300 bpm | Heart rate; `null` when the node can't compute it |
| `spo2` | number or null | yes | 50–100 % | Oxygen saturation; `null` when the node can't compute it |
| `pi` | number or null | yes | 0–20 % | Perfusion index; a low value means a weak pulse signal |
| `ir` | number[] | no | ≤ 250 finite samples | Raw infrared PPG since the last packet, used for signal quality |
| `red` | number[] | with `ir` | same length as `ir` | Raw red PPG |
| `batt` | number | yes | 0–1 | Node battery fraction |
| `rssi` | number | yes | −120 to 0 dBm | Link quality at the hub |

## Behaviour

- **Invalid packets are dropped and logged, never displayed.** The validator returns every error at once so firmware bugs can be fixed in one pass.
- **Values outside the limits count as sensor faults, not patient states.** For example, an SpO₂ of 30 % is treated as a broken reading, not an emergency.
- **Raw samples are optional.** A hub short on bandwidth can omit `ir` and `red`. The console then falls back to a signal-quality estimate from `pi` and heart-rate stability.
- **Duplicates are harmless.** A repeated `(node, seq)` pair is ignored, so a hub can safely resend after a reconnect.

## Transport

Packets travel as newline-delimited JSON. The console reads them over a WebSocket. For a hub connected by USB serial, `bridge/bridge.py` forwards each serial line to the WebSocket.
