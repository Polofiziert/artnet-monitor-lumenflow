# Documentation Index

This index defines the documentation source-of-truth model for LumenFlow and provides a stable map during cleanup and future releases.

## Canonical Documents (Authoritative)

- Protocol normative source: `docs/art-net4.txt`
- Protocol implementation guidance: `docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md`
- IPC contract: `docs/IPC_API_CONTRACT.md`
- Architecture: `docs/architecture/ARCHITECTURE.md`
- Testing policy: `TESTS.md`
- Testing execution guide: `docs/development/TESTING.md`
- Project constraints and engineering standards: `PROJECT_INSTRUCTIONS.md`

## Active Documents

- Active gap tracker this cycle: `docs/development/ARTNET_SPEC_ASSESSMENT.md`
- Developer setup: `docs/development/SETUP.md`
- Developer workflow: `docs/development/GUIDE.md`
- API docs: `docs/api/`
- Deployment docs: `docs/deployment/`
- User manual: `docs/user-manual.md`

## Historical and Archived Documents

Historical analyses, status reports, and one-time implementation artifacts should live under `docs/archive/` and are non-canonical.

See `docs/archive/README.md` for archive rules and migration buckets.

## Link Stability Policy

- Prefer move + compatibility stub over hard delete.
- Keep compatibility stubs for at least 1-2 release cycles.
- Update references in `README.md`, scripts, and contributor docs in the same cleanup change.
- Do not move canonical protocol and contract docs without explicit migration mapping.
