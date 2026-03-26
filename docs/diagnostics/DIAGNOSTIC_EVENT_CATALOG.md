# Diagnostic Event Catalog

Status: Canonical  
Owner: Reliability + Protocol Engineering  
Last validated: 2026-03-26  
Scope: Event-level diagnostics contract between backend telemetry and operator-facing UI.

## Purpose

This catalog defines required semantics for diagnostics events and ensures consistent severity, wording, and remediation paths across backend and UI.

## Event Fields (minimum)

- `event_id`: stable string key
- `severity`: `ok | warning | error`
- `confidence`: `observed | inferred | suspected`
- `evidence`: concise metric/packet basis
- `operator_message`: short readable message
- `next_action`: concrete check/remediation

## Event Catalog

| event_id | Severity | Trigger evidence | Operator message | Next action |
| --- | --- | --- | --- | --- |
| `discovery.no_reply_timeout` | warning | Known product misses expected PollReply window | Device is not responding to discovery | Verify cable/VLAN/NIC binding and send targeted poll |
| `discovery.identity_ip_changed` | warning | Stable product identity observed with changed IP | Device IP changed for known node identity | Confirm intended readdressing and update patch docs |
| `stream.universe_stale` | warning | Last DMX age exceeds stale threshold | Universe is stale and may be frozen | Check controller output and source reachability |
| `stream.universe_disconnected` | error | No DMX for disconnect threshold window | Universe appears disconnected | Verify source online state and network path immediately |
| `stream.sequence_anomaly` | warning | Sequence gap/out-of-order count increases | Packet order/loss anomalies detected | Inspect jitter/loss and switch health |
| `topology.multi_source_universe` | warning | Source count >= 2 on same universe | Multiple active sources detected on one universe | Confirm merge ownership and receiver merge mode |
| `protocol.malformed_packet_burst` | error | Sustained malformed packet detections | Malformed Art-Net traffic is impacting reliability | Capture pcap and validate sender firmware/layout |
| `protocol.unsupported_opcode` | ok | Known but unsupported opcode observed | Unsupported protocol feature observed | Review compliance matrix and decide implementation priority |
| `config.verify_failed` | warning | Requested config mutation not reflected in follow-up state | Requested device change not confirmed | Retry with backoff and validate device capability |

## Wording Rules

- Include threshold values where relevant (ms, seconds, counts).
- Avoid blame language; be factual and actionable.
- Keep first sentence under 120 characters.

## Mapping Requirements

- Each event surfaced in UI must map to one `event_id` in this table.
- If a new event is added in code, update this document and troubleshooting playbook in the same change.

## Verification Sources

- `docs/IPC_API_CONTRACT.md`
- `docs/development/TESTING.md`
- `TESTS.md`
