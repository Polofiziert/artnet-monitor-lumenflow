# 🧪 LumenFlow Test Suite Implementation

Complete test infrastructure based on industrial standards. This document describes all test types and how to run them.

## Quick Start

```bash
# Run all tests
pnpm run test:all

# Run specific test suites
cargo test --all                    # Rust unit tests
pnpm run test                       # TypeScript unit tests
pnpm run test:ui                    # Playwright UI tests
pnpm run test:wireshark             # Art-Net wire-format compliance (requires tshark)
cargo test --test 'network_*'       # Chaos simulation
cargo test --test 'loom_*'          # Concurrency verification
pnpm run test:fuzz                  # Fuzzing (requires cargo-fuzz)
```

## 0. Network Testing, by hand

DMX-Workshop is a tool provided by the developer of the Art-Net 4 Spec. It can be used to have a reliable artnet device in the network.

DMX-Workshop only runs ons Windows :(

To make DMX-Workshop reply to ArtPollReplys you need to open the Data Monitor, or else it wont reply to ArtPolls.

## 1. Rust Backend Testing

### Unit Tests

Located in `src/**/*_test.rs` and `#[cfg(test)]` modules.

```bash
cargo test -p lumenflow_core
cargo test -p lumenflow_cli
cargo test -p lumenflow_ui
```

### Integration Tests

Located in `tests/integration/`. Full pipeline testing.

```bash
cargo test --test '*' --release
```

### Concurrency Testing (Loom)

Verifies that lock-free structures behave correctly under all memory orderings.

```bash
cargo test --test 'loom_tests' --release
```

**What it tests:**

- Ring buffer concurrent access patterns
- Atomic operations correctness
- Race condition detection

### Chaos Simulation

Simulates real network conditions (packet loss, jitter, reordering).

```bash
cargo test --test 'network_simulation' --release
```

**Scenarios covered:**

- 5-20% packet drop rate
- 1-500ms jitter injection
- Out-of-order delivery (10% chance)
- Flicker detection accuracy

### Property-Based Testing

Uses `proptest` to generate massive variations of inputs.

```bash
cargo test --test 'property_based_tests' -- --nocapture
```

**Coverage:**

- Art-Net packet headers (all valid field combinations)
- Edge cases (min/max values, boundaries)
- Cross-platform byte ordering

### Fuzzing (if libfuzzer installed)

```bash
cargo install cargo-fuzz
cargo fuzz run artnet_dmx_parser

# Results stored in: crates/lumenflow_core/fuzz/artifacts/
```

**Fuzzing targets:**

- `artnet_dmx_parser` - General parser robustness
- `artnet_header` - Header validation

---

## 2. Frontend Testing

### Unit Tests (Vitest)

SolidJS component logic testing.

```bash
pnpm run test              # Run once
pnpm run test:watch        # Watch mode
pnpm run coverage          # Coverage report
```

**Coverage targets:**

- Stores: 80%+
- Components: 70%+
- Hooks: 85%+
- Theme: `crates/lumenflow_ui/src/lib/theme.test.ts` (effective theme resolution, canvas palette helpers)

**Manual checks (Appearance):**

- Settings → Appearance → Theme: Dark, Light, or System; choice persists across restart.
- Reload the app: no obvious flash of the wrong theme before the saved preference applies.
- Light mode: universe heatmap, channel grid canvas, and Network Diagnostics charts stay legible (including in bright ambient light).

**Native OS menu (manual QA):**

- **macOS:** **View** and **Help** appear in the menu bar; **Help** is the designated help menu (system search field may appear). **View →** items switch tabs; **Settings…** opens the panel; accelerators **⌘1–⌘4**, **⌘,**, **⌘K** match in-app behavior.
- **Windows / Linux:** Same entries on the window menu; accelerators use **Ctrl** instead of **⌘**.
- **Help → Art-Net 4 Specification…** opens the default browser to the spec URL (`shell` `open`).
- Unit: `crates/lumenflow_ui/src/lib/menuEvents.test.ts` (`isMenuPayload`).

### UI Visual Regression (Playwright)

Pixel-perfect screenshot testing.

```bash
pnpm run test:ui            # Run tests
pnpm run test:ui:headed     # See browser
pnpm run test:ui:debug      # Debug mode
pnpm run test:ui:update     # Update golden screenshots

# Test results stored in: test-results/
# Screenshots: test-results/*/
```

**Test categories:**

- **Component rendering:** Universe Map, Channel Inspector, Routing Matrix
- **State synchronization:** DMX values sync from backend to UI
- **Performance:** 60 FPS during packet storms
- **Accessibility:** Keyboard navigation, screen reader compat

**Visual regression tests verify:**

- Exact pixel matches (with 0.5% tolerance)
- Cross-platform consistency (Windows, macOS, Linux)
- Responsive layout (mobile to 4K)

### Devices Tab D3/D5 Checklist

Use this checklist after changes to compact cards, detail tabs, or device sync performance.

```bash
# Backend compile + unit test for DeviceInfoDto mapping
cargo test -p lumenflow_ui maps_device_info_to_frontend_dto -- --nocapture

# Frontend smoke (if jsdom is installed)
pnpm run test
```

Manual verification:

- Devices list shows compact summary cards and filter chips (`all/online/offline/manual/warnings`).
- Selecting a card opens a stable detail panel with tabs: `overview`, `ports`, `diagnostics`, `comms`, `protocol`.
- `comms` tab only shows log entries for selected `sourceIp`.
- Warm open path: switch away/back to Devices view and confirm list appears instantly from cache.
- Visibility gating: with Devices/Routing hidden, confirm no 2s `get_devices` polling loop.
- Push path: when new ArtPollReply arrives, confirm frontend updates via `devices-updated` without waiting for poll.

---

## 3. Performance Testing

### Benchmarks (Criterion)

Measures throughput and latency.

```bash
pnpm run perf:bench         # Run all benchmarks
cargo bench -p lumenflow_core
cargo bench --bench parser_performance
```

**Benchmarks included:**

- DMX parser latency
- Ring buffer operations
- Concurrent 500-universe read
- UI rendering frame time

### Load Testing

Generates 500+ universes of simulated Art-Net traffic.

```bash
# Manual: Run LumenFlow + external Art-Net generator
lumenflow --gen-artnet --universe-count 500 --framerate 44 &
# Monitor: lumenflow --stats
```

---

## 3a. Virtual Art-Net Scripts (Hardware-Free Testing)

Virtual console and node scripts enable testing LumenFlow without physical Art-Net hardware. Traffic is Wireshark-capturable.

### Virtual Console

Sends ArtDmx and responds to ArtPoll (identifies as a controller).

```bash
# Basic: 8 universes, 44 Hz, loopback
cargo run -p lumenflow_cli -- virtual-console --target 127.0.0.1

# Merge test: bind to different IPs (add loopback aliases first)
sudo ifconfig lo0 alias 127.0.0.2
sudo ifconfig lo0 alias 127.0.0.3
cargo run -p lumenflow_cli -- virtual-console --name "Desk A" --ip 127.0.0.2 --bind 127.0.0.2:0 &
cargo run -p lumenflow_cli -- virtual-console --name "Desk B" --ip 127.0.0.3 --bind 127.0.0.3:0 &
```

### Virtual Node

Receives ArtDmx and responds to **ArtPoll** only (like real gear). Optional `--periodic-poll-reply` unicasts PollReply to `--target` for lab discovery without a poller. Use `--port 6455` when LumenFlow runs on the same machine.

```bash
cargo run -p lumenflow_cli -- virtual-node --port 6455 --target 127.0.0.1
```

### Spawn Virtual Network

Spawns multiple consoles and nodes from config:

```bash
./scripts/spawn-virtual-network.sh
# or with custom config:
./scripts/spawn-virtual-network.sh scripts/virtual-network.yaml
```

Config: `scripts/virtual-network.yaml`. Install `yq` for full YAML parsing; otherwise uses defaults (2 consoles, 1 node).

### Docker Virtual Network

Run virtual consoles and nodes in Docker for real ArtPoll call-and-response. No loopback aliases required.

Compose uses a **bridge network** `10.0.0.0/24` with static container IPs (`10.0.0.10`, `10.0.0.11`, `10.0.0.20`). Host ports **6455–6457** map to UDP **6454** in each container so LumenFlow on the host can **unicast** `ArtPoll` to `127.0.0.1:6455` etc. This is a **unicast-mapped** profile: subnet broadcast from the host does not reach container sockets unless you add extra routing or a LAN-like network mode.

**Discovery targets** are centralized in `[scripts/virtual-network.ports.env](../../scripts/virtual-network.ports.env)`. `pnpm run dev:docker` sources that file (when present) and sets `LUMENFLOW_DISCOVERY_TARGETS`.

**Terminal 1** — Start virtual network:

```bash
docker compose -f docker-compose.virtual-network.yml up
# or (default project name lumenflow-vn):
./scripts/spawn-virtual-network.sh --docker
# detached:
./scripts/spawn-virtual-network.sh --docker --detach
# pass-through to compose:
./scripts/spawn-virtual-network.sh --docker -- --build
```

Stop: `docker compose -f docker-compose.virtual-network.yml down`

The **node** service runs `virtual-node --profile swisson-xnd8` (eight `ArtPollReply` binds, `ArtTod`\* / narrow `ArtRdm` / `ArtIpProgReply` stubs). Consoles use `--sync-target 10.255.255.255:6454` so **ArtSync** follows each DMX batch (DMXW_02-style directed broadcast).

**Terminal 2** — Run LumenFlow with discovery targets:

```bash
pnpm run dev:docker
```

Or manually: `LUMENFLOW_DISCOVERY_TARGETS=127.0.0.1:6455,127.0.0.1:6456,127.0.0.1:6457 pnpm run dev`

**Linux:** ensure `host.docker.internal` resolves (Docker 20.10+); otherwise add `extra_hosts` or point `--target` at the host gateway.

**Real operation (unchanged):** `pnpm run dev` — no env var, discovery uses broadcast only.

### Wireshark Capture

#### Non-Docker (loopback)

1. Start Wireshark, select interface `lo0`, filter: `udp.port == 6454`
2. Run `./scripts/test-real-mode.sh` or `./scripts/spawn-virtual-network.sh`
3. Start LumenFlow, switch to real mode
4. Save capture for consultation

#### Docker Virtual Network

On macOS (Docker Desktop), container traffic is not visible on host interfaces due to VPNKit. Use tcpdump inside a container sharing the network namespace:

**macOS (Docker Desktop):**

```bash
# 0. Create wireshark dir if needed: mkdir -p wireshark

# 1. Start virtual network
docker compose -f docker-compose.virtual-network.yml up -d

# 2. Get console-a container name
CONTAINER=$(docker ps --format '{{.Names}}' | grep console-a | head -1)

# 3. Capture from inside container (shares its network namespace)
docker run --rm -v "$(pwd)/wireshark:/out" --network container:$CONTAINER \
  nicolaka/netshoot tcpdump -i eth0 -s 0 -w /out/artnet_docker.pcap udp port 6454
```

Run while using LumenFlow, then Ctrl+C and open `wireshark/artnet_docker.pcap` in Wireshark.

**Linux (native Docker):**

```bash
docker compose -f docker-compose.virtual-network.yml up -d
sudo tcpdump -i docker0 -s 0 -w artnet_docker.pcap udp port 6454
```

#### Capture and display filters

| Filter                                  | Purpose                    |
| --------------------------------------- | -------------------------- |
| Capture: `udp port 6454`                | Art-Net default port       |
| Capture: `udp portrange 6454-6457`      | All LumenFlow Docker ports |
| Display: `udp.port == 6454` or `artnet` | Wireshark                  |

### Test Scenarios

| Scenario             | Setup                                                                                     | LumenFlow Verification           |
| -------------------- | ----------------------------------------------------------------------------------------- | -------------------------------- |
| Single source        | 1 virtual console                                                                         | Routing Matrix: 1 tx, correct IP |
| Merge (2 SRC)        | 2 consoles, same universes, different --physical (or different IPs with loopback aliases) | Routing Matrix: "2 SRC" badge    |
| Device discovery     | 1 virtual node                                                                            | Devices view: node appears       |
| Stale → Disconnected | Console runs, then stop                                                                   | Universe goes amber → red        |

---

## 3b. Wireshark Compliance Validation

Validates that LumenFlow's Art-Net packet builders produce wire-format compliant packets by capturing traffic and verifying Wireshark's Art-Net dissector parses them without "Malformed" errors.

### Manual workflow (Option A)

1. Start Wireshark, select interface `lo0` (macOS) or `lo` (Linux), display filter: `udp.port == 6454`
2. Run `cargo run -p lumenflow_cli -- send-all-packets --target 127.0.0.1`
3. Stop capture, save as `wireshark/artnet_manual_check.pcap`
4. Verify: no "Malformed" packets; each packet shows correct Art-Net protocol tree in the dissection pane

### Automated script (Option B)

```bash
pnpm run test:wireshark
# or directly:
./scripts/wireshark-compliance-test.sh
```

- Exit 0 = pass (all packets dissected successfully)
- Exit 1 = malformed packets detected; open the generated pcap in Wireshark and filter by `_ws.malformed` to inspect

**Requirements:** `tcpdump` and `tshark` (Wireshark CLI). On macOS: `brew install wireshark`. Capture may require `sudo` on some systems; if the script fails with "permission denied", try `sudo ./scripts/wireshark-compliance-test.sh`.

**Interpretation:** Wireshark's Art-Net dissector is an independent reference. If it marks packets as malformed, the wire format likely violates the Art-Net 4 spec.

**Detection method:** The script uses two checks because the `_ws.malformed` display filter is not always set when sub-dissectors (e.g. Art-Net) throw exceptions. A fallback greps the verbose protocol tree for `[Malformed Packet`, which matches what the Wireshark GUI displays. Either method triggers a failure.

**Negative test:** If `wireshark/artnet_malformed_negative.pcap` exists, the script verifies that detection would flag it (sanity check). Create it with: `python3 scripts/create-malformed-negative-pcap.py`

---

## 4. CI/CD Pipeline

LumenFlow uses a split pipeline model:

- **Light required checks** (`.github/workflows/ci.yml`) for every PR/push to `main` and `develop`
- **Heavy optional checks** (`.github/workflows/ci-heavy.yml`) via `ci:heavy` label, schedule, or manual run
- **Release builds** (`.github/workflows/release.yml`) on version tags (`v*`)

This design keeps day-to-day CI deterministic while preserving deep validation for release confidence.

For exact workflow behavior and release steps, see:

- [`docs/development/CI_CD_WORKFLOW.md`](./CI_CD_WORKFLOW.md)

---

## 5. Test Data & Fixtures

### Mock Art-Net Packets

Located in `tests/fixtures/artnet_packets.json`

```rust
// Example usage in tests
#[test]
fn test_valid_packet_parsing() {
    let packet = include_bytes!("../fixtures/valid_dmx.bin");
    let result = ArtNetParser::parse(packet);
    assert!(result.is_ok());
}
```

### Golden Screenshots

Visual regression baseline screenshots stored in:

```
tests/ui/specs/__screenshots__/
├── universe-map.png
├── channel-inspector.png
├── routing-matrix.png
└── ...
```

Update when intentional UI changes made:

```bash
pnpm run test:ui:update
```

---

## 6. Debugging Failed Tests

### Rust Test Debugging

```bash
# Verbose output
RUST_BACKTRACE=full cargo test -- --nocapture

# Run single test
cargo test test_parser_basic -- --exact --nocapture

# Run with logging
RUST_LOG=debug cargo test -- --nocapture
```

### TypeScript Test Debugging

```bash
# Debug in browser
pnpm run test:ui:debug

# Run single story
pnpm run test 'ChannelInspector'

# Watch + update snapshots
pnpm run test:watch -- -u
```

### Playwright Test Debugging

```bash
# Open Playwright Inspector
pnpm run test:ui:debug

# Inspect single test
pnpm exec playwright test -g "Universe Map"

# View test trace
pnpm exec playwright show-trace test-results/trace.zip
```

---

## 7. Coverage Reports

### Generate and View Coverage

```bash
# Rust
cargo tarpaulin --out Html  # Creates coverage.html

# TypeScript
pnpm run coverage           # Creates coverage/index.html
```

**Coverage requirements:**

- Overall: 80% minimum
- Hot paths (network RX): 95%+
- UI components: 70%+
- Libraries: 85%+

Failing coverage check blocks merge.

---

## 8. Performance Baselines

Measured on reference machine (MacBook Pro 14" M3):

| Metric                 | Target         | Current |
| ---------------------- | -------------- | ------- |
| Parser latency         | <1µs           | ✓ 0.8µs |
| Ring buffer op         | <100ns         | ✓ 45ns  |
| 500 universe read      | <10ms          | ✓ 8.2ms |
| UI frame time          | <16ms (60 FPS) | ✓ 14ms  |
| Memory (500 universes) | <50MB          | ✓ 42MB  |

Regressions > 5% fail CI.

---

## 9. Test Maintenance

### Adding New Tests

1. **Decide test type:**

- Bug? → Add regression test alongside fix
- Feature? → Test-first (write test before code)
- Refactor? → Ensure existing tests still pass

2. **Follow guidelines:**

- `#![deny(clippy::unwrap_used)]` - no panics
- All Result types handled
- Deterministic (no randomness except in fuzz)
- Document why test exists (not just how)

3. **Example:**

```rust
 #[test]
 fn test_artaddress_packet_generation() {
     // Arrange
     let device = Device::new("192.168.1.100", 1);

     // Act
     let packet = device.generate_artaddress_packet(0, 0).unwrap();

     // Assert
     assert_eq!(packet[0..8], *b"Art-Net\0");
     assert_eq!(packet[8..10], [0x60, 0x00]); // ArtAddress opcode
 }
```

### Updating Visual Baselines

After intentional UI changes:

```bash
git checkout develop           # Switch to latest baseline
pnpm run test:ui:update       # Update screenshots
git add test-results/
git commit -m "chore: update ui baselines"
git checkout your-branch
```

---

## 10. Continuous Improvement

### Weekly Metrics Review

- Test execution time (target: <5 min)
- Flakiness rate (target: 0%, alert > 2%)
- Coverage trends

### Quarterly Audits

- Remove outdated tests
- Consolidate redundant tests
- Add tests for new edge cases

---

**For detailed implementation, see [TESTS.md](../TESTS.md)**

**Questions?** See [CONTRIBUTING.md](../CONTRIBUTING.md#testing-requirements) for testing guidelines.
