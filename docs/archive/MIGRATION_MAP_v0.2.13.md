# Documentation Migration Map for v0.2.13

This map defines archive targets for redundant or historical docs. It is intentionally archive-first to avoid data loss.

## Planned Moves (Archive-First)

- `BUILD_REPORT.md` -> `docs/archive/reports/BUILD_REPORT.md`
- `IMPLEMENTATION_REVIEW_REPORT.md` -> `docs/archive/reports/IMPLEMENTATION_REVIEW_REPORT.md`
- `LAUNCH-READINESS-REPORT.md` -> `docs/archive/reports/LAUNCH-READINESS-REPORT.md`
- `TEST-INFRASTRUCTURE-COMPLETE.md` -> `docs/archive/reports/TEST-INFRASTRUCTURE-COMPLETE.md`
- `ARTNET_IMPLEMENTATION_PLAN.md` -> `docs/archive/plans/ARTNET_IMPLEMENTATION_PLAN.md`
- `UNIFIED_IMPLEMENTATION_PLAN.md` -> `docs/archive/plans/UNIFIED_IMPLEMENTATION_PLAN.md`
- `AGENT_PROMPTS.md` -> `docs/archive/agent-artifacts/AGENT_PROMPTS.md`
- `docs/IPC_BRIDGE_REPORT.md` -> `docs/archive/reports/IPC_BRIDGE_REPORT.md`
- `docs/IPC_API_CONTRACT_REVIEW.md` -> `docs/archive/reports/IPC_API_CONTRACT_REVIEW.md`
- `docs/development/ARTNET_DISCOVERY_ANALYSIS_AND_PLAN.md` -> `docs/archive/rca/ARTNET_DISCOVERY_ANALYSIS_AND_PLAN.md`
- `docs/development/ARTNET_DISCOVERY_ROOT_CAUSE_ANALYSIS.md` -> `docs/archive/rca/ARTNET_DISCOVERY_ROOT_CAUSE_ANALYSIS.md`
- `docs/development/WIRESHARK_MALFORMED_REVIEW.md` -> `docs/archive/rca/WIRESHARK_MALFORMED_REVIEW.md`
- `docs/development/SPRINT_PLAN_HUMAN_NOTES_0.2.md` -> `docs/archive/plans/SPRINT_PLAN_HUMAN_NOTES_0.2.md`
- `docs/PLAN_JITTER_CHART.md` -> `docs/archive/plans/PLAN_JITTER_CHART.md`

## Explicit Non-Moves (Must Stay Canonical)

- `docs/development/ARTNET_SPEC_ASSESSMENT.md` (remains active as the gap tracker for this cycle)
- `docs/art-net4.txt`
- `docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md`
- `docs/IPC_API_CONTRACT.md`
- `docs/architecture/ARCHITECTURE.md`
- `PROJECT_INSTRUCTIONS.md`
- `TESTS.md`
- `docs/development/TESTING.md`

## Notes

- This is a migration contract for cleanup execution and review.
- File moves should be accompanied by compatibility stubs at old paths.
