# Plan: Real Jitter Chart Implementation

**Status:** Draft — Reviewed by subagents (explore + generalPurpose)  
**Created:** 2025-03-15  
**Goal:** Implement backend-driven jitter chart for real mode, replacing "Waiting for jitter data" with live inter-packet arrival intervals.

---

## Review Summary (Subagent Feedback Incorporated)

| Reviewer           | Key findings                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **explore**        | Fixed Phase 2b: `jitter_collector.record()` called from UDP listener in `viewport_culler.rs`, not from `UniverseStore`. AppState in `main.rs`. Frontend needs conditional `listen("jitter-samples")` with cleanup.                  |
| **generalPurpose** | Added memory ordering (Acquire/Release), store-before-increment for `write_idx`. EMA/thresholds in frontend. Benchmark recommendation. Chaos tests use `ChaCha8Rng::seed_from_u64`. Optional `snapshot_into()` for zero-alloc emit. |

---

## Compliance Audit (Project Rules, Skills, IPC Contract)

| Source                          | Requirement                                | Plan Status                                                    |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| **Project Rules**               | No `.unwrap()` / `.expect()`               | ✓ Phase 2b: "Never use .unwrap() or .expect()"                 |
| **Project Rules**               | No heap allocations in DMX hot path        | ✓ `record()` uses fixed `[AtomicU64; 80]`; no Vec/String       |
| **Project Rules**               | Lock-free, prefer atomics                  | ✓ AtomicU64, AtomicUsize; single producer                      |
| **Project Rules**               | Every public fn has `///` doc + `# Errors` | ✓ Phase 2b: "Every public function: doc comment with # Errors" |
| **Project Rules**               | Tests for new logic                        | ✓ Phase 2f: unit tests, chaos tests                            |
| **Project Rules**               | 500+ universes at 44Hz                     | ✓ ~5 atomics/packet; benchmark recommended                     |
| **IPC Contract Rule**           | Read `docs/IPC_API_CONTRACT.md` first      | ✓ Plan adds §4.4 jitter-samples                                |
| **IPC Contract Rule**           | Viewport culling for high-freq data        | N/A — jitter is aggregate, not per-universe                    |
| **IPC Contract Rule**           | 60Hz emit loop, MissedTickBehavior::Skip   | ✓ Uses existing emit loop; 10 Hz like route-info               |
| **ipc-api-contract skill**      | New events: document in contract           | ✓ "Add §4.4 jitter-samples"                                    |
| **viewport-culling-sync**       | Emit only for visible universes            | N/A — jitter is global aggregate                               |
| **zero-alloc-refactor skill**   | No Vec/String/Box in hot path              | ✓ `record()` zero-alloc                                        |
| **chaos-test-generation**       | `ChaCha8Rng::seed_from_u64`                | ✓ Phase 2f specifies it                                        |
| **chaos-test-generation**       | EMA thresholds (15/50ms)                   | ✓ Plan cites them; frontend applies                            |
| **chaos-test-generation**       | `test_ema_detects_sustained_jitter`        | ✓ Phase 2f: "If EMA detector added"                            |
| **UNIFIED_IMPLEMENTATION_PLAN** | LumenFlow detects jitter (does not merge)  | ✓ Plan: "Detects jitter" — controller role                     |
| **spec-compliance**             | Art-Net OpCode / wire format               | N/A — jitter is internal metric, not Art-Net packet            |

**Optional enhancement:** Consider binary `[u32 LE]` for jitter-samples to match route-info style; JSON is acceptable for ~10 Hz.

---

## 1. Context

### Current State

- **Mock mode:** Jitter chart shows synthetic data via `gaussianRandom()` in `useNetworkStats.ts`
- **Real mode:** Jitter chart shows "Waiting for jitter data" — `jitterSamples: []` by design
- **Backend:** `UniverseMetrics` tracks `last_update_nanos` per universe; no inter-packet delta tracking
- **Frontend:** `JitterHistogram` and `useNetworkStats` already support `jitterSamples: number[]`

### Why Jitter Matters

- Inter-packet arrival variance indicates network congestion, switch issues, or source timing problems
- Chaos skill defines thresholds: Normal <15ms, Amber 15–50ms, Red >50ms
- EMA-based detection for sustained jitter; recovery when jitter subsides

---

## 2. Architecture Decision: Aggregate vs Per-Universe

| Option           | Memory                   | IPC Load                       | Use Case                                 |
| ---------------- | ------------------------ | ------------------------------ | ---------------------------------------- |
| **Aggregate**    | ~640 B (one ring buffer) | 1 event, ~80 samples           | "How jittery is traffic at our monitor?" |
| **Per-universe** | 32k × 640 B ≈ 20 MB      | 500+ streams, viewport culling | "Which source has jitter?"               |

**Decision:** Start with **aggregate** jitter. One global inter-packet interval stream across all ArtDmx/ArtNzs packets. Sufficient for Phase 2; per-universe can be Phase 3 if needed.

---

## 3. Implementation Plan

### Phase 2a: Backend — Inter-Packet Timing

**File:** `crates/lumenflow_core/src/engine/universe_metrics.rs` (or new `jitter.rs`)

1. Add `prev_last_update_nanos: AtomicU64` to `UniverseMetrics` (or create a separate `JitterCollector` if we want aggregate-only)
2. In `record_packet(sequence, now_nanos)`:
   - `prev = last_update_nanos.load(Ordering::Acquire)`
   - If `prev > 0`: `delta_nanos = now_nanos.saturating_sub(prev)` — valid inter-packet interval
   - Store `last_update_nanos = now_nanos`
   - Return `Option<u64>` (delta) for the caller to push to jitter buffer

**Alternative:** Create a dedicated `JitterCollector` in `lumenflow_core` that:

- Holds `last_packet_nanos: AtomicU64` (global, any universe)
- Holds `samples: [AtomicU64; 80]` or a lock-free ring buffer
- `record_packet(now_nanos) -> Option<u64>` returns delta when valid
- `snapshot() -> Vec<u64>` for emit loop to read

**Recommendation:** Separate `JitterCollector` in `lumenflow_core`. The **UDP listener** in `viewport_culler.rs` (not `UniverseStore`) calls `jitter_collector.record(now_nanos)` after each `universe_store.update()`. `UniverseStore` lives in `lumenflow_core` and must not depend on `JitterCollector`.

---

### Phase 2b: Backend — JitterCollector

**File:** `crates/lumenflow_core/src/engine/jitter_collector.rs` (new)

```rust
/// Lock-free aggregate jitter collector.
/// Tracks inter-packet arrival intervals across all universes.
pub struct JitterCollector {
    last_packet_nanos: AtomicU64,
    /// Ring buffer of recent intervals in nanoseconds.
    /// Indexed by (write_idx % 80). Single producer (network thread).
    samples: [AtomicU64; 80],
    write_idx: AtomicUsize,
}
```

- `record(now_nanos)`: compute delta, push to ring buffer, return
- `snapshot() -> Vec<u64>`: copy current samples for emit (caller converts to ms)
- Zero allocations on hot path; `snapshot()` allocates once per emit
- **Never** use `.unwrap()` or `.expect()` — use `Result` or `Option` where applicable
- Every public function: `///` doc comment with `# Errors` (or "infallible" if none)

**Memory ordering:** Use `Ordering::Acquire` on loads of `last_packet_nanos` and `write_idx`; `Ordering::Release` on stores. Store sample before incrementing `write_idx` so `snapshot()` never sees a new index with an unwritten slot. Acceptable: `snapshot()` may be up to one slot behind.

**Optional:** `snapshot_into(&mut [u64; 80])` to avoid 10 Hz `Vec` allocation in emit loop.

**Integration:** Add `JitterCollector` to `AppState`. In `start_udp_listener` (viewport_culler.rs), after each `universe_store.update()` for ArtDmx/ArtNzs, call `jitter_collector.record(epoch_nanos())`.

---

### Phase 2c: IPC — jitter-samples Event

**File:** `crates/lumenflow_ui/src-tauri/src/viewport_culler.rs`

- In emit loop (same 10 Hz cadence as route-info):
  - Call `jitter_collector.snapshot()`
  - Convert nanos → ms: `sample_ns as f64 / 1e6`
  - Emit `jitter-samples` with `Vec<f64>` or binary `[u32 LE]` (ms as u32)

**Format:** `number[]` (JSON) — matches mock `jitterSamples` shape. Values in ms. Keeps parsing simple; no new binary parser needed.

**IPC_API_CONTRACT.md:** Add §4.4 `jitter-samples` with format and rate.

---

### Phase 2d: Frontend — useJitterStats / useNetworkStats

**File:** `crates/lumenflow_ui/src/hooks/useNetworkStats.ts` (or `useJitterStats.ts`)

- Listen to `jitter-samples` Tauri event
- When real mode and event fires: replace `jitterSamples` with payload
- When real mode and no event: keep `[]` (Waiting for jitter data)
- Mock mode: unchanged (synthetic jitter)

**Option A:** Extend `useNetworkStats` — add `jitterSamples` from event when in real mode.  
**Option B:** Separate `useJitterStats` — returns `() => number[]`, consumed by `NetworkDiagnostics`.

**Recommendation:** Option A — keep single source of truth in `useNetworkStats`; subscribe to `jitter-samples` only when `!isMockMode()`.

**Implementation details:**

- Use `onMount` + `listen("jitter-samples", ...)` + `onCleanup` (mirror `useRouteInfo`).
- Use `createEffect` with `isMockMode()` so the subscription is conditional and cleaned up on mode switch.
- Keep a separate signal for backend jitter samples and merge into `chartStats.jitterSamples` when in real mode.

---

### Phase 2e: AppState & Wiring

**Files:** `crates/lumenflow_ui/src-tauri/src/*.rs`

1. Add `jitter_collector: Arc<JitterCollector>` to `AppState` (in `viewport_culler.rs`; constructed in `main.rs`)
2. In `start_udp_listener`: clone `state.jitter_collector` into the spawn; after each `universe_store.update()` for ArtDmx/ArtNzs, call `jitter_collector.record(epoch_nanos())`
3. In `start_emit_loop`: clone `state.jitter_collector` into the spawn; in the `route_tick % 6 == 0` block, call `jitter_collector.snapshot()`, convert to ms, emit `jitter-samples`

---

### Phase 2f: Testing

**File:** `crates/lumenflow_core/src/engine/jitter_collector.rs` (tests)

- Unit tests: feed packets at known intervals, assert `snapshot()` contains expected deltas
- Edge: first packet (no delta), rapid bursts, empty snapshot
- **Deterministic seeding:** Use `ChaCha8Rng::seed_from_u64(42)` for packet timing (per chaos skill); no `thread_rng()` in assertions

**File:** `tests/chaos/network_simulation.rs` or `crates/lumenflow_core/tests/`

- Chaos-style: simulate jitter via deterministic packet stream
- If EMA detector is added: `test_ema_detects_sustained_jitter`, `test_ema_recovers_after_jitter_subsides` per chaos skill

**EMA/Thresholds:** Plan collects raw intervals only. EMA and thresholds (Normal <15ms, Amber 15–50ms, Red >50ms) live in the **frontend** for now (e.g. `lastJitter > 30` in systemStatus). Backend emits raw samples; frontend can add EMA if needed.

---

## 4. File Checklist

| File                                                   | Action                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `crates/lumenflow_core/src/engine/jitter_collector.rs` | **Create** — JitterCollector struct, record, snapshot; doc comments + no unwrap |
| `crates/lumenflow_core/src/engine/mod.rs`              | Export JitterCollector                                                          |
| `crates/lumenflow_core/src/lib.rs`                     | Re-export if needed                                                             |
| `crates/lumenflow_ui/src-tauri/src/main.rs`            | Add jitter_collector to AppState                                                |
| `crates/lumenflow_ui/src-tauri/src/viewport_culler.rs` | Call jitter_collector.record in UDP handler; emit jitter-samples in loop        |
| `crates/lumenflow_ui/src/hooks/useNetworkStats.ts`     | Subscribe to jitter-samples when real mode; merge into chartStats               |
| `docs/IPC_API_CONTRACT.md`                             | Add §4.4 jitter-samples                                                         |
| `crates/lumenflow_core/src/engine/jitter_collector.rs` | Unit tests                                                                      |

---

## 5. Risks & Mitigations

| Risk                     | Mitigation                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hot path allocation      | JitterCollector uses fixed-size array; snapshot() allocates only in emit loop (10 Hz). Optional: `snapshot_into(&mut [u64; 80])` to avoid 10 Hz Vec |
| Lock contention          | Lock-free atomics; single producer (network thread)                                                                                                 |
| 500+ universes → 22k pps | We sample every packet; ring buffer overwrites. May want to downsample (e.g. every Nth packet) if profiling shows CPU impact                        |
| Frontend event storm     | Emit at 10 Hz, not per-packet                                                                                                                       |

**Benchmark:** Add `bench_universe_store_update_with_jitter` to compare `store.update()` with and without `jitter_collector.record()` and ensure no regression.

---

## 6. Rollback

- Feature flag: `enable_jitter` in config; if false, jitter_collector no-op, frontend keeps `[]`
- Or: simply don't emit `jitter-samples`; frontend already handles empty array

---

## 7. Success Criteria

- [ ] Real mode + traffic: jitter chart shows live inter-packet intervals (ms)
- [ ] Real mode + no traffic: "Waiting for jitter data"
- [ ] Mock mode: unchanged
- [ ] No regression in packet processing latency (benchmarks)
- [ ] Unit tests pass; chaos tests (if added) pass
