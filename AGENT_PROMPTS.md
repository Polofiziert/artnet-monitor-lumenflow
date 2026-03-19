# Agent Task Prompts for LumenFlow Art-Net Implementation

Copy each prompt to a separate agent. Execute them **in order** — each builds on the previous.

---

## PROMPT 1: Sprint 0 — Critical Fixes (artnet.rs, network.rs, OpCode enum)

```
You are a Senior Rust Backend Engineer working on LumenFlow, an Art-Net 4 monitoring tool.
Crate: `crates/lumenflow_core/` — workspace root is the repo root.
Spec: Art-Net 4 Protocol V1.4, Revision DP (23/10/2025)

PROJECT RULES (MUST follow):
- NEVER use .unwrap() or .expect() — use Result<T, E> with thiserror
- Every public function needs /// doc comment with # Errors section
- #[repr(C, packed)] with zerocopy::FromBytes for wire structs
- All multi-byte wire fields use [u8; N] arrays (not u16/u32) to avoid alignment issues
- No heap allocations in functions called at >1000/sec
- Tests required for every new parser

Read UNIFIED_IMPLEMENTATION_PLAN.md for full context.

TASK: Fix critical spec compliance and performance bugs.

STEP 1 — Fix OpSync value in artnet.rs (line 20):
The current code has `Sync = 0x9800` which is WRONG per Art-Net 4 spec Table 1.
- OpSync = 0x5200 (ArtSync — force synchronous DMX output)
- OpTimeSync = 0x9800 (real-time date/clock sync — different packet!)
Change: `Sync = 0x9800` → `Sync = 0x5200`
Add: `TimeSync = 0x9800` as new variant
Update the `from_u16` match arms accordingly.
Update the ArtSyncPacket doc comment (line 136) from "OpCode 0x9800" to "OpCode 0x5200".
Fix the test_parse_art_sync test (line 627-641): change `0x00, 0x98` to `0x00, 0x52`.

STEP 2 — Expand OpCode enum to all 38 Art-Net 4 OpCodes:
Add these variants (values from spec Table 1):
  Nzs = 0x5100, Input = 0x7000, DiagData = 0x2300, Command = 0x2400,
  DataRequest = 0x2700, DataReply = 0x2800, Trigger = 0x9900,
  Directory = 0x9A00, DirectoryReply = 0x9B00,
  TodRequest = 0x8000, TodData = 0x8100, TodControl = 0x8200,
  Rdm = 0x8300, RdmSub = 0x8400,
  FirmwareMaster = 0xF200, FirmwareReply = 0xF300,
  FileTnMaster = 0xF400, FileFnMaster = 0xF500, FileFnReply = 0xF600,
  IpProg = 0xF800, IpProgReply = 0xF900,
  Media = 0x9000, MediaPatch = 0x9100, MediaControl = 0x9200,
  MediaContrlReply = 0x9300,
  MacMaster = 0xF000, MacSlave = 0xF100,
  VideoSetup = 0xA010, VideoPalette = 0xA020, VideoData = 0xA040
Add all to the from_u16 match.

STEP 3 — Add ParseError::Unimplemented variant:
Add: `#[error("unimplemented OpCode: 0x{0:04X}")] Unimplemented(u16)`
In the parser's main match (line 417-423), change the `_ => Err(ParseError::UnknownOpCode(...))` arm to:
- For recognized-but-not-parsed opcodes → Err(ParseError::Unimplemented(opcode_raw))
- Keep UnknownOpCode for truly unknown values (not in the enum)

STEP 4 — Fix recv_buf size in network.rs (line 91):
Change `vec![0u8; 1024]` to `vec![0u8; 2048]`.
Art-Net max packet size fits in 1 Ethernet MTU (1500), but 2048 provides headroom.

STEP 5 — Fix broadcast address in network.rs (line 138-141):
Replace the `send_broadcast` method with `send_directed_broadcast` that sends to:
  2.255.255.255:6454 AND 10.255.255.255:6454
Per the Art-Net spec, controllers poll BOTH the primary (2.x) and secondary (10.x) subnets.
Keep the old send_broadcast as a private helper or remove it.

STEP 6 — Upgrade build_art_poll to 18 bytes (network.rs line 164):
The current builder produces 14 bytes (Art-Net 3). Art-Net 4 adds:
  offset 14-15: TargetPortAddressTop (2 bytes LE, set to 0x0000)
  offset 16-17: TargetPortAddressBottom (2 bytes LE, set to 0x0000)
Change the return type to [u8; 18] and add the zero-filled target range.
This is backward-compatible (zero = non-targeted = all nodes reply).
Add optional parameters or a builder pattern for targeted mode.

STEP 7 — Add compile-time alignment assertions:
At the bottom of artnet.rs (before tests), add:
const _: () = {
    assert!(std::mem::align_of::<ArtDmxHeader>() == 1);
    assert!(std::mem::align_of::<ArtPollPacket>() == 1);
    assert!(std::mem::align_of::<ArtSyncPacket>() == 1);
    assert!(std::mem::align_of::<ArtPollReplyPacket>() == 1);
    assert!(std::mem::align_of::<ArtAddressPacket>() == 1);
};

STEP 8 — Run `cargo test -p lumenflow_core` and fix any failures.

STEP 9 — Run `cargo clippy -p lumenflow_core -- -D warnings` and fix any warnings.

VERIFY: All existing tests pass. No .unwrap() added. OpSync correctly uses 0x5200.
```

---

## PROMPT 2: Sprint 0 — Performance Fixes (buffer.rs, device.rs, ArtPollReply min-length)

```
You are a Senior Rust Systems Engineer specializing in lock-free concurrent data structures.
Working on LumenFlow crate: `crates/lumenflow_core/`
Read UNIFIED_IMPLEMENTATION_PLAN.md for full architecture context.

PROJECT RULES:
- NEVER use .unwrap() or .expect() — use Result<T, E> with thiserror
- Every public function needs /// doc comment with # Errors section
- No heap allocations in hot-path functions (called >1000/sec)
- #![deny(clippy::unwrap_used)] is enabled in lib.rs

TASK: Fix 4 critical performance and correctness issues.

STEP 1 — Replace Mutex with AtomicU64 in buffer.rs:

Current code (buffer.rs line 18):
  last_update: parking_lot::Mutex<Option<Instant>>,

Problem: Acquired on every ArtDmx packet (22,000/sec). Instant::now() is also a syscall.

Fix: Replace with AtomicU64 storing nanoseconds elapsed from a shared epoch.

Add a module-level epoch function:
  use std::sync::OnceLock;
  fn epoch() -> &'static std::time::Instant {
      static EPOCH: OnceLock<std::time::Instant> = OnceLock::new();
      EPOCH.get_or_init(std::time::Instant::now)
  }

In UniverseBuffer:
  - Replace `last_update: parking_lot::Mutex<Option<Instant>>` with `last_update_nanos: AtomicU64`
  - In new(): initialize to AtomicU64::new(0)
  - In update(): replace `*self.last_update.lock() = Some(Instant::now())` with:
      let nanos = epoch().elapsed().as_nanos() as u64;
      self.last_update_nanos.store(nanos, Ordering::Release);
  - Replace last_update() method with:
      pub fn last_update_elapsed(&self) -> Option<std::time::Duration> {
          let nanos = self.last_update_nanos.load(Ordering::Acquire);
          if nanos == 0 { return None; }
          let total = epoch().elapsed();
          Some(total.saturating_sub(std::time::Duration::from_nanos(nanos)))
      }

Update all callers and tests that use last_update().

STEP 2 — Replace DashMap with flat pre-allocated array in UniverseStore (buffer.rs):

Current code uses DashMap<u16, UniverseBuffer> which acquires shard write locks.

Replace with a flat array indexed by 15-bit port-address (0..32767):

  pub struct UniverseSlot {
      initialized: AtomicBool,
      buffer: UniverseBuffer,
  }

  pub struct UniverseStore {
      slots: Box<[UniverseSlot]>,  // length 32768
  }

Implementation:
  - new(): Allocate Box with 32768 slots, each UniverseBuffer::new(i as u16)
  - update(port_address, data, sequence): Direct index, no lock.
      let slot = &self.slots[port_address as usize];
      slot.buffer.update(data, sequence);
      slot.initialized.store(true, Ordering::Release);
  - snapshot(port_address, out): Check initialized, then snapshot.
  - active_universes(): Linear scan of initialized flags (already sorted by index).
  - Add active_universes_into(&self, out: &mut Vec<u16>) to reuse allocation.
  - len(): Count initialized slots.

Note: This costs ~16.8MB at startup (32768 * 512 AtomicU8). Acceptable for desktop app.

Update all tests and lib.rs re-exports.

STEP 3 — Re-key DeviceRegistry in device.rs:

Current: DashMap<IpAddr, DeviceInfo> — overwrites multi-port nodes.
Art-Net 4 multi-port products send one ArtPollReply per BindIndex from the same IP.

Change the key to (Ipv4Addr, u8) where u8 is bind_index:
  pub struct DeviceRegistry {
      nodes: DashMap<(std::net::Ipv4Addr, u8), DeviceInfo>,
  }

Add bind_index field to DeviceInfo:
  pub bind_index: u8,

Update upsert() to use (ip, bind_index) as key.
Update list_devices() and prune_stale() accordingly.
Add a new method:
  /// Groups devices by bind_ip for product-level aggregation in the UI.
  pub fn list_products(&self) -> Vec<Vec<DeviceInfo>> { ... }

Update all tests.

STEP 4 — Fix ArtPollReply parser to accept 207-byte minimum:

Current: Uses zerocopy ref_from_prefix which requires the full 239-byte struct.
Spec: "Consumers shall accept as valid a packet of length 207 bytes or larger."
The 207-byte boundary ends at the `mac` field (offset 201 + 6 bytes = 207).

Fix: Use manual byte-offset parsing for ArtPollReply instead of zerocopy.

  fn parse_poll_reply(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
      const MIN_LEN: usize = 207;
      if payload.len() < MIN_LEN {
          return Err(ParseError::TooShort { expected: MIN_LEN, actual: payload.len() });
      }
      // Parse required fields (0-206) from byte offsets
      // Parse optional Art-Net 4 fields (207-238) if payload is long enough
      // Still use the ArtPollReplyPacket struct but fill missing fields with zeros

      // If the payload is >= 239, use zerocopy as before.
      // If 207 <= payload < 239, copy into a zeroed 239-byte buffer, then parse.
      if payload.len() >= std::mem::size_of::<ArtPollReplyPacket>() {
          // existing path
      } else {
          let mut padded = [0u8; 239];
          padded[..payload.len()].copy_from_slice(payload);
          // Parse from padded (need to return owned, not borrowed)
          // This requires changing ArtNetPacket::PollReply to own the data
          // OR keeping a small stack buffer approach
      }
  }

Note: This may require ArtNetPacket::PollReply to hold an owned copy for the
padded case, or you can use a separate PollReplyOwned variant.
Choose the approach that minimizes allocations while maintaining the zero-copy
path for the common 239-byte case.

Add a test that parses a 207-byte ArtPollReply (Art-Net 3 minimum).

STEP 5 — Run `cargo test -p lumenflow_core` and fix failures.
STEP 6 — Run `cargo clippy -p lumenflow_core -- -D warnings`.

VERIFY: No parking_lot::Mutex in buffer.rs. No DashMap in UniverseStore.
DeviceRegistry keyed by (Ipv4Addr, u8). ArtPollReply accepts 207-byte packets.
```

---

## PROMPT 3: Sprint 0 — Criterion Benchmarks + Module Refactoring

```
You are a Rust performance engineer working on LumenFlow.
Crate: `crates/lumenflow_core/`
Read UNIFIED_IMPLEMENTATION_PLAN.md for context.

PROJECT RULES:
- NEVER use .unwrap() or .expect() in library code (ok in benchmarks)
- Benchmarks go in crates/lumenflow_core/benches/

TASK: Add Criterion benchmarks and refactor artnet.rs into a module directory.

STEP 1 — Add Criterion benchmark file:

Create `crates/lumenflow_core/benches/hot_path.rs`:

Benchmark these operations (the hot path at 22,000 packets/sec):
a) ArtNetParser::parse() on a valid 530-byte ArtDmx packet (512 channels)
b) UniverseBuffer::update() with 512 bytes of DMX data
c) UniverseStore::update() on an existing universe
d) Full pipeline: parse ArtDmx → store.update()
e) UniverseBuffer::snapshot() (reader path at 60Hz)

For each benchmark:
- Use Criterion's Throughput::Elements(1) or Throughput::Bytes(512)
- Use black_box() for inputs
- Pre-warm the store (insert 500 universes before benchmarking updates)

Add to crates/lumenflow_core/Cargo.toml:
  [[bench]]
  name = "hot_path"
  harness = false

STEP 2 — Refactor artnet.rs into artnet/ module directory:

Current: Single 900-line file at src/artnet.rs
Target: Module directory at src/artnet/

Create this structure:
  src/artnet/
  ├── mod.rs         # OpCode enum, ParseError, ART_NET_HEADER, constants,
  │                  # ArtNetParser (dispatcher), ArtNetPacket enum,
  │                  # decode_port_address, alignment assertions
  ├── dmx.rs         # ArtDmxHeader struct + impl + parse_dmx()
  ├── poll.rs        # ArtPollPacket struct + impl + parse_poll()
  ├── poll_reply.rs  # ArtPollReplyPacket struct + impl + parse_poll_reply()
  ├── sync.rs        # ArtSyncPacket struct + impl + parse_sync()
  └── address.rs     # ArtAddressPacket struct + impl + parse_address()
                     # + ART_ADDRESS_NO_CHANGE constant

Rules for the split:
- Each file contains the wire-format struct, its impl block, and the parse function
- mod.rs re-exports everything: `pub use self::dmx::*; pub use self::poll::*;` etc.
- ArtNetParser::parse() stays in mod.rs and calls parse functions from sub-modules
- ArtNetPacket enum stays in mod.rs
- ALL TESTS move to a tests/ submodule or stay in mod.rs — they must still pass

The public API must not change. lib.rs imports should still work:
  pub use artnet::{ArtDmxHeader, ArtNetPacket, ArtNetParser, ...};

STEP 3 — Add empty placeholder files for future packet parsers:

Create these files with just a module doc comment and no code:
  src/artnet/input.rs       — "ArtInput (OpCode 0x7000) parser and builder"
  src/artnet/diag.rs        — "ArtDiagData (OpCode 0x2300) parser"
  src/artnet/timecode.rs    — "ArtTimeCode (OpCode 0x9700) parser"
  src/artnet/trigger.rs     — "ArtTrigger (OpCode 0x9900) parser and builder"
  src/artnet/command.rs     — "ArtCommand (OpCode 0x2400) parser and builder"
  src/artnet/nzs.rs         — "ArtNzs (OpCode 0x5100) parser"
  src/artnet/ip_prog.rs     — "ArtIpProg (0xF800) and ArtIpProgReply (0xF900)"
  src/artnet/data_request.rs — "ArtDataRequest (0x2700) and ArtDataReply (0x2800)"

Declare them as modules in mod.rs (pub mod input; etc.) but they can be empty
for now — just the //! module doc.

STEP 4 — Create the engine/ module directory:

Create empty placeholder structure:
  src/engine/
  ├── mod.rs               # pub mod declarations
  ├── source_tracker.rs    # "Per-universe multi-source detection"
  ├── sync_detector.rs     # "ArtSync presence detection"
  ├── universe_store.rs    # placeholder (actual UniverseStore is still in buffer.rs
  │                        # for now, will be moved in a future sprint)
  └── universe_metrics.rs  # "Sequence errors, pkt/s, stale detection"

Add `pub mod engine;` to lib.rs.

STEP 5 — Run `cargo test -p lumenflow_core` — all tests must pass.
STEP 6 — Run `cargo bench -p lumenflow_core` — benchmarks must complete.
STEP 7 — Run `cargo clippy -p lumenflow_core -- -D warnings`.

VERIFY: artnet.rs is now artnet/mod.rs. All tests pass. Benchmarks produce numbers.
Public API unchanged.
```

---

## PROMPT 4: Sprint 1 — Engine Components (SourceTracker, SyncDetector, Metrics)

```
You are a Senior Rust Backend Engineer building protocol monitoring infrastructure.
Crate: `crates/lumenflow_core/`
Read UNIFIED_IMPLEMENTATION_PLAN.md for full context, especially sections 1.3, 1.4, 3.3-3.6.

CRITICAL CONTEXT: LumenFlow is a MONITOR, not a gateway. It does NOT output DMX.
It does NOT merge data. It DETECTS conditions and VISUALIZES them.

PROJECT RULES:
- NEVER use .unwrap() or .expect()
- Every public function needs /// doc comment with # Errors section
- No heap allocations in functions called from the packet processing loop
- All state must be lock-free (atomics only) — no Mutex, no RwLock
- Use AtomicU8, AtomicU32, AtomicU64 with appropriate Ordering
- Tests required for every public function

TASK: Implement the 3 core monitoring engine components.

STEP 1 — Implement SourceTracker (src/engine/source_tracker.rs):

Purpose: Track how many distinct source IPs are sending ArtDmx to each universe.
When 2+ sources send to the same port-address, it's a merge condition at the
receiving node. We detect and display this.

Design:
  pub struct SourceTracker {
      source_a_ip: AtomicU32,         // IPv4 as u32, 0 = empty
      source_a_physical: AtomicU8,    // Physical field from ArtDmx
      source_a_last_nanos: AtomicU64, // epoch nanos
      source_b_ip: AtomicU32,
      source_b_physical: AtomicU8,
      source_b_last_nanos: AtomicU64,
  }

Methods:
  pub fn new() -> Self
  pub fn record(&self, ip: u32, physical: u8, now_nanos: u64)
    - If ip matches source_a or source_b, update last_seen
    - If ip is new and a slot is empty (ip == 0), claim it via compare_exchange
    - If ip is new and both slots taken, check for stale source (>10s old), replace if found
    - If ip is new and both slots are active, ignore (spec: max 2 sources)
  pub fn active_source_count(&self, now_nanos: u64) -> u8
    - Count sources seen within last 10 seconds
  pub fn sources(&self, now_nanos: u64) -> [(u32, u8); 2]
    - Return (ip, physical) for active sources (0 = empty)
  pub fn reset(&self)

Tests:
  - Single source → count = 1
  - Two different IPs → count = 2
  - Third IP ignored → count = 2
  - Source goes stale after 10s → count decreases
  - Stale source slot reclaimed by new IP
  - Same IP, different Physical → still tracked (merge from same node)

STEP 2 — Implement SyncDetector (src/engine/sync_detector.rs):

Purpose: Detect whether ArtSync (OpCode 0x5200) packets are present on the network.
Art-Net spec: Sync mode times out after 4 seconds of no ArtSync.

Design:
  pub struct SyncDetector {
      active: AtomicBool,
      source_ip: AtomicU32,
      last_seen_nanos: AtomicU64,
  }

  const SYNC_TIMEOUT_NANOS: u64 = 4_000_000_000; // 4 seconds

Methods:
  pub fn new() -> Self
  pub fn on_sync(&self, source_ip: u32, now_nanos: u64)
    - Store source_ip and timestamp, set active = true
  pub fn is_active(&self, now_nanos: u64) -> bool
    - True if last_seen within 4 seconds
  pub fn source_ip(&self) -> Option<u32>
    - Returns the IP of the sync source, or None if inactive
  pub fn last_seen_nanos(&self) -> u64

Tests:
  - No sync received → is_active = false
  - Sync received → is_active = true
  - Sync received, 3.9s later → still active
  - Sync received, 4.1s later → inactive (timeout)
  - Multiple syncs from same IP → source_ip correct
  - Sync from new IP → source_ip updates

STEP 3 — Implement UniverseMetrics (src/engine/universe_metrics.rs):

Purpose: Track per-universe health metrics beyond raw DMX data.

Design:
  pub struct UniverseMetrics {
      sequence_errors: AtomicU64,
      last_sequence: AtomicU8,
      packets_total: AtomicU64,
      packets_this_window: AtomicU32,   // reset every second
      last_rate_reset_nanos: AtomicU64,
      last_update_nanos: AtomicU64,
  }

Methods:
  pub fn new() -> Self
  pub fn record_packet(&self, sequence: u8, now_nanos: u64)
    - Check sequence order: if incoming != 0 and last != 0,
      expected = (last % 255) + 1. If incoming != expected, increment seq_errors.
    - Store sequence, increment packet counts, update timestamp.
  pub fn sequence_errors(&self) -> u64
  pub fn packets_per_second(&self, now_nanos: u64) -> u32
    - If >1 second since last reset, calculate rate, reset window counter
  pub fn staleness(&self, now_nanos: u64) -> Staleness
    - < 1.5s → Active
    - 1.5s - 4s → Stale
    - > 4s → Disconnected

  #[derive(Debug, Clone, Copy, PartialEq, Eq)]
  pub enum Staleness { Active, Stale, Disconnected }

Tests:
  - Sequential packets → 0 errors
  - Out-of-order packet → 1 error
  - Sequence wraps 255 → 1 → no error
  - Sequence disabled (0) → no error tracking
  - Packets per second calculation
  - Staleness transitions at correct thresholds

STEP 4 — Wire into engine/mod.rs:
  pub mod source_tracker;
  pub mod sync_detector;
  pub mod universe_metrics;

  Re-export key types.

STEP 5 — Run `cargo test -p lumenflow_core`.
STEP 6 — Run `cargo clippy -p lumenflow_core -- -D warnings`.

VERIFY: All 3 components are fully lock-free (no Mutex/RwLock). All methods documented.
All tests pass. No .unwrap() in library code.
```

---

## PROMPT 5: Sprint 1 — Packet Builders (ArtAddress, ArtInput, ArtPollReply)

```
You are a Senior Protocol Engineer implementing Art-Net 4 packet builders in Rust.
Crate: `crates/lumenflow_core/`
Read UNIFIED_IMPLEMENTATION_PLAN.md for spec details, especially sections 1.5, 1.6, 1.2.

CRITICAL CONTEXT: LumenFlow is an Art-Net Controller (StConfig = 0x05).
These builders create packets that LumenFlow SENDS to remote nodes.
When a node receives ArtAddress or ArtInput, it responds with ArtPollReply.

PROJECT RULES:
- NEVER use .unwrap() or .expect()
- Every public function needs /// doc comment with # Errors section
- Builders return stack-allocated byte arrays (no heap allocation)
- All multi-byte wire fields are little-endian unless spec says big-endian
- Include round-trip tests (build → parse → verify fields match)

TASK: Implement 3 packet builders + the ArtInput parser.

STEP 1 — ArtAddress Command Enum (src/artnet/address.rs):

Create a comprehensive enum for all ArtAddress command codes:

  #[repr(u8)]
  #[derive(Debug, Clone, Copy, PartialEq, Eq)]
  pub enum ArtAddressCommand {
      AcNone = 0x00,
      AcCancelMerge = 0x01,
      AcLedNormal = 0x02,
      AcLedMute = 0x03,
      AcLedLocate = 0x04,
      AcResetRxFlags = 0x05,
      AcAnalysisOn = 0x06,
      AcAnalysisOff = 0x07,
      AcFailHold = 0x08,
      AcFailZero = 0x09,
      AcFailFull = 0x0a,
      AcFailScene = 0x0b,
      AcFailRecord = 0x0c,
      AcMergeLtp0 = 0x10,
      AcDirectionTx0 = 0x20,
      AcDirectionRx0 = 0x30,
      AcMergeHtp0 = 0x50,
      AcArtNetSel0 = 0x60,
      AcAcnSel0 = 0x70,
      AcClearOp0 = 0x90,
      AcStyleDelta0 = 0xa0,
      AcStyleConst0 = 0xb0,
      AcRdmEnable0 = 0xc0,
      AcRdmDisable0 = 0xd0,
  }

Note: Port 1-3 variants (0x11, 0x12, 0x13 etc.) are DEPRECATED in Art-Net 4.
Only port-0 commands are used with BindIndex to select the target page.

STEP 2 — ArtAddress Builder (src/artnet/address.rs):

  pub fn build_art_address(
      net_switch: u8,       // 0x80|value to set, 0x7F = no change, 0x00 = reset
      bind_index: u8,
      short_name: &str,     // max 17 chars + null, empty = no change
      long_name: &str,      // max 63 chars + null, empty = no change
      sw_in: [u8; 4],       // 0x80|value to set, 0x7F = no change
      sw_out: [u8; 4],      // 0x80|value to set, 0x7F = no change
      sub_switch: u8,       // 0x80|value to set, 0x7F = no change
      command: ArtAddressCommand,
  ) -> [u8; 107] {
      // Wire layout: see ArtAddressPacket struct for offsets
      // Offset 0-7: Art-Net header
      // Offset 8-9: OpCode 0x6000 LE
      // Offset 10-11: ProtVer 14 BE
      // Offset 12: NetSwitch
      // Offset 13: BindIndex
      // Offset 14-31: ShortName (18 bytes, null-padded)
      // Offset 32-95: LongName (64 bytes, null-padded)
      // Offset 96-99: SwIn
      // Offset 100-103: SwOut
      // Offset 104: SubSwitch
      // Offset 105: SwVideo (deprecated, set to 0)
      // Offset 106: Command
  }

Round-trip test: build_art_address() → ArtNetParser::parse() → verify all fields.

STEP 3 — ArtInput parser + builder (src/artnet/input.rs):

Wire format (20 bytes):
  Offset 0-7: Art-Net header (8 bytes)
  Offset 8-9: OpCode 0x7000 LE (2 bytes)
  Offset 10: ProtVerHi = 0x00
  Offset 11: ProtVerLo = 0x0e (14)
  Offset 12: Filler1 (pad, set to 0)
  Offset 13: BindIndex
  Offset 14-15: NumPorts (2 bytes BE, max 4)
  Offset 16-19: Input[4] — bit 0 of each byte: 1 = disable this input

Create:
  #[repr(C, packed)]
  #[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
  pub struct ArtInputPacket { ... }

  pub fn build_art_input(
      bind_index: u8,
      inputs_disabled: [bool; 4],
  ) -> [u8; 20] { ... }

Add parse_input() function and wire into ArtNetParser::parse() for OpCode::Input.
Add to ArtNetPacket enum: Input(&'a ArtInputPacket)

Tests:
  - Build → parse round-trip
  - All inputs enabled (default)
  - Disable specific inputs
  - Truncation rejection

STEP 4 — ArtPollReply builder (src/artnet/poll_reply.rs):

Build LumenFlow's own ArtPollReply identifying us as a controller:

  pub fn build_our_poll_reply(
      our_ip: std::net::Ipv4Addr,
      our_mac: [u8; 6],
  ) -> [u8; 239] {
      // Style = StConfig (0x05)
      // ShortName = "LumenFlow"
      // LongName = "LumenFlow Art-Net Monitor"
      // NumPorts = 0 (we have no DMX ports)
      // Status1: bit 1 = 1 (RDM capable — future)
      // Status2: bit 3 = 1 (15-bit port addressing)
      // Status3: 0
      // IP = our_ip
      // MAC = our_mac
      // Port = 0x1936 (6454) LE
      // ProtVer = 14
      // All other fields zeroed
  }

Tests:
  - Build → parse round-trip
  - Verify style code = 0x05
  - Verify short name = "LumenFlow"
  - Verify IP and MAC match input

STEP 5 — Update lib.rs re-exports:
Add new public types: ArtAddressCommand, ArtInputPacket, build_art_address,
build_art_input, build_our_poll_reply.

STEP 6 — Run `cargo test -p lumenflow_core` — all tests pass.
STEP 7 — Run `cargo clippy -p lumenflow_core -- -D warnings`.

VERIFY: 3 builders produce spec-compliant packets. All round-trip tests pass.
No .unwrap() in library code. All public items documented.
```

---

## Usage Notes

- **Prompts 1 & 2** can be given to agents in PARALLEL — they touch different files (1: artnet.rs + network.rs, 2: buffer.rs + device.rs)
- **Prompt 3** depends on Prompts 1 & 2 being complete (needs the new OpCode enum and the new UniverseStore)
- **Prompts 4 & 5** can run in PARALLEL after Prompt 3 (4: engine/ module, 5: artnet/ builders)
- Each prompt is self-contained — the agent doesn't need to read the other prompts

```
Execution order:
  [Prompt 1] ──┐
               ├──→ [Prompt 3] ──┬──→ [Prompt 4]
  [Prompt 2] ──┘                 └──→ [Prompt 5]
```
