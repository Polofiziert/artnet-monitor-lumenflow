# LumenFlow Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- No unreleased changes

## [0.2.0-alpha] - 2026-03-15

### Added

#### Backend (Rust)

- Art-Net 4 zero-copy parser: OpDmx, OpPoll, OpPollReply, OpSync, OpAddress (zerocopy)
- ArtPoll broadcast sender (2.5s interval) for active device discovery
- UniverseStore with lock-free AtomicU8 buffers and DashMap
- DeviceRegistry for tracking discovered Art-Net nodes
- ArtNetSocket with SO_REUSEADDR, SO_BROADCAST, 8MB recv buffer
- Viewport-culled 60Hz binary IPC emit loop
- 15-bit port-address (Net:Sub-Net:Universe) decoding

#### Frontend (SolidJS)

- Channel Inspector with 512-channel grid, sparkline history, detail panel
- Universe Map with heatmap activity coloring and radial glow
- Routing Matrix with sortable columns, source IP, pkt/s, stale detection
- Device List with expandable accordion cards and port-address decoding
- Mock data provider with 8 DMX patterns (sine, chase, strobe, flicker, etc.)
- HeaderBar with search, connection status, settings button
- StatusBar with packet rate, universe count, MOCK mode badge
- Settings panel with mock toggle, grid columns, emit rate slider
- Toast notification system with auto-dismiss
- Error boundary with retry functionality
- Keyboard shortcuts (1/2/3 view switch, Escape, Cmd+K search)
- Loading skeleton for channel data
- Connection state tracking (connecting/connected/disconnected)
- Channel history buffer (64 samples per channel, Float32Array)
- Canvas-based Sparkline component with HiDPI support
- data-testid attributes on all key elements for Playwright

#### CLI

- `lumenflow listen` — monitor Art-Net traffic with --universe and --json filters
- `lumenflow poll` — broadcast ArtPoll and discover devices with --timeout
- `lumenflow info` — show version, protocol info, and network interfaces

#### Testing

- 30 unit tests for parser, buffer, device, network
- 10 integration tests (parse-to-store pipeline, device registry, viewport culling)
- 6 property-based tests with proptest (fuzzing, round-trips, rejection)
- Fuzz targets for DMX parser and header

#### Infrastructure

- Pro-Lab dark aesthetic (Tailwind CSS design tokens)
- Custom scrollbar styling, toast animations
- Tauri 2 window drag region support

## [0.1.0] - 2025-03-15

### Added

- Project initialization
- Core architecture design
- Development environment setup
- Documentation structure
- Build and deployment infrastructure

---

## Release Versions

### Pre-Release Versions

- `0.1.x`: Alpha - Core architecture validation
- `0.2.x`: Beta - Feature completeness
- `0.3.x`: Release Candidate - Stability testing

### Stable Versions

- `1.0.0`: Production Ready
- `1.1.x`: Bug fixes and minor features
- `2.0.0`: Major architectural changes

---

## Migration Guides

### Upgrading to 0.2.0

- Config file format unchanged
- Layouts backward compatible
- No data migration needed

### Upgrading to 1.0.0

- Breaking: Configuration directory moved to ~/.lumenflow/
- Migrate: Run `lumenflow --migrate-config` automatically on first launch
- New feature: Export/import workspaces

---

**Note:** Version history prior to 0.1.0 available at [PROJECT_INSTRUCTIONS.md](PROJECT_INSTRUCTIONS.md).
