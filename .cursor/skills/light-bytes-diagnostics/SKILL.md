---
name: light-bytes-diagnostics
description: Apply LumenFlow diagnostic doctrine for Art-Net reliability, event semantics, and operator-facing triage language. Use when implementing or reviewing discovery health, jitter/staleness, merge/collision behavior, diagnostics events, or troubleshooting UX.
---

# Light Bytes Diagnostics

Use this skill to keep diagnostics behavior consistent, actionable, and field-ready.

## Use this skill when

- adding or changing diagnostics events/warnings/status labels,
- adjusting jitter/staleness/disconnect semantics,
- implementing discovery reliability and identity-drift behavior,
- reviewing merge/collision visibility in dashboard/inspector/matrix.

## Do not use this skill for

- packet byte layouts, parser structs, and opcode field order (use `spec-compliance`),
- protocol choreography without diagnostics/UI semantics focus (use `art-net-protocol-patterns`),
- generic visual polish not tied to diagnostics cognition (use `apple-aesthetic-ui`).

## Required references

- `docs/development/LIGHT_BYTES_DIAGNOSTICS_STANDARD.md`
- `docs/diagnostics/DIAGNOSTIC_EVENT_CATALOG.md`
- `docs/diagnostics/TROUBLESHOOTING_PLAYBOOK.md`
- `docs/IPC_API_CONTRACT.md`

## Workflow

1. Identify the symptom class:
   - discovery integrity
   - stream integrity
   - topology integrity
   - protocol integrity
2. Define evidence and threshold.
3. Assign severity and confidence (`observed`, `inferred`, `suspected`).
4. Produce operator-facing message with next action.
5. Verify mapping to event catalog and playbook.

## Output contract for diagnostics text

Use:

`[Severity] [Symptom] because [Evidence]. Next: [Action].`

Rules:

- keep first sentence concise and factual,
- include threshold values for timing-related warnings,
- avoid ambiguous terms like "maybe unstable" without evidence,
- do not claim success for config mutation until verification evidence exists.

## Quality checks

- Collision vs fan-out explicitly differentiated.
- Discovery identity does not rely on IP-only if stronger identity exists.
- Pending/unconfirmed states visible where verification is not complete.
- Suggested action is operationally realistic in FOH conditions.
