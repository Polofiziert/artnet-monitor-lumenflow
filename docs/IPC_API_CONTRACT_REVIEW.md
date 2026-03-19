# LumenFlow IPC API Contract — Critical Review Report

**Review Date:** March 16, 2026  
**Reviewed Against:** `docs/IPC_API_CONTRACT.md` v1.0.0  
**Implementation Files:** `viewport_culler.rs`, `useDmxStream.ts`, `useUniverseMetrics.ts`, `useDiagLog.ts`, `main.rs`

---

## CRITICAL: Must-Fix Issues

### 1. Buffer Overread in `parseUniverseMetrics()` — useUniverseMetrics.ts

**Location:** `crates/lumenflow_ui/src/hooks/useUniverseMetrics.ts`, lines 34–41

**Issue:** The loop condition `offset + 8 <= buf.length` allows iteration when only 8 bytes remain for a record. The per-universe record is **9 bytes** (id:2 + staleness:1 + source_count:1 + seq_errors:4 + has_nzs:1). When `buf.length === 10` (1 sync + 9 for one universe), `offset = 1`, and `offset + 8 = 9 <= 10` — we enter. We then read `buf[offset + 8]` = `buf[9]` for `has_nzs`. That is valid. But when `buf.length === 9` (incomplete record), `offset + 8 = 9 <= 9` still enters the loop, and `buf[9]` is **out of bounds** (valid indices 0..8).

**Fix:** Change the loop condition from `offset + 8 <= buf.length` to `offset + 9 <= buf.length`:

```typescript
while (offset + 9 <= buf.length) {
```

**Secondary fix:** The offset increment logic `offset += offset + 9 <= buf.length ? 9 : 8` is defensive but confusing. After fixing the loop condition, we always have 9 bytes available, so simplify to `offset += 9`.

---

### 2. Contract §4.2 Offset Table Error

**Location:** `docs/IPC_API_CONTRACT.md`, lines 91–98

**Issue:** The offset table lists per-universe fields with absolute offsets (1, 3, 4, 5, 9) but does not clarify that these are **per-record** offsets. The table reads as if `id` is at offset 1 (correct for first record), but `staleness` at offset 3, `source_count` at 4, etc. are correct only for the **first** universe. For the second universe, `id` would be at offset 10, not 1. This can mislead implementers.

**Fix:** Add a note: _"Offsets shown are for the first universe record. Each subsequent record starts 9 bytes after the previous record's start."_ Or restructure the table to show "Offset within record" (0–8) vs "Offset in payload" (1 + n×9, etc.).

---

## HIGH: Important Improvements

### 3. `request_device_url` Parameter Documentation

**Location:** `docs/IPC_API_CONTRACT.md`, line 53

**Issue:** The contract documents params as `{ target_ip, esta_man, oem, request_type }`. The Rust command uses `oem` (not `oem_code`). The frontend correctly passes `oem: device.oem_code` in `DeviceList.tsx`. The contract should explicitly state that the key is `oem` to avoid confusion with `DeviceInfoDto.oem_code`.

**Fix:** Add: _"Note: Use `oem` (not `oem_code`) as the parameter key; value typically comes from `DeviceInfoDto.oem_code`."_

---

### 4. `seq_errors` Truncation (u64 → u32)

**Location:** `viewport_culler.rs` line 324; `docs/IPC_API_CONTRACT.md` §4.2

**Issue:** `UniverseStore::slot_metrics` returns `seq_errors` as `u64` (`crates/lumenflow_core/src/buffer.rs`), but the emit loop casts to `u32` for the binary payload:

```rust
metrics_payload.extend_from_slice(&(seq_errors as u32).to_le_bytes());
```

The contract specifies `u32 LE`. Values above 2³²−1 will be truncated. For long-running monitoring, this could matter.

**Fix:** Either (a) document the truncation in the contract, or (b) extend the binary format to u64 for `seq_errors` (breaking change; would require contract version bump).

---

### 5. Missing Hooks in §7.1 Required Hooks Table

**Location:** `docs/IPC_API_CONTRACT.md`, lines 207–213

**Issue:** The table lists only `useDmxStream`, `useUniverseMetrics`, and `useDiagLog`. The codebase also has `useTimeCode` and `useTimeSync`, which consume `timecode` and `time-sync` events. These are part of the IPC surface.

**Fix:** Add rows for `useTimeCode` and `useTimeSync` to the Required Hooks table, or add a separate "Optional Hooks" subsection.

---

### 6. Diag-Entry Event: `timestampNanos` Not Used by Frontend

**Location:** `docs/IPC_API_CONTRACT.md` §5.6; `useDiagLog.ts` lines 69–80

**Issue:** The contract documents `DiagEntryEventPayload` with `timestampNanos`, and the backend emits it. The frontend `useDiagLog` does not consume `timestampNanos`; it uses `Date.now()` as `receivedAt`. This can cause ordering/display inconsistencies if the backend timestamp is intended as canonical.

**Fix:** Either (a) document that the frontend may use local `Date.now()` for display, or (b) update `useDiagLog` to use `event.payload.timestampNanos` when present for consistency.

---

## GOOD: What Works Well

1. **Binary format alignment** — The `dmx-frame` format (u16 universe_id, u16 length, 512 bytes data) matches the implementation. `parseDmxFrame()` in `useDmxStream.ts` correctly uses `DataView` with little-endian.

2. **Command registration** — All six commands documented in §2 are registered in `main.rs` and invoked correctly from the frontend.

3. **Event emission** — All events (`dmx-frame`, `universe-metrics`, `diag-entry`, `timecode`, `time-sync`) are emitted from `viewport_culler.rs` with payloads matching the contract.

4. **DTOs** — `DeviceInfoDto`, `DiagEntryDto`, `IpProgParams`, `IpProgReplyDto` match the Rust structs. `source_ip` is correctly `Option<String>` → `string | null` in JSON.

5. **Data source adapter pattern** — §6 correctly identifies mock vs real sources and documents gaps (route info, source IPs, network stats).

6. **AppState structure** — §8.1 matches `viewport_culler.rs` exactly.

7. **Emit loop behavior** — 60Hz, `MissedTickBehavior::Skip`, idle when `active_ids.is_empty()` — all as specified.

8. **Versioning strategy** — §9 is clear and appropriate for minor/major changes.

---

## SUGGESTIONS: Optional Enhancements

### A. Document Tauri Serialization for Binary Payloads

**Issue:** The contract says `dmx-frame` and `universe-metrics` use "binary" payloads but the frontend receives `number[]` (JSON array of bytes). This is because Tauri events serialize to JSON by default. Clarifying this avoids confusion about "true" binary (e.g. `Uint8Array` over a binary channel).

**Suggestion:** Add a note in §4: _"Binary payloads are serialized as JSON arrays of numbers (0–255) when emitted via Tauri events. The frontend reconstructs via `new Uint8Array(raw)`."_

---

### B. `get_diag_entries` Return Type Naming

**Issue:** The contract uses `DiagEntryDto` for the command return type. The frontend's `useDiagLog` expects `timestamp_nanos` (snake_case) from the API. Serde uses snake_case for Rust structs. The contract's TypeScript uses camelCase in `DiagEntryEventPayload` but the command returns snake_case. This is consistent with Rust/JSON conventions but could be explicitly noted.

**Suggestion:** Add: _"Command responses use snake_case (Rust/Serde default); event payloads use camelCase for frontend consistency."_

---

### C. Edge Case: Metrics When No Universes Have Data

**Issue:** When `active_ids` is non-empty but no universe has ever received data, `slot_metrics` returns `None` for all. The emit loop sends `universe-metrics` only when `metrics_payload.len() > 1` (i.e. sync byte + at least one record). The frontend retains previous state. Sync status could appear stale.

**Suggestion:** Document this in §7.3 or §8.2: _"When all active universes have no data yet, `universe-metrics` is not emitted; the frontend retains the last received state."_

---

### D. Appendix B: Add useTimeCode and useTimeSync

**Location:** `docs/IPC_API_CONTRACT.md`, Appendix B

**Suggestion:** Add rows for `useTimeCode.ts` and `useTimeSync.ts` to the file locations table for completeness.

---

## Summary Table

| Severity    | Count | Items                                                                                        |
| ----------- | ----- | -------------------------------------------------------------------------------------------- |
| CRITICAL    | 2     | Buffer overread in parseUniverseMetrics; contract offset table ambiguity                     |
| HIGH        | 4     | request_device_url param naming; seq_errors truncation; missing hooks; timestampNanos unused |
| GOOD        | 8     | Binary formats, commands, events, DTOs, gaps, AppState, emit loop, versioning                |
| SUGGESTIONS | 4     | Serialization note; naming convention; edge case; Appendix B completeness                    |

---

## Recommended Action Order

1. **Immediate:** Fix the buffer overread in `useUniverseMetrics.ts` (CRITICAL #1).
2. **Short-term:** Update the contract offset table and add the parameter note for `request_device_url` (CRITICAL #2, HIGH #3).
3. **Medium-term:** Document or extend `seq_errors` handling, add missing hooks to §7.1, and align diag-entry timestamp usage (HIGH #4–6).
4. **As needed:** Apply the optional suggestions for clarity and completeness.
