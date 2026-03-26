# LumenFlow Agent Operating Contract

Status: Canonical  
Owner: Lead Architect  
Last validated: 2026-03-26

## Purpose

Define how AI agents must select source-of-truth documents, apply project guidance, and keep rules/skills/docs/tests synchronized.

## Canonical Source Map

- Documentation index and canonicality model: `docs/INDEX.md`
- Protocol normative source: `docs/art-net4.txt`
- Protocol implementation baseline: `docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md`
- Protocol support status: `docs/protocol/ARTNET_COMPLIANCE_MATRIX.md`
- IPC API contract: `docs/IPC_API_CONTRACT.md`
- Diagnostics doctrine: `docs/development/LIGHT_BYTES_DIAGNOSTICS_STANDARD.md`
- Diagnostics event semantics: `docs/diagnostics/DIAGNOSTIC_EVENT_CATALOG.md`
- Diagnostics runbooks: `docs/diagnostics/TROUBLESHOOTING_PLAYBOOK.md`
- Testing policy and execution: `TESTS.md`, `docs/development/TESTING.md`

When two docs conflict, prefer canonical docs listed in `docs/INDEX.md`; if conflict remains, treat as unresolved and request clarification.

## Rules and Skills Authority Boundaries

- `.cursor/rules/` enforce concise, always-on invariants.
- `.cursor/skills/` define procedural workflows and domain playbooks.
- Boundary split:
  - `spec-compliance`: wire format, parser correctness, hex/fuzz tests
  - `art-net-protocol-patterns`: runtime choreography, reliability, merge policy
  - `light-bytes-diagnostics`: operator-facing diagnostics semantics and triage
  - `apple-aesthetic-ui`: UI cognition and visual severity clarity

## Update-Coupling Policy

Any PR or generated change that affects one of the following must update all coupled artifacts in the same change:

1. Protocol parser/builder/dispatch changes  
   Required updates: `docs/protocol/ARTNET_COMPLIANCE_MATRIX.md` + relevant tests (`TESTS.md`/`docs/development/TESTING.md` references).
2. IPC payload/DTO/event changes  
   Required updates: `docs/IPC_API_CONTRACT.md` + frontend/backend parsing expectations.
3. Diagnostics severity/message semantics changes  
   Required updates: diagnostics standard + event catalog + troubleshooting playbook.
4. Rule/skill behavior changes  
   Required updates: source-of-truth links and ownership metadata in modified guidance assets.

## Archive and Link Stability Policy

- Follow `docs/INDEX.md` and `docs/archive/README.md`.
- Prefer move + compatibility stub instead of hard delete.
- Do not create new root-level one-off reports when a canonical docs location exists.
- Keep compatibility stubs for at least 1-2 release cycles when moving referenced docs.

## Required Metadata in Guidance Assets

For each new or changed `.cursor/rules/*.mdc` and `.cursor/skills/**/SKILL.md`:

- include purpose and explicit scope,
- include source-of-truth references,
- include trigger conditions (for skills),
- include out-of-scope boundaries (for skills),
- keep terminology consistent with canonical docs.

## Operational Principle

LumenFlow is a professional diagnostics tool. Agent-generated changes must prioritize:

- deterministic protocol correctness,
- stable high-load behavior (500+ universes),
- operator-focused clarity under failure conditions.
