---
name: ipc-api-contract
description: Implement and extend the LumenFlow Tauri IPC API between Rust backend and SolidJS frontend. Use when adding Tauri commands, events, binary payload formats, DTOs, viewport culling, or bridging lumenflow_core with the frontend.
---

# LumenFlow IPC API Contract

## Canonical Reference

**Always read** `docs/IPC_API_CONTRACT.md` before implementing or changing IPC. It defines the complete contract.

## Quick Reference

### Commands (FE → BE)

| Command                   | Params                                       | Returns           |
| ------------------------- | -------------------------------------------- | ----------------- |
| `set_active_universes`    | `{ ids: number[] }`                          | void              |
| `get_available_universes` | —                                            | `number[]`        |
| `get_devices`             | —                                            | `DeviceInfoDto[]` |
| `get_diag_entries`        | —                                            | `DiagEntryDto[]`  |
| `send_ip_prog`            | `IpProgParams`                               | `IpProgReplyDto`  |
| `request_device_url`      | `{ target_ip, esta_man, oem, request_type }` | `string`          |

### Events (BE → FE)

| Event              | Payload                                                                              | Frequency  |
| ------------------ | ------------------------------------------------------------------------------------ | ---------- |
| `dmx-frame`        | Binary: `[u16 id, u16 len, 512 bytes]` per universe                                  | 60Hz       |
| `universe-metrics` | Binary: `[u8 sync]` + `[u16 id, u8 staleness, u8 src, u32 seq, u8 nzs]` per universe | 60Hz       |
| `diag-entry`       | JSON                                                                                 | On receipt |
| `timecode`         | JSON                                                                                 | On receipt |
| `time-sync`        | JSON                                                                                 | On receipt |

### Binary: dmx-frame

Per universe: 2 + 2 + 512 = 516 bytes. Little-endian for multi-byte fields.

```
[u16 LE universe_id][u16 LE length][512 bytes DMX data]
```

### Binary: universe-metrics

Header: 1 byte sync_active. Per universe: 2 + 1 + 1 + 4 + 1 = 9 bytes.

```
[u8 sync_active][u16 id, u8 staleness, u8 source_count, u32 seq_errors, u8 has_nzs]...
```

Staleness: 0=Active (<1.5s), 1=Stale (1.5–4s), 2=Disconnected (>4s).

## Implementation Checklist

- [ ] New commands: Add to `main.rs` `invoke_handler`, implement in `viewport_culler.rs`
- [ ] New events: Emit from UDP listener or emit loop; document in contract
- [ ] Binary changes: Update contract first; coordinate FE parse + BE build
- [ ] DTO changes: Add fields (backward compatible); document in contract

## File Locations

| File                                                   | Purpose             |
| ------------------------------------------------------ | ------------------- |
| `docs/IPC_API_CONTRACT.md`                             | Full contract       |
| `crates/lumenflow_ui/src-tauri/src/viewport_culler.rs` | Commands, emit loop |
| `crates/lumenflow_ui/src/hooks/useDmxStream.ts`        | DMX parse           |
| `crates/lumenflow_ui/src/hooks/useUniverseMetrics.ts`  | Metrics parse       |
