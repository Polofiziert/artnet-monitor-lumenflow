# Archive Policy

This folder contains historical documentation that is useful for forensics and context but is not authoritative for current implementation.

## Archive Buckets

- `docs/archive/reports/` for status and readiness reports
- `docs/archive/plans/` for one-time implementation plans
- `docs/archive/rca/` for root-cause analyses and incident writeups
- `docs/archive/agent-artifacts/` for prompt/result artifacts

## Rules

- Archived documents must include a short header:
  - `Status: Archived`
  - `Canonical source:` path to the current source of truth (if any)
  - `Archived in release:` version marker
- Archived files must not override canonical documents.
- New implementation work must reference canonical docs from `docs/INDEX.md`.
