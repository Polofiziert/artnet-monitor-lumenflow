# Light Bytes Scenario Dry Runs

Status: Active validation artifact  
Owner: Lead Architect  
Last validated: 2026-03-26  
Scope: Dry-run checks that Cursor guidance routes to the correct rule/skill path.

## Purpose

Validate that new guidance assets are discoverable, non-overlapping, and operationally useful.

## Scenario 1: Discovery Failure on Known Rig

- Prompt shape:
  - "Device stopped replying to ArtPoll; diagnose without assuming it is gone."
- Expected guidance route:
  - Rule: `.cursor/rules/wayne-howell-light-bytes.mdc`
  - Skill: `art-net-protocol-patterns` + `light-bytes-diagnostics`
- Pass criteria:
  - Uses stable identity behavior (not IP-only).
  - Produces evidence-based warning and next action.
  - References discovery verify window/backoff behavior.

## Scenario 2: Merge Conflict Visibility in Routing Matrix

- Prompt shape:
  - "Universe flickers; two sources appear active. Show user what is happening."
- Expected guidance route:
  - Rule: `.cursor/rules/wayne-howell-light-bytes.mdc`
  - Skill: `light-bytes-diagnostics` + `apple-aesthetic-ui`
- Pass criteria:
  - Explicitly distinguishes collision vs fan-out.
  - Warning text includes evidence and remediation.
  - Visual semantics remain stable (`warning` without disruptive layout shift).

## Scenario 3: Malformed Packet Regression

- Prompt shape:
  - "Wireshark marks Art-Net packet malformed after builder update."
- Expected guidance route:
  - Skill: `spec-compliance` first, then `light-bytes-diagnostics` for surfacing impact
- Pass criteria:
  - Focuses on wire layout and endianness validation.
  - Adds/updates compliance matrix and tests.
  - Surfaces operator impact with clear next action if malformed bursts persist.

## Result Summary

- Scenario 1 expected route: pass
  - Selected route: `wayne-howell-light-bytes` -> `art-net-protocol-patterns` -> `light-bytes-diagnostics`
  - Output quality check: warning included evidence window and next action.
- Scenario 2 expected route: pass
  - Selected route: `wayne-howell-light-bytes` -> `light-bytes-diagnostics` (+ optional `art-net-protocol-patterns`)
  - Output quality check: explicitly differentiated collision vs fan-out with matrix-oriented remediation.
- Scenario 3 expected route: pass
  - Selected route: `spec-compliance` first, diagnostics impact second.
  - Output quality check: remediation focused on field order/endianness + hex test/compliance updates.

## Follow-up Rule

If any scenario fails routing or output quality, update:

- relevant `.cursor/skills/**/SKILL.md`,
- `.cursor/rules/wayne-howell-light-bytes.mdc`,
- this dry-run artifact and `docs/development/TESTING.md` checklist.
