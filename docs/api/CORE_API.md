# `lumenflow_core` — Rust API reference

The **`lumenflow_core`** crate is the shared Art-Net 4 engine: wire parsers and builders, UDP networking helpers, lock-free DMX universe storage, device discovery data structures, and small “engine” detectors (sync, jitter, sources).

The **desktop app** (`lumenflow_ui` / Tauri) consumes this crate; it adds IPC, UI, and discovery orchestration. This document describes **only the core crate**.

---

## 1. Functional overview

| Area | Responsibility |
|------|----------------|
| **`artnet`** | Parse incoming UDP payloads into `ArtNetPacket`; build outbound packets (`build_art_*`). The `OpCode` enum lists many spec opcodes; the **parser** implements a **subset** (see §4). Unknown wire values fail with `ParseError::UnknownOpCode` before dispatch. |
| **`network`** | `ArtNetSocket` (async UDP, large recv buffer, broadcast helpers), `build_art_poll` / `build_art_poll_targeted`, interface enumeration helpers. |
| **`buffer`** | `UniverseStore`: 32,768 pre-allocated universes (15-bit port-address), per-universe `UniverseBuffer`, `UniverseMetrics`, `SourceTracker`. |
| **`device`** | `DeviceRegistry` + `DeviceInfo`: thread-safe map keyed by `(IPv4, bind_index)` for **ArtPollReply**-derived discovery metadata. **`ArtNetProduct`** + **`ProductPort`**: `DeviceRegistry::aggregate_products()` merges binds with the same **bind IP + MAC** (fallback when `bind_ip` is `0.0.0.0`) into one physical product with a flattened port list for UI. |
| **`engine`** | Lock-free helpers: `DiscoveryConfig` / `spawn_discovery*` (ArtPoll loop + optional self-ArtPollReply), `SyncDetector`, `JitterCollector`, `DiagBuffer` (import `lumenflow_core::engine::DiagBuffer` — not re-exported at crate root), etc. |

---

## 2. Protocol patterns the core understands

### 2.1 Discovery and identity

| Pattern | Meaning (Art-Net 4) | In core |
|---------|---------------------|---------|
| **ArtPoll → ArtPollReply** | Controller polls; nodes reply with identity and port config | **Parses** both. **Sends** ArtPoll via `build_art_poll` / `build_art_poll_targeted` and discovery engine. **Builds** controller self-reply `build_our_poll_reply` and test reply `build_mock_poll_reply`. **Decodes** short/long name, MAC, IP, bind index, SwIn/SwOut → `DeviceInfo`. |
| **ArtPollReply short/long name** | Human-readable names in the reply | **Read** via `ArtPollReplyPacket::short_name_str` / `long_name_str`; not “changed” by core—devices advertise names. |
| **ArtAddress (0x6000)** | Remote programming: Net/Sub, short/long name fields, **Command** | **Parses** full packet. **Builds** with `build_art_address` and `ArtAddressCommand` (e.g. LED locate, merge mode, RDM enable flags—**per command byte**, not a full node simulator). Name fields in the builder are how a controller would **push** new names to a compliant node (actual effect depends on the receiving device). |

### 2.2 Streaming and timing

| Pattern | In core |
|---------|---------|
| **ArtDmx / ArtNzs** | **Parses** DMX and NZS frames; **builds** DMX with `build_art_dmx`. `UniverseStore::update` accepts `mark_nzs` for non-zero start code. |
| **ArtSync** | **Parses**; **builds** `build_art_sync`. `SyncDetector` records presence for UI-style indicators. |
| **ArtTimeCode / ArtTimeSync** | **Parsed** only (timecode display / sync analysis elsewhere). |

### 2.3 Diagnostics and side channels

| Pattern | In core |
|---------|---------|
| **ArtDiagData** | **Parses** header + payload blob. |
| **ArtCommand** | **Parses** text payload; **builds** with `build_art_command` (e.g. OEM-specific strings). |
| **ArtTrigger** | **Parses** / **builds**. |
| **ArtInput** | **Parses** / **builds** (controller-side input state). |
| **ArtIpProg / ArtIpProgReply** | **Parses** both; **builds** ArtIpProg (`build_art_ip_prog`). |
| **ArtDataRequest / ArtDataReply** | **Parses** both; **builds** ArtDataRequest (`build_art_data_request`). |

### 2.4 Parser limits (`UnknownOpCode` vs `Unimplemented`)

- **ArtPollReply** is handled on a **dedicated path** before the main `match` (`poll_reply::parse_poll_reply`), not via `Unimplemented`.
- Wire opcodes **not present** in `OpCode::from_u16` → `ParseError::UnknownOpCode`.
- Values **in** `OpCode` but **not** handled in the main `match` → `ParseError::Unimplemented` (inbound parse only; outbound sends do not use `ArtNetParser`).

Non-exhaustive examples of **Unimplemented** dispatch: **TodRequest, TodData, TodControl, Rdm, RdmSub**, **Media\***, **Directory\***, **Video\***, **Mac/Firmware/File\***, etc.

---

## 3. Tables — concrete call/response (Core)

| Request / event (controller → network) | Typical response (node → network) | Core: parse | Core: build send |
|----------------------------------------|-------------------------------------|-------------|------------------|
| ArtPoll `0x2000` | ArtPollReply `0x2100` | Yes | ArtPoll (and PollReply builders for tests/self-ID) |
| ArtAddress `0x6000` | *(device-dependent; not a second Art-Net opcode in spec)* | Yes | Yes |
| ArtIpProg `0xF800` | ArtIpProgReply `0xF900` | Yes | ArtIpProg only |
| ArtDataRequest `0x2700` | ArtDataReply `0x2800` | Yes | ArtDataRequest only |
| ArtDmx `0x5000` | — | Yes | Yes |
| ArtNzs `0x5100` | — | Yes | No public `build_art_nzs` in this crate |
| ArtSync `0x5200` | — | Yes | Yes |
| ArtDiagData `0x2300` | — | Yes | *(builder not in public re-exports)* |
| ArtCommand `0x2400` | — | Yes | Yes |
| ArtTrigger `0x9900` | — | Yes | Yes |
| ArtInput `0x7000` | — | Yes | Yes |
| ArtTimeCode `0x9700` | — | Yes | No |
| ArtTimeSync `0x9800` | — | Yes | No |

---

## 4. Tables — abstract patterns (Core)

| Pattern | Description |
|---------|-------------|
| **Directed broadcast discovery** | Send same ArtPoll to spec broadcast addresses (`default_spec_broadcast_targets`) plus optional subnet/custom lists. |
| **Targeted ArtPoll** | `build_art_poll_targeted(top, bottom)` restricts which port-addresses may reply (Art-Net 4). |
| **Unicast discovery** | `DiscoveryConfig.unicast_targets` for Docker/virtual links (`LUMENFLOW_DISCOVERY_TARGETS`). |
| **Controller self-announce** | Periodic ArtPoll + optional `build_our_poll_reply` unicast to own IP (see app notes for OS quirks). |
| **DMX/NZS ingest** | Single-writer per universe, atomic channels, sequence and merge tracking. |
| **Multi-source detection** | `SourceTracker` tracks up to two IPs sending to the same universe. |
| **Sync watchdog** | `SyncDetector` tracks recent ArtSync for “sync mode” signaling. |

---

## 5. Table — `build_art_*` and related public builders (Core)

Exported from `lumenflow_core` (see `src/lib.rs`):

| Function | Packet | Notes |
|----------|--------|-------|
| `build_art_poll` | ArtPoll | 18 bytes; flags `0x06`, diag priority `0x10` |
| `build_art_poll_targeted` | ArtPoll | Port-address range fields |
| `build_art_dmx` | ArtDmx | Pads to 512 channels |
| `build_art_sync` | ArtSync | 14 bytes |
| `build_art_address` | ArtAddress | Names + command |
| `build_art_command` | ArtCommand | ASCII/UTF-8 payload, max length enforced |
| `build_art_input` | ArtInput | |
| `build_art_trigger` | ArtTrigger | |
| `build_art_ip_prog` | ArtIpProg | |
| `build_art_data_request` | ArtDataRequest | |
| `build_our_poll_reply` | ArtPollReply | Controller identity |
| `build_mock_poll_reply` | ArtPollReply | Testing / CLI |

Internal modules may expose additional helpers (e.g. tests); the table above reflects the **crate root** API.

---

## 6. Primary public types (quick index)

Crate root re-exports are defined in `src/lib.rs`. Submodules may expose additional types (e.g. `ArtDataReplyHeader` under `artnet::data_request`).

- **Parsing:** `ArtNetParser`, `ArtNetPacket`, `ParseError`, `OpCode`
- **DMX / universe:** `UniverseStore`, `UniverseBuffer`, `epoch_nanos`
- **Devices:** `DeviceRegistry`, `DeviceInfo`, `PortInfo`
- **Network:** `ArtNetSocket`, `NetworkError`, `NetworkInterface`, `get_network_interfaces`, …
- **Engine (re-exported):** `DiscoveryConfig`, `spawn_discovery`, `spawn_discovery_with_config`, `parse_discovery_targets_from_env`, `JitterCollector`, `SourceTracker`, `SyncDetector`, `UniverseMetrics`, `Staleness`
- **Engine (module-only):** `DiagBuffer`, `DiagEntry`, … — use `lumenflow_core::engine::…`

For exact signatures, use `cargo doc -p lumenflow_core --open` or read `crates/lumenflow_core/src/lib.rs`.

---

## 7. Cargo features (`lumenflow_core`)

| Feature | Effect |
|---------|--------|
| `logging` (default) | Enables `tracing-subscriber` |
| `profiling` | Prometheus metrics exporters |
| `pcap-export` | Reserved placeholder (see crate source) |
| `rdm-support` | Reserved placeholder (see crate source) |

---

## Related docs

- [CLI_API.md](./CLI_API.md) — command-line tool built on this crate  
- [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — system context  
- [../development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md](../development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md) — compliance notes  
