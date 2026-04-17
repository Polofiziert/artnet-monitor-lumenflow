# CI/CD Workflow (Humans and Agents)

This document is the source of truth for LumenFlow CI/CD operations.

It explains:

- what runs on every PR/push
- how to run heavy checks
- how to ship a release
- what to fix in code vs what to fix in pipeline setup

## 1. Current GitHub Actions Workflows

### `ci.yml` (light PR CI, required)

Purpose: fast, deterministic quality gate for daily work.

Triggers:

- `pull_request` to `main` or `develop`
- `push` to `main` or `develop`

Main jobs:

- Rust quality: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo audit`
- Rust tests: `cargo test --workspace --all-features`
- TypeScript quality: format check, type-check, lint
- TypeScript tests: unit tests + coverage command
- Build smoke: Linux build validation (no release drafting)

This workflow must stay stable and non-flaky.

### `ci-heavy.yml` (optional heavy checks)

Purpose: expensive and/or privilege-sensitive checks not required for every PR.

Triggers:

- `pull_request` when label `ci:heavy` is present
- nightly schedule
- manual run (`workflow_dispatch`)

Jobs:

- Playwright visual regression
- Wireshark compliance
- Benchmarks

### `release.yml` (CD release builds)

Purpose: produce distributable binaries and attach them to GitHub Releases.

Triggers:

- tag push matching `v*` (for example: `v0.2.1`)
- manual run (`workflow_dispatch`)

Target matrix:

- Linux x64
- Windows x64
- macOS Intel (`x86_64-apple-darwin`)
- macOS Apple Silicon (`aarch64-apple-darwin`)

Current policy:

- unsigned release artifacts by default (open-source early stage)
- signing/notarization can be added later via secrets

## 2. Daily Development Flow

1. Create feature branch from `develop`.
2. Commit and push normally (no special commit message needed).
3. Open PR to `develop`.
4. Wait for `ci.yml` checks to pass.
5. If needed, add PR label `ci:heavy` to run heavy checks.
6. Merge when green.

Notes:

- `ci:heavy` is a PR label, not a commit message.
- GitHub uses "Pull Request" terminology. It is functionally similar to "Merge Request."

## 3. Release Flow

1. Merge `develop` into `main` via PR.
2. Ensure PR checks are green.
3. Bump versions in:
   - `package.json`
   - `Cargo.toml` workspace version
   - `crates/lumenflow_ui/src-tauri/tauri.conf.json`
4. Create and push tag on `main`, for example:
   - `v0.2.1`
5. `release.yml` runs and uploads artifacts to the GitHub Release.

Tag creation options:

- GitHub UI release page: create a new tag on `main`
- Git CLI:

```bash
git checkout main
git pull
git tag v0.2.1
git push origin v0.2.1
```

## 4. Rules for Contributors and Agents

Use this decision rule to avoid masking real issues:

- If failure is due to workflow/tooling mismatch (runner package name, deprecated action, dependency resolver mismatch), fix CI/CD config.
- If failure is due to project code behavior/type/lint/coverage policy, fix code/tests (or explicitly change policy in a separate, reviewed decision).

Do not silence rightful failures by default.

Examples:

- CI setup issue: runner cannot install a package due to Ubuntu image change.
- Rightful code issue: TypeScript type mismatch in component tests.
- Rightful quality gate: coverage below required threshold.

## 5. Troubleshooting Quick Reference

### `pnpm/action-setup` version mismatch

Symptom:

- multiple pnpm versions specified between workflow and `packageManager`

Fix:

- keep workflow pnpm version aligned with `package.json` `packageManager`

### Linux Tauri dependency errors (`glib-sys`, `gobject-sys`)

Symptom:

- missing GTK/WebKit pkg-config packages

Fix:

- ensure Linux apt dependencies in workflow include:
  - `pkg-config`
  - `libgtk-3-dev`
  - `libwebkit2gtk-4.1-dev`
  - `libayatana-appindicator3-dev`
  - `librsvg2-dev`
  - `patchelf`

### macOS release fails due to keychain import

Symptom:

- codesign/keychain import failure when no certs configured

Fix:

- keep release workflow unsigned by default unless signing secrets are intentionally configured

### Vitest coverage crashes

Symptom:

- coverage plugin runtime mismatch errors

Fix:

- align `vitest` and `@vitest/coverage-v8` major/minor versions

## 6. Contributor Checklist

Before opening PR:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
pnpm run format:check
pnpm run type-check
pnpm run test
```

Before release tag:

- all required PR checks green
- version bump completed in all versioned files
- release notes drafted
