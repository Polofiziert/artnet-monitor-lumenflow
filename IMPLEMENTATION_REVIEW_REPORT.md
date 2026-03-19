# Art-Net 4 Implementation Review — Consolidated Report

**Date:** March 15, 2026
**Reviewed by:** Protocol Engineer, Frontend Architect, Rust Systems Engineer
**Subject:** `ARTNET_IMPLEMENTATION_PLAN.md` + existing `lumenflow_core` codebase

---

## Executive Summary

The implementation plan is well-structured, spec-accurate, and correctly identifies the OpSync bug as the top priority. However, three independent expert reviews surfaced **6 critical findings** and **12 high-severity findings** that must be addressed before proceeding with new OpCode implementations.

**Verdict:** Fix structural issues first, then build incrementally.

---

## Critical Findings (Must Fix Before Any New Work)

### C1. OpSync Value is Wrong — `0x9800` should be `0x5200`

**Source:** All three reviewers confirmed
**Impact:** LumenFlow cannot detect ArtSync packets from any spec-compliant console (ETC, MA, ChamSys). Synchronous mode is completely broken.
**Fix:** Immediate. Change `Sync = 0x9800` to `Sync = 0x5200`, add `TimeSync = 0x9800`.

### C2. `recv_buf` is 1024 bytes — Silent Packet Truncation

**Source:** Protocol Engineer
**Impact:** `UDP recv_from` into a 1024-byte buffer silently drops bytes from any datagram > 1024 bytes. While ArtDmx max is 530 bytes, vendor-extended packets and ArtPollReply (239+ bytes) are safe, but future extensions and non-Art-Net garbage on port 6454 could cause corrupt parses instead of clean errors.
**Fix:** Increase `recv_buf` to **2048 bytes** (Ethernet MTU + headroom).

### C3. `DeviceRegistry` Keyed by IP — Loses Multi-Port Nodes

**Source:** Protocol Engineer
**Impact:** Art-Net 4 requires multi-port gateways to send one ArtPollReply per BindIndex from the same IP. The current `DashMap<IpAddr, DeviceInfo>` overwrites entries — a 4-port Luminex LumiNode appears as 1 port. Affects every professional multi-port device on the market.
**Fix:** Re-key to `(IpAddr, u8)` where the `u8` is `BindIndex`.

### C4. ArtPollReply Parser Rejects Valid 207-Byte Packets

**Source:** Protocol Engineer
**Impact:** Art-Net 3 nodes send 207-byte ArtPollReply (the spec-mandated minimum). The current `ref_from_prefix` requires the full 239-byte Art-Net 4 struct, silently rejecting every Art-Net 3 device.
**Fix:** Split into `ArtPollReplyBase` (207 bytes, required) + optional extension fields, or use manual byte-offset parsing for PollReply.

### C5. Mutex in Hot Path (`UniverseBuffer::last_update`)

**Source:** Rust Systems Engineer
**Impact:** `parking_lot::Mutex` lock acquired on every DMX packet (22,000/sec). Creates contention with UI thread reads. `Instant::now()` is also a syscall per packet.
**Fix:** Replace with `AtomicU64` storing nanoseconds from a shared epoch (`OnceLock<Instant>`).

### C6. DashMap Shard Locking in `UniverseStore::update()`

**Source:** Rust Systems Engineer
**Impact:** `DashMap::entry()` acquires a shard-level write lock for the duration of `UniverseBuffer::update()` (512 atomic stores + timestamp). With 500 universes across 16 shards, ~31 universes share each shard — causing lock contention at high packet rates.
**Fix:** Replace with pre-allocated flat array `Box<[UniverseSlot; 32768]>` indexed by port-address. Costs ~16.8MB upfront but eliminates all per-packet locking and hash computation.

---

## High-Severity Findings

| #   | Finding                                                                     | Source   | Fix                                                                          |
| --- | --------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| H1  | No ArtPollReply random delay (0-1s)                                         | Protocol | Add `tokio::time::sleep(rng.gen_range(0..1000ms))`                           |
| H2  | `build_art_poll()` missing Art-Net 4 targeted range fields                  | Protocol | Extend to 18 bytes with optional target port range                           |
| H3  | Limited broadcast (`255.255.255.255`) instead of directed broadcast         | Protocol | Detect interface subnet, compute directed broadcast (e.g., `2.255.255.255`)  |
| H4  | No ArtDmx sequence validation                                               | Protocol | Discard out-of-order packets when `seq != 0`, log as metric                  |
| H5  | Merge engine not per-universe                                               | Protocol | Embed `MergeState` inside `UniverseBuffer`, not a separate DashMap           |
| H6  | Partial DMX frames undefined in merge                                       | Protocol | In HTP: treat missing channels as 0. In LTP: only overwrite present channels |
| H7  | SyncBarrier needs lock-free double-buffering                                | Systems  | `AtomicU8` state + per-universe buffer swap on ArtSync                       |
| H8  | MergeEngine must use `compare_exchange` for source slot claim               | Systems  | Inline `[MergeSource; 2]` in UniverseBuffer with CAS-based slot assignment   |
| H9  | Frontend `App.tsx` is 588-line monolith — cannot absorb 6 new state domains | Frontend | Extract domain stores with `createContext`, split into providers             |
| H10 | `Array.from()` allocation per DMX frame in `useDmxStream`                   | Frontend | Store `Uint8Array` directly, avoid boxing 512 numbers per frame              |
| H11 | Missing per-universe stale detection in UI                                  | Frontend | Track `lastSeen` per universe, show "STALE" badge after 2s                   |
| H12 | Effect cascade risk from concurrent Tauri event streams                     | Frontend | Use `batch()`, flatten derivation chains, bypass signals for 30Hz data       |

---

## Medium & Low Findings Summary

| Finding                                                             | Severity | Category        |
| ------------------------------------------------------------------- | -------- | --------------- |
| `TimeCode` opcode parsed but rejected by wildcard match arm         | MEDIUM   | Correctness     |
| Odd-length ArtDmx rejection breaks compatibility with cheap nodes   | MEDIUM   | Interop         |
| `output_port_addresses()` allocates Vec (warm path)                 | MEDIUM   | Performance     |
| Unicast subscription model for ArtDmx TX undocumented               | MEDIUM   | Spec compliance |
| No ArtDmx TX rate limiting (44Hz max per universe)                  | MEDIUM   | Spec compliance |
| zerocopy API stability concern (`ref_from_prefix` signature change) | MEDIUM   | Maintenance     |
| `sub_switch << 4` overflow on malformed wire data                   | MEDIUM   | Safety          |
| `active_universes()` allocates Vec per call at 60Hz                 | MEDIUM   | Performance     |
| No Criterion benchmarks defined                                     | MEDIUM   | Quality         |
| Manual `from_u16` fragile at 37 OpCode variants                     | LOW      | Maintenance     |
| Art-Net subnet conventions (2.x.x.x / 10.x.x.x) not documented      | LOW      | Usability       |
| `DeviceInfo::last_seen` is `Instant` — not serializable for IPC     | LOW      | Architecture    |
| Redundant `setInterval` timers in frontend                          | LOW      | Performance     |
| Mock/real dual-path doubles code for every new data stream          | MEDIUM   | Architecture    |
| Three competing time displays in UI chrome                          | MEDIUM   | UX              |

---

## Revised Implementation Order

Based on the review findings, the implementation order should be restructured:

### Sprint 0: Foundation Fixes (Week 0 — 3 days)

**Goal:** Make the existing code correct and performant before adding features.

1. **Fix OpSync** `0x9800` → `0x5200`, add `TimeSync = 0x9800` (C1)
2. **Increase recv_buf** to 2048 bytes (C2)
3. **Re-key DeviceRegistry** to `(IpAddr, u8)` for BindIndex (C3)
4. **Fix ArtPollReply** minimum packet length to 207 bytes (C4)
5. **Replace Mutex** with `AtomicU64` epoch nanos in `UniverseBuffer` (C5)
6. **Replace DashMap** in `UniverseStore` with flat pre-allocated array (C6)
7. **Fix directed broadcast** address computation (H3)
8. **Add alignment assertions** for all packed structs
9. **Add Criterion benchmarks** for parse, update, pipeline

### Sprint 1: Complete Tier 1 OpCodes (Weeks 1-2)

**Goal:** All core Art-Net packets parsed and built correctly.

1. SyncBarrier with lock-free double-buffering (H7)
2. MergeEngine embedded in UniverseBuffer (H5, H6, H8)
3. OpInput parser + builder
4. OpAddress builder with full command enum
5. OpPollReply builder with random delay (H1)
6. ArtPoll builder with targeted mode (H2)
7. ArtDmx sequence validation (H4)
8. ArtDmx TX rate limiter (44Hz per universe)

### Sprint 2: Frontend Architecture (Week 3)

**Goal:** Decompose App.tsx before adding new data streams.

1. Extract `ArtNetStore` with `createContext` (H9)
2. Replace `number[]` with `Uint8Array` in DMX store (H10)
3. Add per-universe stale detection (H11)
4. Implement `DataSource` adapter pattern (mock/real)
5. Consolidate timers into `ClockProvider`

### Sprint 3: Diagnostics & Timecode (Weeks 4-5)

1. OpDiagData parser + DiagnosticsLog UI
2. OpTimeCode parser + TimecodeDisplay widget
3. OpCommand parser + builder
4. OpTrigger parser + builder
5. OpNzs parser (+ VLC detection)
6. OpIpProg + OpIpProgReply
7. OpDataRequest + OpDataReply
8. OpTimeSync (0x9800)

### Sprint 4: RDM Foundation (Weeks 6-10)

Feature-gated behind `rdm-support`.

### Sprint 5: Firmware & File Transfer (Future)

Feature-gated, community-driven.

---

## How to Start

### Day 1 — Morning: Fix the Critical Six

```bash
# 1. Fix OpSync and add all OpCode variants
# 2. Increase recv_buf to 2048
# 3. Re-key DeviceRegistry
# 4. Fix ArtPollReply minimum length
# 5. Replace Mutex with AtomicU64
# 6. Replace DashMap with flat array
# 7. Run all existing tests (they should still pass)
cargo test -p lumenflow_core
```

### Day 1 — Afternoon: Add Benchmarks

Set up Criterion benchmarks for the hot path before changing it further. This gives you a regression baseline.

### Day 2-3: SyncBarrier + MergeEngine

These are the two most architecturally complex new components. Design them lock-free from the start using the patterns from the Rust Systems review.

### Day 4-5: Builders (OpAddress, OpInput, OpPollReply)

Complete the "Art-Net citizen" capability: LumenFlow can respond to polls, send configuration commands, and enable/disable inputs.

### Week 2: Wire to Frontend

Connect the new backend capabilities to the existing SolidJS UI through Tauri commands and events, but only after the frontend refactoring (Sprint 2) is planned.

---

## Risk Mitigation

| Risk                                                  | Mitigation                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Flat array costs 16.8MB at startup                    | Acceptable for desktop app; benchmark confirms throughput gain |
| ArtPollReply split struct increases parser complexity | Well-contained; only one packet type needs this                |
| Frontend refactoring is a large scope change          | Can be done incrementally; start with `ArtNetStore` extraction |
| RDM complexity could delay core features              | Feature-gated, deferred to Sprint 4                            |
| zerocopy version upgrade breaking change              | Pin in Cargo.toml, add CI test for latest                      |

---

_This report synthesizes findings from three independent expert reviews. All OpCode values have been verified against Art-Net 4 Protocol V1.4, Revision DP (23/10/2025). The recommended implementation order prioritizes spec compliance and structural correctness over feature velocity._
