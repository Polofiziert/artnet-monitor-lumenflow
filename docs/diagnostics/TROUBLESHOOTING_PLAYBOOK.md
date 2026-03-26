# Troubleshooting Playbook

Status: Canonical  
Owner: Reliability + UX  
Last validated: 2026-03-26  
Scope: Operator and engineering runbooks for high-impact Art-Net incidents.

## Purpose

Provide deterministic first-response workflows for frequent field failures in professional Art-Net environments.

## Runbook 1: No Devices Discovered

Symptoms:

- Device list empty or unexpectedly low.
- Discovery warnings increase.

Checks:

1. Confirm selected NIC and subnet/broadcast targets.
2. Verify poll cadence and reply window are active.
3. Confirm device network segment (VLAN/routing) is reachable.

Actions:

- Switch to expected NIC, then rerun discovery.
- Use directed target where broadcast is filtered.
- Capture a short pcap if discovery remains silent.

Escalate when:

- Known devices remain absent after NIC + target corrections.

## Runbook 2: Multi-Source Universe Collision

Symptoms:

- Universe flagged as multi-source.
- Flicker or non-deterministic output.

Checks:

1. Inspect source list for affected universe.
2. Confirm whether this is intended merge or accidental dual transmission.
3. Check receiver merge policy (HTP/LTP/device-specific behavior).

Actions:

- Isolate to a single authoritative source when unintended.
- If intended, document merge expectations and monitor jitter/sequence quality.

Escalate when:

- Source ownership cannot be determined quickly in live show context.

## Runbook 3: Jitter and Sequence Instability

Symptoms:

- Repeated jitter warnings or sequence anomaly events.
- Intermittent stale/disconnect transitions.

Checks:

1. Inspect inter-packet timing trend and spike frequency.
2. Compare affected universes against switch ports/devices.
3. Validate socket buffer and host load constraints.

Actions:

- Reduce bursty traffic where possible.
- Validate switch health and link errors.
- Prioritize wired paths and avoid unstable bridge links.

Escalate when:

- Jitter persists above configured warning threshold across multiple universes.

## Runbook 4: Config Change Not Verified

Symptoms:

- UI shows pending config operation with verify timeout.

Checks:

1. Confirm command target identity (bind identity, IP, port context).
2. Confirm device supports requested mutation.
3. Re-check follow-up poll/readback evidence.

Actions:

- Retry with bounded backoff.
- Present clear warning if device state remains unchanged.
- Preserve wire-observed state as source of truth.

Escalate when:

- Multiple retries fail and operator cannot confirm device behavior.

## Runbook 5: Malformed Packet Burst

Symptoms:

- Protocol malformed event rate spikes.
- Diagnostics degrade under traffic.

Checks:

1. Identify offending source IPs and opcodes.
2. Validate packet layout against compliance matrix/spec.
3. Confirm whether malformed data is isolated or widespread.

Actions:

- Capture forensic pcap sample.
- Isolate sender if possible.
- Cross-check with `docs/development/WIRESHARK_MALFORMED_REVIEW.md`.

Escalate when:

- Malformed traffic is sustained and cannot be isolated safely.

## Evidence Capture Minimum

- Timestamp window
- Selected NIC/settings context
- Source IPs and affected universes
- Top 3 active diagnostics events
- Optional pcap reference for protocol incidents

## Cross References

- `docs/diagnostics/DIAGNOSTIC_EVENT_CATALOG.md`
- `docs/development/LIGHT_BYTES_DIAGNOSTICS_STANDARD.md`
- `docs/IPC_API_CONTRACT.md`
