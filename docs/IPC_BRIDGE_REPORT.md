# LumenFlow IPC Bridge — Design Report

**Date:** March 16, 2026  
**Author:** Senior Fullstack Architect  
**Status:** Complete

---

## Executive Summary

The complete IPC API contract for LumenFlow has been designed, documented, and integrated into the project. The contract unifies the Tauri/Rust backend and Vite/SolidJS frontend, closing the drift between mock data and real network data. All deliverables are in place and have been reviewed by subagents.

---

## Deliverables

### 1. IPC API Contract (`docs/IPC_API_CONTRACT.md`)

**Canonical reference** for the entire project lifecycle. Covers:

- **Commands (6):** `set_active_universes`, `get_available_universes`, `get_devices`, `get_diag_entries`, `send_ip_prog`, `request_device_url`
- **Events (5):** `dmx-frame`, `universe-metrics`, `diag-entry`, `timecode`, `time-sync`
- **Binary formats:** Exact layouts for `dmx-frame` (516 bytes/universe) and `universe-metrics` (9 bytes/universe)
- **JSON DTOs:** DeviceInfoDto, DiagEntryDto, IpProgParams, IpProgReplyDto, event payloads
- **Data source adapter:** Mock vs real mapping, identified gaps
- **Versioning:** Minor/major change semantics

### 2. Cursor Rule (`.cursor/rules/ipc-contract.mdc`)

Applies when editing files:

- `**/viewport_culler.rs`
- `**/useDmxStream.ts`
- `**/useUniverseMetrics.ts`
- `**/useDiagLog.ts`
- `**/main.rs`

**Rule content:** Read contract first, respect binary formats, viewport culling, 60Hz emit loop, DTO compatibility.

### 3. Cursor Skill (`.cursor/skills/ipc-api-contract/`)

- **SKILL.md:** Quick reference, commands, events, binary formats, implementation checklist
- **reference.md:** Rust/TypeScript code snippets for building and parsing payloads, known gaps

**Trigger:** When adding Tauri commands, events, binary payloads, DTOs, or bridging lumenflow_core with the frontend.

---

## Bug Fixes

### 1. Buffer Overread in `useUniverseMetrics.ts`

**Issue:** Loop condition `offset + 8 <= buf.length` allowed reading past the buffer when a record was incomplete. Each universe record is 9 bytes.

**Fix:** Changed to `offset + 9 <= buf.length` and simplified offset increment to `offset += 9`.

---

## Subagent Review Findings

### Incorporated

1. **Contract §4.2:** Clarified per-record offsets; added note about 9-byte records
2. **request_device_url:** Documented `oem` vs `oem_code` parameter key
3. **seq_errors:** Documented u32 truncation from u64
4. **Required Hooks:** Added `useTimeCode` and `useTimeSync`
5. **diag-entry:** Documented timestamp usage (backend emits; frontend may use `Date.now()`)
6. **Binary payloads:** Tauri serializes as JSON array of numbers; frontend uses `new Uint8Array(raw)`
7. **Partial DMX:** Backend zero-pads ArtDmx packets with Length < 512
8. **Port-address:** 0–32767 validation rule
9. **Appendix A:** ProtVer 14, Art* vs Op* terminology
10. **Appendix B:** Added useTimeCode.ts, useTimeSync.ts
11. **Edge case:** Empty metrics when no universes have data yet

### Disregarded

- **source_count 0–255:** SourceTracker correctly limits to 2 per Art-Net spec; 0–2 is correct.

---

## Identified Gaps (Mock vs Real)

| Gap                       | Status     | Action                                                                                                           |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **Routes**                | Documented | Add `route-info` event or derive from UniverseStore (source IP, pkt/s, lastSeen per universe) for Routing Matrix |
| **Source IPs with roles** | Documented | Derive from SyncDetector + SourceTracker or add event for SourceSyncPanel                                        |
| **Network stats**         | Documented | Add `network-stats` event (jitter, load, packet rate) for NetworkDiagnostics panel                               |
| **input_port_addresses**  | Documented | Add to DeviceInfoDto when Routing Matrix needs input subscriptions                                               |

---

## Next Steps

1. **Implement route-info:** Backend emits per-universe source IPs and pkt/s for Routing Matrix in real mode.
2. **Wire SourceSyncPanel:** Use real source IPs from `universe-metrics` or new event; currently shows empty in real mode.
3. **Network diagnostics:** Add backend aggregation for jitter/s load/rate for NetworkDiagnostics panel.

---

## File Summary

| File                                           | Purpose                     |
| ---------------------------------------------- | --------------------------- |
| `docs/IPC_API_CONTRACT.md`                     | Full IPC contract           |
| `docs/IPC_BRIDGE_REPORT.md`                    | This report                 |
| `docs/IPC_API_CONTRACT_REVIEW.md`              | Subagent review (reference) |
| `.cursor/rules/ipc-contract.mdc`               | Cursor rule                 |
| `.cursor/skills/ipc-api-contract/SKILL.md`     | Cursor skill                |
| `.cursor/skills/ipc-api-contract/reference.md` | Skill reference             |

---

## Usage

1. **Before implementing IPC changes:** Read `docs/IPC_API_CONTRACT.md`.
2. **When adding commands/events:** Use the skill `.cursor/skills/ipc-api-contract`.
3. **When editing IPC-related files:** The rule will remind you of the contract.
