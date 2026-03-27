# Light Bytes Diagnostics Standard

Status: Canonical  
Owner: Lead Architect (LumenFlow)  
Last validated: 2026-03-26  
Scope: Operator-facing diagnostics behavior and engineering interpretation rules for Art-Net networks.

## Purpose

This standard codifies Howell-style diagnostics principles for LumenFlow:

- Wire truth over assumed state.
- Fast triage under pressure.
- Deterministic interpretation for timing, source collisions, and device state drift.
- Every warning should suggest a concrete next action.

Use this as the canonical behavior contract for backend diagnostics logic, UI warnings, and agent-generated implementation/review guidance.

## Core Doctrine

1. Wire truth wins  
   Device/UI state is provisional until confirmed by inbound network evidence (typically ArtPollReply, route observation, or packet timing evidence).
2. Explain why, then what to do  
   Diagnostics must include likely cause and an action path, not only severity.
3. Distinguish collisions from fan-out  
   Multiple sources on one universe is a collision/merge risk. One source to many outputs is normal fan-out.
4. Timing is first-class  
   Jitter, staleness, and sequence anomalies are primary health indicators, not optional charts.
5. Confidence matters  
   Use language that reflects certainty: observed, inferred, suspected.

## Severity and Message Contract

Every surfaced diagnostic should provide:

- Severity: `ok`, `warning`, `error`
- Evidence: metric/packet fact
- Interpretation: short operator-readable meaning
- Action: next check or remediation

Message template:

`[Severity] [Symptom] because [Evidence]. Next: [Action].`

Example:

`Warning: Universe 0:0:1 has multiple active sources because 2 source IPs were seen in route-info over 3s. Next: verify controller ownership and merge policy on receiving nodes.`

## Diagnostics Taxonomy

- Discovery integrity
  - missing poll replies
  - unstable bind bundles
  - identity drift (same MAC/bind identity, changed IP)
- Stream integrity
  - sequence gaps/out-of-order
  - stale/disconnected universes
  - non-zero start code presence where unexpected
- Topology integrity
  - multi-source same universe (collision/merge risk)
  - source mismatch vs expected routing intent
- Protocol integrity
  - malformed packet patterns
  - unsupported/invalid field layouts

## Required Behavioral Rules

### Discovery and identity

- Identify products with stable product identity (`bind_ip + MAC` class), not source IP alone.
- Treat IP changes as state-change events, not as new unrelated devices.
- Upsert discovery idempotently; duplicates and reordering are expected.

### Configuration verification

- ArtAddress and IP programming are pending until reflected by follow-up network state.
- If requested state is not observed within verify window, mark as warning with explicit remediation.

### Timing and thresholds

- Staleness must be threshold-backed and documented in contract/user docs.
- Jitter warnings must include active threshold value in text.
- Sequence error accumulation must be monotonic per stream identity and visible in diagnostics.

### UI language and cognition

- Prefer plain operator language over protocol jargon in status labels.
- Tooltips and detail panes must expose protocol details for experts.
- Never hide uncertainty; show pending/unconfirmed state explicitly.

## Verification Sources

- Testing policy: `TESTS.md`
- Test execution and QA procedures: `docs/development/TESTING.md`
- IPC event/field contract: `docs/IPC_API_CONTRACT.md`
- Protocol behavior baseline: `docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md`

## Change Control

Update this document whenever any of these change:

- warning/error semantics or thresholds,
- merge/collision interpretation logic,
- discovery identity policy,
- remediation text standards.

Related updates required in same change:

- `docs/diagnostics/DIAGNOSTIC_EVENT_CATALOG.md`
- `docs/diagnostics/TROUBLESHOOTING_PLAYBOOK.md`
- `.cursor` rule/skill references for diagnostics guidance.
