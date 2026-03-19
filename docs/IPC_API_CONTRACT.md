# LumenFlow IPC API Contract

**Version:** 1.0.0  
**Status:** Canonical  
**Last Updated:** March 2026  
**Spec Reference:** Art-Net 4 Protocol V1.4, Revision DP (23/10/2025)

This document defines the complete contract between the Tauri/Rust backend and the Vite/SolidJS frontend for LumenFlow. It is the single source of truth for IPC design and must be followed for the entire project lifecycle.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend (SolidJS)                                                      │
│                                                                         │
│  • Viewport-culled visible universe IDs → set_active_universes          │
│  • dmx-frame event ← binary DMX data (60Hz)                             │
│  • universe-metrics event ← binary metrics (60Hz)                       │
│  • diag-entry event ← real-time diagnostics                             │
│  • timecode event ← SMPTE/EBU timecode                                   │
│  • time-sync event ← real-time clock sync                               │
│  • Commands: get_available_universes, get_devices, get_diag_entries,     │
│    send_ip_prog, request_device_url                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ IPC │
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend (Rust · Tauri)                                                  │
│                                                                         │
│  lumenflow_core: UniverseStore, DeviceRegistry, SyncDetector, DiagBuffer │
│  viewport_culler: AppState, emit loop (60Hz), UDP listener               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Design principles:**

- **Binary over JSON** for high-frequency data (DMX, metrics) to reduce serialization overhead
- **Viewport culling** — only emit data for universes currently visible in the UI
- **60Hz emit cadence** — fixed tick rate to avoid IPC thrashing
- **Commands for low-frequency** — device list, diagnostics snapshot, IP programming

---

## 2. Tauri Commands

| Command                      | Direction | Params                                       | Returns                 | Description                                                                                                                      |
| ---------------------------- | --------- | -------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `set_active_universes`       | FE → BE   | `{ ids: number[] }`                          | `void`                  | Register viewport-visible universe IDs. Call when sidebar selection, visible tabs, or scroll changes.                            |
| `get_available_universes`    | FE → BE   | —                                            | `number[]`              | Sorted list of active (initialized) 15-bit port-addresses. Poll every 1–2s when not in mock mode.                                |
| `get_devices`                | FE → BE   | —                                            | `DeviceInfoDto[]`       | Bootstrap/fallback snapshot of discovered Art-Net nodes. Use with `devices-updated` event for push-first updates.               |
| `get_diag_entries`           | FE → BE   | —                                            | `DiagEntryDto[]`        | Snapshot of diagnostic log. Used for initial load; `diag-entry` event for live updates.                                          |
| `send_ip_prog`               | FE → BE   | `IpProgParams`                               | `IpProgReplyDto`        | Send ArtIpProg unicast to target device. Read-only or programming mode.                                                          |
| `request_device_url`         | FE → BE   | `{ target_ip, esta_man, oem, request_type }` | `string`                | Fetch product/user guide/support URL via ArtDataRequest. Use `oem` (not `oem_code`) as key; value from `DeviceInfoDto.oem_code`. |
| `get_network_interfaces_cmd` | FE → BE   | —                                            | `NetworkInterfaceDto[]` | List IPv4 network interfaces (name, ip, subnet, broadcast). Used for NIC selection in Settings.                                  |
| `get_network_settings_cmd`   | FE → BE   | —                                            | `NetworkSettingsDto`    | Persisted network config (interface mode, CIDR, discovery targets).                                                              |
| `set_network_settings_cmd`   | FE → BE   | `{ settings: NetworkSettingsDto }`           | `void`                  | Persist settings and restart UDP listener/discovery. Apply on change; no separate Apply button.                                  |

---

## 3. Tauri Events

| Event              | Direction | Payload             | Frequency  | Description                                          |
| ------------------ | --------- | ------------------- | ---------- | ---------------------------------------------------- |
| `dmx-frame`        | BE → FE   | `number[]` (binary) | 60Hz       | Binary DMX data for active universes only. See §4.1. |
| `universe-metrics` | BE → FE   | `number[]` (binary) | 60Hz       | Sync status + per-universe metrics. See §4.2.        |
| `route-info`       | BE → FE   | `number[]` (binary) | ~10Hz      | Per-universe source IPs, pkt/s, lastSeen. See §4.3.  |
| `jitter-samples`   | BE → FE   | JSON `number[]`     | ~10Hz      | Inter-packet arrival intervals in ms. See §4.4.      |
| `devices-updated`  | BE → FE   | JSON `DevicesUpdatedDto` | On change (~10Hz max emit block) | Push snapshot of devices when registry version changes. |
| `diag-entry`       | BE → FE   | JSON                | On receipt | Single diagnostic message from ArtDiagData.          |
| `timecode`         | BE → FE   | JSON                | On receipt | SMPTE/EBU timecode from ArtTimeCode.                 |
| `time-sync`        | BE → FE   | JSON                | On receipt | Real-time clock sync from ArtTimeSync.               |

---

## 4. Binary Payload Formats

### 4.1 `dmx-frame`

**Format:** `[u16 LE universe_id, u16 LE length, N bytes data]` repeated for each active universe.

| Offset | Size | Field       | Endian | Description                   |
| ------ | ---- | ----------- | ------ | ----------------------------- |
| 0      | 2    | universe_id | LE     | 15-bit port-address (0–32767) |
| 2      | 2    | length      | LE     | Always 512 for full DMX       |
| 4      | 512  | data        | —      | DMX512 channel values (0–255) |

**Per-universe size:** 516 bytes.  
**Payload size:** `N × 516` bytes for N active universes.

**Note:** Backend zero-pads ArtDmx packets with Length < 512 to 512 bytes before emitting. Universe IDs must be in range 0–32767 (15-bit port-address).

**Frontend parse:** See `useDmxStream.ts` → `parseDmxFrame()`.

---

### 4.2 `universe-metrics`

**Format:** `[u8 sync_active][u32 LE sync_source_ip]` then per universe `[u16 LE id, u8 staleness, u8 source_count, u32 LE seq_errors, u8 has_nzs]`.

Header: 5 bytes. Per-record offsets (within each 9-byte universe block):

| Offset in header | Size | Field          | Values | Description                                  |
| ---------------- | ---- | -------------- | ------ | -------------------------------------------- |
| 0                | 1    | sync_active    | 0/1    | ArtSync detected on network                  |
| 1                | 4    | sync_source_ip | —      | IPv4 of sync source as u32 LE; 0 if inactive |

| Offset in record | Size | Field        | Values                            | Description                                                    |
| ---------------- | ---- | ------------ | --------------------------------- | -------------------------------------------------------------- |
| 0                | 2    | id           | —                                 | 15-bit port-address (0–32767)                                  |
| 2                | 1    | staleness    | 0=Active, 1=Stale, 2=Disconnected | See §4.2.1                                                     |
| 3                | 1    | source_count | 0–2                               | Merge sources (2+ = merge condition; SourceTracker max 2)      |
| 4                | 4    | seq_errors   | —                                 | Out-of-order packet count (u32; truncated from u64 if > 2³²−1) |
| 8                | 1    | has_nzs      | 0/1                               | Non-zero start code (ArtNzs) seen                              |

**Per-universe size:** 9 bytes.  
**Payload size:** `5 + N × 9` bytes.

**Note:** Binary payloads are serialized as JSON arrays of numbers (0–255) via Tauri events. Frontend reconstructs via `new Uint8Array(raw)`.

**Staleness thresholds:**

- **Active:** `< 1.5s` since last ArtDmx
- **Stale:** `1.5s – 4s`
- **Disconnected:** `> 4s`

**Frontend parse:** See `useUniverseMetrics.ts` → `parseUniverseMetrics()`.

---

### 4.3 `route-info`

**Format:** Per universe `[u16 LE id, u32 LE src_a_ip, u32 LE src_b_ip, u32 LE pkt_per_sec, u64 LE last_nanos]`.

Emitted at ~10 Hz (every 6th tick of the 60Hz emit loop). Source IPs are IPv4 as u32 (little-endian); 0 means no source.

| Offset | Size | Field       | Description                         |
| ------ | ---- | ----------- | ----------------------------------- |
| 0      | 2    | id          | 15-bit port-address                 |
| 2      | 4    | src_a_ip    | First source IPv4 (u32 LE)          |
| 6      | 4    | src_b_ip    | Second source IPv4 (u32 LE)         |
| 10     | 4    | pkt_per_sec | Packets per second                  |
| 14     | 8    | last_nanos  | Last update timestamp (epoch nanos) |

**Per-universe size:** 22 bytes.

**Frontend parse:** See `useRouteInfo.ts` → `parseRouteInfo()`. Each non-zero source IP produces one `RouteInfo` entry.

---

### 4.4 `jitter-samples`

**Format:** JSON array of numbers — inter-packet arrival intervals in milliseconds.

Emitted at ~10 Hz (every 6th tick of the 60Hz emit loop), in the same block as `route-info`. Aggregates inter-packet intervals across all ArtDmx/ArtNzs packets. Up to 80 samples, oldest to newest.

| Index  | Type     | Description                          |
| ------ | -------- | ------------------------------------ |
| 0..N-1 | `number` | Interval in ms since previous packet |

**Payload:** `[22.5, 23.1, 21.8, ...]` — values typically 20–25 ms for 44 Hz sources.

**Frontend parse:** See `useNetworkStats.ts` — listens to `jitter-samples` and merges into `chartStats.jitterSamples` when in real mode.

---

## 5. JSON DTOs

### 5.1 DeviceInfoDto

```typescript
interface DeviceInfoDto {
  ip_address: string; // "192.168.1.100"
  bind_ip: string; // Art-Net 4 bind/root IP
  bind_index: number; // Art-Net 4 bind page index
  port: number; // UDP port (typically 6454)
  mac_address: string; // "00:11:22:33:44:55"
  short_name: string; // Max 18 chars
  long_name: string; // Max 64 chars
  node_report: string; // Node report string from ArtPollReply
  firmware_version: number;
  ubea_version: number;
  esta_man: number; // ESTA manufacturer code
  oem_code: number;
  net_switch: number;
  sub_switch: number;
  num_ports: number;
  port_types: number[]; // raw 4-byte PortTypes
  good_input: number[]; // raw 4-byte GoodInput
  good_output: number[]; // raw 4-byte GoodOutput
  good_output_b: number[]; // raw 4-byte GoodOutputB
  sw_in: number[]; // raw 4-byte SwIn
  sw_out: number[]; // raw 4-byte SwOut
  status1: number;
  status2: number;
  status3: number;
  acn_priority: number;
  sw_macro: number;
  sw_remote: number;
  style: number;
  def_resp: string; // hex bytes
  user: string; // hex bytes
  refresh_rate: number;
  port_addresses: number[]; // Output port 15-bit addresses
  input_port_addresses: number[]; // Input port 15-bit addresses (Art-Net 4)
  online: boolean; // True if ArtPollReply within last 3s.
}
```

### 5.1a DevicesUpdatedDto

```typescript
interface DevicesUpdatedDto {
  version: number; // monotonic device registry version
  timestamp_nanos: number;
  devices: DeviceInfoDto[];
}
```

---

### 5.2 DiagEntryDto

```typescript
interface DiagEntryDto {
  timestamp_nanos: number;
  priority: number; // ArtDiagData (0x2300): 0x10=DpLow, 0x40=DpMed, 0x80=DpHigh, 0xe0=DpCritical, 0xf0=DpVolatile
  message: string;
  source_ip: string | null;
}
```

---

### 5.3 IpProgParams

Tauri 2 passes invoke arguments by **parameter name**. The Rust command is `send_ip_prog(params: IpProgParams)`, so the frontend must pass an object with key `params`:

```typescript
// Read current (read-only query)
await invoke<IpProgReplyDto>("send_ip_prog", {
  params: {
    target_ip: "192.168.1.100",
    new_ip: null,
    subnet_mask: null,
    gateway: null,
    port: null,
    enable_programming: false,
    enable_dhcp: false,
  },
});
```

```typescript
interface IpProgParams {
  target_ip: string;
  new_ip?: string;
  subnet_mask?: string;
  gateway?: string;
  port?: number;
  enable_programming: boolean;
  enable_dhcp: boolean;
}
```

---

### 5.4 IpProgReplyDto

```typescript
interface IpProgReplyDto {
  ip: string;
  subnet_mask: string;
  gateway: string;
  port: number;
  dhcp_enabled: boolean;
}
```

---

### 5.5 Timecode Event Payload

```typescript
interface TimecodePayload {
  hours: number; // 0–23
  minutes: number; // 0–59
  seconds: number; // 0–59
  frames: number; // 0–29
  timecodeType: number; // 0=Film, 1=EBU, 2=DF, 3=SMPTE
}
```

---

### 5.6 Diag-Entry Event Payload

```typescript
interface DiagEntryEventPayload {
  priority: number;
  message: string;
  sourceIp: string | null;
  timestampNanos: number;
}
```

---

### 5.7 NetworkInterfaceDto

```typescript
interface NetworkInterfaceDto {
  name: string; // OS interface name (e.g. en0, eth0)
  ip: string; // IPv4 address
  subnet?: string; // CIDR (e.g. 192.168.1.0/24), if derivable
  broadcast?: string; // Directed broadcast (e.g. 192.168.1.255), if derivable
}
```

---

### 5.8 NetworkSettingsDto

```typescript
interface NetworkSettingsDto {
  version: number;
  interface_mode: "auto" | "manual";
  preferred_ip_cidr: string; // e.g. "0.0.0.0/0" or "192.168.1.0/24"
  secondary_preferred_cidr: string | null;
  primary_nic: string | null; // Interface name or IP for manual mode
  secondary_nic: string | null;
  spec_targets: boolean; // 2.x, 10.x, loopback broadcast
  subnet_broadcast: boolean; // Include NIC subnet broadcast
  custom_broadcast_targets: string[];
  unicast_targets: string[];
}
```

---

## 6. Data Source Adapter Pattern

The frontend must support **mock** and **real** modes with a unified interface:

| Data Domain      | Mock Source                   | Real Source                              |
| ---------------- | ----------------------------- | ---------------------------------------- |
| DMX channels     | `mockData.tickMockUniverses`  | `dmx-frame` event                        |
| Universe list    | `createMockUniverses` IDs     | `get_available_universes`                |
| Universe metrics | N/A (stale/source badges)     | `universe-metrics` event                 |
| Devices          | `createMockDevices`           | `get_devices`                            |
| Sync status      | `networkStats.artSyncActive`  | `universe-metrics` sync_active           |
| Source IPs       | `networkStats.sourceIps`      | **GAP** — backend needs route/source IPs |
| Routes           | `mockUniverses` → RouteInfo   | **GAP** — backend needs route emission   |
| Diagnostics      | N/A                           | `diag-entry` + `get_diag_entries`        |
| Network stats    | `networkStats` (jitter, load) | **GAP** — backend needs network stats    |

**Identified gaps (to implement):**

1. **Route info** — `sourceIp`, `packetsPerSecond`, `lastSeen` per universe for Routing Matrix
2. **Source IPs with roles** — `master`/`backup` for SourceSyncPanel (or derive from sync source)
3. **Network diagnostics** — jitter, packet rate, load (Mbps) for NetworkDiagnostics panel

---

## 7. Frontend Contract

### 7.1 Required Hooks

| Hook                            | Purpose                                   | Events/Commands                                                                      |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `useDmxStream(activeIds)`       | DMX data store                            | `dmx-frame`, `set_active_universes`                                                  |
| `useUniverseMetrics()`          | Staleness, merge, seq errors, sync source | `universe-metrics`                                                                   |
| `useRouteInfo()`                | Route info for Routing Matrix             | `route-info`                                                                         |
| `useDiagLog()`                  | Diagnostic log                            | `diag-entry`, `get_diag_entries`                                                     |
| `useTimeCode()`                 | SMPTE/EBU timecode display                | `timecode`                                                                           |
| `useTimeSync()`                 | Real-time clock sync indicator            | `time-sync`                                                                          |
| `useNetworkSettings(panelOpen)` | NIC selection, discovery targets          | `get_network_interfaces_cmd`, `get_network_settings_cmd`, `set_network_settings_cmd` |

**Note:** Command responses use snake_case (Rust/Serde); event payloads use camelCase for frontend consistency. Diag-entry `timestampNanos` is emitted by backend; frontend may use `Date.now()` for display.

### 7.2 Active Universe Registration

```typescript
// Call whenever visible universes change
invoke("set_active_universes", { ids: number[] });
```

**Debounce:** Not required; `DashSet` is lock-free. Call on every effect run when `activeIds()` changes.

### 7.3 Data Flow

- **Universe list:** Poll `get_available_universes` every 1s when not in mock mode. Merge with `dmx-frame` to avoid stale list.
- **Devices:** Poll `get_devices` every 2s when on Devices view. Consider event-driven when `ArtPollReply` received (future).
- **Diagnostics:** Initial `get_diag_entries` on mount; `diag-entry` for live updates.

---

## 8. Backend Contract

### 8.1 AppState

```rust
pub struct AppState {
    pub universe_store: Arc<UniverseStore>,
    pub active_ids: Arc<DashSet<u16>>,
    pub device_registry: Arc<DeviceRegistry>,
    pub sync_detector: Arc<SyncDetector>,
    pub diag_buffer: Arc<DiagBuffer>,
}
```

### 8.2 Emit Loop

- **Frequency:** 60Hz (16.67ms interval)
- **Behavior:** `MissedTickBehavior::Skip` — never queue stale frames
- **Idle:** `continue` when `active_ids.is_empty()` — zero CPU cost
- **Edge case:** When active_ids is non-empty but no universe has data yet, `universe-metrics` is not emitted; frontend retains last received state.

### 8.3 UDP Listener

- **Port:** 6454 (Art-Net)
- **Bind:** Configurable via `NetworkSettingsDto`. Default `0.0.0.0:6454`; when NIC selected, binds to interface IP.
- **Packets:** ArtDmx, ArtPollReply, ArtSync, ArtDiagData, ArtTimeCode, ArtNzs, ArtTimeSync
- **Restart:** On `set_network_settings_cmd`, listener and discovery restart with new config.

---

## 9. Versioning & Compatibility

| Change Type          | Contract Version | Notes                                         |
| -------------------- | ---------------- | --------------------------------------------- |
| Add fields to DTO    | Minor            | Backward compatible; frontend ignores unknown |
| Add event            | Minor            | Frontend ignores if not subscribed            |
| Add command          | Minor            | Optional                                      |
| Remove/rename field  | Major            | Breaking; coordinate migration                |
| Change binary format | Major            | Breaking; coordinate migration                |

---

## 10. Future Extensions (Planned)

| Extension                               | Status      | Notes                                                                                                                              |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| NIC selection & IP config               | Implemented | `get_network_interfaces_cmd`, `get_network_settings_cmd`, `set_network_settings_cmd`; persisted to `{app_config_dir}/network.json` |
| `route-info` event                      | Implemented | Per-universe source IPs, pkt/s for Routing Matrix                                                                                  |
| `input_port_addresses` in DeviceInfoDto | Implemented | For routing matrix input subscriptions                                                                                             |
| `network-stats` event                   | Planned     | Jitter, load, packet rate for NetworkDiagnostics                                                                                   |
| ArtAddress command                      | Planned     | Remote node configuration                                                                                                          |
| ArtInput command                        | Planned     | Enable/disable inputs                                                                                                              |
| RDM commands                            | Planned     | Feature-gated                                                                                                                      |

---

## Appendix A: Art-Net 4 Reference

- **Port:** UDP 6454
- **Port-address:** 15-bit (Net:SubNet:Universe), 0–32767
- **DMX channels:** 512 per universe
- **ProtVer:** 14 (0x0e)
- **OpCodes:** See `.cursor/skills/spec-compliance/reference.md`
- **Terminology:** Art* and Op* names (e.g. ArtDmx/OpDmx) refer to the same packets.

---

## Appendix B: File Locations

| File                                                    | Purpose                                       |
| ------------------------------------------------------- | --------------------------------------------- |
| `crates/lumenflow_ui/src-tauri/src/viewport_culler.rs`  | Commands, emit loop, UDP listener             |
| `crates/lumenflow_ui/src-tauri/src/network_commands.rs` | Network settings commands, config persistence |
| `crates/lumenflow_ui/src-tauri/src/main.rs`             | Tauri setup, handler registration             |
| `crates/lumenflow_ui/src/hooks/useDmxStream.ts`         | DMX stream + parse                            |
| `crates/lumenflow_ui/src/hooks/useUniverseMetrics.ts`   | Metrics parse                                 |
| `crates/lumenflow_ui/src/hooks/useDiagLog.ts`           | Diag log                                      |
| `crates/lumenflow_ui/src/hooks/useTimeCode.ts`          | Timecode display                              |
| `crates/lumenflow_ui/src/hooks/useTimeSync.ts`          | Time sync indicator                           |
| `crates/lumenflow_ui/src/hooks/useRouteInfo.ts`         | Route info parse                              |
| `crates/lumenflow_ui/src/hooks/useDevices.ts`           | Device list poll                              |
| `crates/lumenflow_ui/src/hooks/useNetworkSettings.ts`   | NIC selection, discovery targets              |
| `crates/lumenflow_core/src/buffer.rs`                   | UniverseStore                                 |

---

## Appendix C: Testing Without Hardware

LumenFlow can be tested in real mode without physical Art-Net consoles or nodes using the `lumenflow_cli send` command.

### Art-Net DMX Sender

```bash
# Single universe, loopback (LumenFlow on same machine)
lumenflow send --universes 1 --target 127.0.0.1 --rate 44

# 8 universes, broadcast (LumenFlow on same or different machine)
lumenflow send --universes 8 --rate 44

# Custom pattern: sine, chase, strobe, static, gradient
lumenflow send --universes 4 --pattern chase --target 127.0.0.1
```

### Verification Steps

1. Start the sender: `lumenflow send --universes 8 --target 127.0.0.1 --rate 44`
2. Start LumenFlow (Tauri app)
3. Switch to real mode (Settings → Mock Data Mode OFF)
4. Verify: Sidebar shows universes 0–7, Dashboard heatmap shows activity, Inspector shows DMX values, Routing Matrix shows 1 tx (sender IP)

### Test Scenarios

| Scenario    | Sender                                     | LumenFlow                 | Result                             |
| ----------- | ------------------------------------------ | ------------------------- | ---------------------------------- |
| Loopback    | `lumenflow send --target 127.0.0.1`        | Same machine, real mode   | DMX appears in UI                  |
| Broadcast   | `lumenflow send`                           | Same or different machine | DMX appears                        |
| Backup mode | Two senders, same universes, different IPs | Real mode                 | Routing Matrix shows merge (2 SRC) |

### Device Discovery

Device discovery requires ArtPollReply from nodes. Without physical nodes, the Devices view will be empty in real mode. Options: use a physical Art-Net node, or external tools (sACNview, QLC+, etc.) that can respond to ArtPoll.
