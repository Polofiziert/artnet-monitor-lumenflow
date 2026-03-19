# LumenFlow Art-Net 4 — Unified Implementation Plan

**Author:** Backend Engineering Lead
**Date:** March 15, 2026
**Supersedes:** `ARTNET_IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_REVIEW_REPORT.md`
**Spec:** Art-Net 4 Protocol V1.4, Revision DP (23/10/2025)

---

## 0. Fundamental Architectural Clarity

**Both previous documents have a blind spot:** they treat LumenFlow as if it were a gateway node that needs to perform merging, synchronous output, and DMX conversion. It is not. LumenFlow is an **Art-Net Controller** with Style Code `StConfig (0x05)` — a configuration and diagnostic tool.

This distinction changes everything about which behaviors we implement vs. which we merely _detect and visualize_.

### What LumenFlow IS (Controller / Monitor):

- **Listens** on UDP port 6454 for ALL Art-Net traffic (passive sniffing)
- **Broadcasts** ArtPoll every 2.5 seconds (active discovery)
- **Receives** ArtPollReply and maintains the device tree
- **Sends** ArtAddress, ArtInput, ArtIpProg to configure remote nodes
- **Receives** ArtDmx for monitoring and visualization (does NOT output to DMX512)
- **Detects** merge conditions, sync mode, stale universes, jitter (does NOT merge itself)
- **Replies** to its own ArtPoll with ArtPollReply (spec requirement)

### What LumenFlow is NOT (Node / Gateway):

- Does NOT have DMX512 physical outputs → no need for SyncBarrier double-buffering
- Does NOT merge ArtDmx sources → needs merge _detection_, not merge _engine_
- Does NOT subscribe to universes via SwIn/SwOut → listens to everything
- Does NOT need ArtDmx TX rate limiting (only sends on user action, not continuous)

### Consequence for the Previous Plans

| Previous Plan Item                | Correct Approach                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| SyncBarrier with double-buffering | **Simplify:** Track whether ArtSync is present + which IP sends it. No buffer swapping needed — we don't output DMX.               |
| MergeEngine with HTP/LTP          | **Replace:** Build a `SourceTracker` that detects how many sources feed each universe. Display merge status in UI. We don't merge. |
| ArtDmx TX rate limiter (44Hz)     | **Remove from Sprint 1:** Only relevant if/when LumenFlow becomes a DMX sender (v2.0+).                                            |
| Unicast subscription table        | **Defer:** Only needed when LumenFlow sends ArtDmx. For monitoring, we receive everything on :6454.                                |
| ArtPollReply random delay (0-1s)  | **Still needed:** As a controller, when we reply to our own ArtPoll.                                                               |

---

## 1. Protocol Behavioral Logic Per Packet

This section describes the _state machines and interactions_ behind each packet — the logic the previous plan only partially covered.

### 1.1 Discovery Lifecycle (ArtPoll + ArtPollReply)

**The heartbeat of Art-Net.** Every controller must run this loop:

```
┌───────────────────────────────────────────────────────────────────┐
│                    DISCOVERY STATE MACHINE                        │
│                                                                   │
│  ┌─────────┐  every 2.5s   ┌──────────────┐                     │
│  │  IDLE   │──────────────→│ SEND ArtPoll │                     │
│  └────┬────┘               │ (directed    │                     │
│       │                    │  broadcast)  │                     │
│       │                    └──────┬───────┘                     │
│       │                           │                              │
│       │                    ┌──────▼───────┐                     │
│       │                    │ COLLECT PHASE │ ← 3 second window   │
│       │                    │ (accumulate   │                     │
│       │                    │  ArtPollReply)│                     │
│       │                    └──────┬───────┘                     │
│       │                           │ timeout                      │
│       │                    ┌──────▼───────┐                     │
│       │                    │RECONCILE TREE│                      │
│       │                    │• New nodes    │                     │
│       │                    │• Updated nodes│                     │
│       │                    │• Stale nodes  │ → prune after 3s    │
│       │                    └──────┬───────┘                     │
│       │                           │                              │
│       └───────────────────────────┘                              │
│                                                                   │
│  ADDITIONALLY:                                                    │
│  • Controller replies to its OWN ArtPoll with ArtPollReply       │
│  • If Flags.1 = 1: Nodes send ArtPollReply on ANY state change  │
│  • Multi-controller: conflicting diag requirements → broadcast   │
│  • Targeted mode (Flags.5): Only nodes in port-address range     │
│    reply → reduces traffic on large installations                │
└───────────────────────────────────────────────────────────────────┘
```

**What the current code gets wrong:**

- `build_art_poll()` produces 14 bytes (Art-Net 3 minimum). Should produce 18 bytes with target range fields (zero-filled = non-targeted = backwards compatible)
- `send_broadcast()` uses `255.255.255.255` (limited broadcast). Spec mandates directed broadcast: `2.255.255.255` or `10.255.255.255`
- No self-reply: Controller must send itself an ArtPollReply
- No 3-second timeout enforcement for node liveness

**Implementation:**

```rust
pub struct DiscoveryEngine {
    poll_interval: Duration,           // 2.5 seconds
    node_timeout: Duration,            // 3 seconds
    our_poll_flags: u8,                // 0x02 = notify on state change
    targeted_range: Option<(u16, u16)>, // port-address range, or None
    broadcast_addrs: Vec<SocketAddr>,  // [2.255.255.255:6454, 10.255.255.255:6454]
}
```

### 1.2 ArtPollReply — Device Identity & Capabilities

**Not just a data struct — it's a contract.** The ArtPollReply tells us everything about a node:

```
ArtPollReply encodes:
├── Identity: IP, MAC, OEM, ShortName, LongName, BindIndex
├── Capabilities: NumPorts, PortTypes[], Status1/2/3
├── Port Configuration: SwIn[], SwOut[], GoodInput[], GoodOutputA[]
├── Protocol Selection: Art-Net vs sACN per port
├── RDM Support: Status1.1, GoodOutputB RDM flags
├── Failsafe: Status3.7:6 (hold/zero/full/scene)
├── Network: DHCP capable/active, web config, 15-bit addressing
├── Performance: RefreshRate (max ArtDmx Hz this node accepts)
└── Binding: BindIP, BindIndex (multi-port products)
```

**The BindIndex problem (C3 from review):** Art-Net 4 multi-port products send one ArtPollReply per logical "page" of ports, each with a different BindIndex but potentially the same IP. Our DeviceRegistry must model this as a _tree_:

```
Product (grouped by BindIP)
├── BindIndex 1 (root): IP 10.0.0.1, Ports [1-4], SwOut [0x00-0x03]
├── BindIndex 2:        IP 10.0.0.1, Ports [5-8], SwOut [0x04-0x07]
└── BindIndex 3:        IP 10.0.0.1, Ports [9-12], SwOut [0x08-0x0B]
```

**Minimum length rule (C4):** Accept 207+ bytes. Fields after offset 207 (bind_ip through filler) are optional extensions.

**Implementation:**

```rust
pub struct DeviceNode {
    ip: Ipv4Addr,
    bind_index: u8,
    bind_ip: Ipv4Addr,
    mac: [u8; 6],
    short_name: String,
    long_name: String,
    oem_code: u16,
    firmware_version: u16,
    esta_man: u16,
    style: StyleCode,
    status: NodeStatus,         // decoded from Status1, Status2, Status3
    ports: Vec<PortInfo>,       // up to 4 per ArtPollReply
    refresh_rate: u16,          // max ArtDmx Hz, 0-44 = DMX512 rate
    node_report: String,        // last NodeReport text
    last_seen: u64,             // epoch nanos
}

pub struct PortInfo {
    index: u8,                  // 0-3 within this BindIndex
    port_type: PortType,        // input/output, protocol
    port_address: u16,          // full 15-bit (Net:Sub:Uni)
    good_input: u8,             // status flags
    good_output_a: u8,          // status flags
    good_output_b: u8,          // Art-Net 4 RDM flags
    direction: PortDirection,   // input or output
    protocol: PortProtocol,     // Art-Net or sACN
    is_merging: bool,           // GoodOutputA.3
    merge_mode: MergeMode,      // GoodOutputA.1 (LTP/HTP)
    rdm_enabled: bool,          // !GoodOutputB.7
}

/// Keyed by (IP, BindIndex) to support multi-port products
pub struct DeviceRegistry {
    nodes: DashMap<(Ipv4Addr, u8), DeviceNode>,
}
```

### 1.3 ArtDmx — The Data Stream

**Behavioral rules that affect our monitor:**

1. **Sequence numbers**: When `seq != 0`, packets with the same port-address should arrive in order. Out-of-order = network congestion indicator. We track this as a **metric** (seq_errors counter), not a filter.

2. **Keepalive detection**: An active universe re-transmits every 800ms-1s even when data doesn't change. If we don't receive a packet for > 1.5 seconds, the universe is **stale**. If > 4 seconds, the source has **disconnected**.

3. **Source tracking per universe**: Multiple IPs sending to the same port-address = merge condition at the receiving node. We detect and display this:

```rust
pub struct UniverseMetrics {
    sources: [(u32, u64); 2],     // (ip_as_u32, last_seen_nanos), max 2 tracked
    source_count: u8,             // 0, 1, or 2+
    total_packets: u64,
    last_sequence: u8,
    sequence_errors: u64,         // out-of-order count
    last_update_nanos: u64,
    packets_this_second: u32,     // for pkt/s calculation
}
```

4. **Physical field significance**: Two ArtDmx packets to the same universe from the same IP but different Physical ports = merge condition (the sending node has two physical DMX inputs patched to the same universe). Track this too.

### 1.4 ArtSync — Synchronization Detection (NOT Implementation)

**LumenFlow does not output DMX. It does not need a SyncBarrier.**

What it needs:

- **Detect** whether ArtSync is present on the network
- **Track** which controller IP is sending ArtSync
- **Display** sync status in the SourceSyncPanel (already exists in UI)
- **Correlate** with ArtDmx timing to show whether nodes are receiving data in sync'd mode

```rust
pub struct SyncDetector {
    active: AtomicBool,
    source_ip: AtomicU32,
    last_seen_nanos: AtomicU64,
    timeout_nanos: u64,  // 4 seconds — if no ArtSync for 4s, sync is inactive
}

impl SyncDetector {
    pub fn on_sync(&self, source_ip: u32, now_nanos: u64) {
        self.source_ip.store(source_ip, Ordering::Release);
        self.last_seen_nanos.store(now_nanos, Ordering::Release);
        self.active.store(true, Ordering::Release);
    }

    pub fn is_active(&self, now_nanos: u64) -> bool {
        let last = self.last_seen_nanos.load(Ordering::Acquire);
        if last == 0 { return false; }
        now_nanos.saturating_sub(last) < self.timeout_nanos
    }
}
```

This is ~50 lines of code instead of the 200+ line double-buffered SyncBarrier from the review. The complex version is only needed if we ever add DMX output capability.

### 1.5 ArtAddress — Remote Node Configuration

**The interaction pattern matters:**

```
Controller                              Node
    │                                     │
    │─── ArtAddress (unicast) ──────────→│
    │    (set Net, Sub, Name, Command)    │
    │                                     │── applies changes
    │                                     │
    │←── ArtPollReply (unicast) ─────────│
    │    (confirms new configuration)     │
    │                                     │
```

The ArtPollReply response is how we **verify** the command was applied. Implementation must:

1. Send ArtAddress to specific node IP
2. Start a 3-second timer
3. Wait for ArtPollReply from that IP
4. Compare fields to confirm changes applied
5. Report success/failure to UI

**Command byte is not just a value — it's a behavioral instruction:**

| Command Range               | Purpose                                | LumenFlow Action                 |
| --------------------------- | -------------------------------------- | -------------------------------- |
| 0x00 AcNone                 | No action, just update names/addresses | Set names/ports                  |
| 0x01 AcCancelMerge          | Cancel merge on next ArtDmx            | Emergency backup takeover        |
| 0x02-0x04 AcLed\*           | Front panel indicators                 | Identify fixture on stage        |
| 0x05 AcResetRxFlags         | Reset error flags                      | Clear alarms                     |
| 0x08-0x0C AcFail\*          | Failsafe behavior                      | Set what happens on network loss |
| 0x10-0x13 AcMergeLtp\*      | Set LTP merge mode                     | Configure merge behavior         |
| 0x20-0x33 AcDirection\*     | Set port input/output                  | Reconfigure gateway ports        |
| 0x50-0x53 AcMergeHtp\*      | Set HTP merge mode                     | Configure merge behavior         |
| 0x60-0x73 AcArtNet/AcnSel\* | Art-Net vs sACN                        | Select protocol per port         |
| 0x90-0x93 AcClearOp\*       | Clear output buffer                    | Emergency blackout               |
| 0xC0-0xD3 AcRdm\*           | Enable/disable RDM                     | RDM management                   |

**Critical note:** In Art-Net 4, commands 0x11-0x13, 0x21-0x23, etc. (port 1-3 variants) are DEPRECATED. Only port-0 commands (0x10, 0x20, etc.) are used, with BindIndex selecting the target page.

### 1.6 ArtInput — Enable/Disable Inputs

**Simple but safety-critical.** Disabling an input on a remote node stops that universe from entering the network. This is used to:

- Prevent bandwidth waste from unused inputs
- Emergency shutoff of a rogue DMX source

```
Controller                              Node
    │                                     │
    │─── ArtInput (unicast) ────────────→│
    │    (disable input port 2)           │
    │                                     │── disables DMX input
    │                                     │
    │←── ArtPollReply (unicast) ─────────│
    │    (GoodInput shows disabled)       │
```

### 1.7 ArtDiagData — Diagnostic Messages

**This is the "syslog of Art-Net."** Nodes send diagnostic text messages to the controller based on ArtPoll settings.

**The interaction chain:**

1. Controller sends ArtPoll with Flags.2=1 (send me diagnostics) and DiagPriority
2. Node stores the controller's IP and priority setting
3. When diagnostic events occur, node sends ArtDiagData to the controller
4. If Flags.3=0: broadcast. If Flags.3=1: unicast to requesting controller
5. Multiple controllers: broadcast always wins (spec rule)

**Priority filtering:**
| Code | Level | What it means |
|---|---|---|
| 0x10 | DpLow | Debug info, routine status |
| 0x40 | DpMed | Notable events |
| 0x80 | DpHigh | Warnings, anomalies |
| 0xe0 | DpCritical | Errors, failures |
| 0xf0 | DpVolatile | Single-line status ticker (not logged, just displayed) |

**For LumenFlow:** This is gold for FOH troubleshooting. We should request diagnostics at DpLow level (get everything) and let the UI filter by priority. Store in a ring buffer with timestamps.

### 1.8 ArtTimeCode — Show Synchronization

**Not a clock — a show transport.** ArtTimeCode carries SMPTE/EBU timecode for synchronizing lighting to playback. The timecode source (usually one console) broadcasts this, and all devices use it to trigger cues at the right time.

```
Fields: Hours(0-23), Minutes(0-59), Seconds(0-59), Frames(0-29)
Types: Film(24fps), EBU(25fps), DF(29.97fps), SMPTE(30fps)
StreamId: 0x00 = master, 1+ = additional streams
```

**For LumenFlow:** Display a large timecode clock in the header when detected. Show type indicator. Detect multiple StreamIds (unusual but valid for multi-show setups).

### 1.9 ArtCommand — Text Property Commands

**A key-value protocol embedded in Art-Net.** Commands are formatted as `Key=Value&` pairs in ASCII text. Only two standardized commands exist:

- `SwoutText=<label>&` — Sets output port label (shown in ArtPollReply ShortName)
- `SwinText=<label>&` — Sets input port label

Manufacturer-specific commands use EstaMan != 0xFFFF.

**For LumenFlow:** Primarily useful as a TX capability for relabeling ports remotely.

### 1.10 ArtTrigger — Remote Macro Execution

**A cue-fire mechanism.** Used for triggering macros, show starts, soft-key presses across the network.

```
OEM = 0xFFFF: Universal trigger (all devices)
OEM = specific: Only devices matching that OEM code respond

Key values:
0 = KeyAscii → SubKey is ASCII character (simulate keypress)
1 = KeyMacro → SubKey is macro number to execute
2 = KeySoft  → SubKey is soft-key number
3 = KeyShow  → SubKey is show number to run
```

**For LumenFlow:** Detect triggers on the network and display in a log. Optionally send triggers from a panel.

### 1.11 ArtNzs — Non-Zero Start Code

**Identical wire format to ArtDmx** except the `Physical` field is replaced by `StartCode`. Start code 0x00 is standard DMX (use ArtDmx instead), start code 0xCC is RDM (use ArtRdm instead), start code 0x91 is VLC (ArtVlc subset).

**For LumenFlow:** Parse like ArtDmx. Show a "NZS" badge in the channel inspector. Track per universe whether NZS traffic exists (indicates special fixture protocols like System Information Packets).

### 1.12 ArtIpProg / ArtIpProgReply — IP Configuration

**The "dangerous" packet.** Reprograms a node's IP address remotely. Node replies with ArtIpProgReply confirming the new settings.

**Safety rules:**

- Always unicast (never broadcast)
- If Command byte bit 7 is clear, it's a read-only query
- Supports DHCP toggle, IP set, mask set, gateway set, factory reset

**For LumenFlow:** Implement carefully with confirmation dialog in UI. Show warning that this can make a node unreachable if misconfigured.

### 1.13 ArtDataRequest / ArtDataReply — Product Metadata

**New in Art-Net 4 revision DI.** Allows querying product URLs:

- DrUrlProduct (0x0001): Manufacturer product page
- DrUrlUserGuide (0x0002): User guide
- DrUrlSupport (0x0003): Support page
- DrUrlPersUdr (0x0004): UDR personality file
- DrUrlPersGdtf (0x0005): GDTF personality file
- 0x8000+: Manufacturer-specific

**For LumenFlow:** Low priority but nice for device detail panel — clickable links to manufacturer resources.

### 1.14 RDM Packets (OpTodRequest, OpTodData, OpTodControl, OpRdm, OpRdmSub)

**RDM over Art-Net is a multi-step dance:**

```
Discovery:
  Controller → ArtTodRequest (broadcast or unicast)
  Gateway   → ArtTodData (unicast, one or more packets with UIDs)

Parameter Get/Set:
  Controller → ArtRdm (unicast to gateway IP)
  Gateway   → forwards RDM to physical DMX port
  Fixture   → responds via DMX RDM
  Gateway   → ArtRdm (unicast back to controller)

Discovery Control:
  Controller → ArtTodControl (AtcFlush → full re-discovery)
  Controller → ArtTodControl (AtcIncOn → enable incremental)
```

**Key Art-Net 4 change:** ArtRdm MUST be unicast (broadcast deprecated). ArtTodData MUST be unicast.

**For LumenFlow v1.5:** Feature-gated. Full implementation deferred per roadmap.

---

## 2. Critical Fixes (Sprint 0)

These are merged from both previous documents. All must be completed before any new features.

### 2.1 OpSync Value: 0x9800 → 0x5200

Already well-documented. Also update `ArtSyncPacket` doc comment and all test hex bytes.

### 2.2 Receive Buffer: 1024 → 2048 bytes

`network.rs:91` — change `vec![0u8; 1024]` to `vec![0u8; 2048]`.

### 2.3 DeviceRegistry: Re-key to (Ipv4Addr, u8)

Replace `DashMap<IpAddr, DeviceInfo>` with `DashMap<(Ipv4Addr, u8), DeviceNode>`. Add `BindIndex` field from ArtPollReply. Group by `BindIP` for UI product grouping.

### 2.4 ArtPollReply: Accept 207-byte minimum

Use manual byte-offset parsing for ArtPollReply. Parse the guaranteed 207 bytes (through `mac` field), then conditionally parse extension fields if payload is long enough.

### 2.5 UniverseBuffer: Remove Mutex, Use AtomicU64

Replace `parking_lot::Mutex<Option<Instant>>` with `AtomicU64` storing nanoseconds from a shared `OnceLock<Instant>` epoch.

### 2.6 UniverseStore: Replace DashMap with Flat Array

Replace `DashMap<u16, UniverseBuffer>` with `Box<[UniverseSlot]>` indexed by port-address. Pre-allocate 32,768 slots (~16.8MB one-time cost).

### 2.7 Directed Broadcast

Replace `255.255.255.255` with proper directed broadcast. Detect local interface subnet and compute:

- If on 2.x.x.x → broadcast to 2.255.255.255
- If on 10.x.x.x → broadcast to 10.255.255.255
- Otherwise → both (spec says poll both by default)

### 2.8 Add All OpCodes to Enum

Add all 38 OpCode variants to avoid `UnknownOpCode` errors for valid packets. The parser match arm should use `Unimplemented` for recognized-but-not-yet-parsed opcodes instead of `UnknownOpCode`.

### 2.9 Add Alignment Assertions + Criterion Benchmarks

Compile-time `const` asserts for `align_of == 1` on all packed structs. Add benchmark targets for `parse`, `update`, `snapshot`, and `full_pipeline`.

---

## 3. Sprint 1: Core Protocol Behaviors (Weeks 1-2)

### 3.1 DiscoveryEngine

- Build full 18-byte ArtPoll with targeted mode support
- 2.5-second poll interval via `tokio::time::interval`
- Directed broadcast to both 2.x and 10.x
- Self-reply with ArtPollReply (our controller identity)
- 3-second node timeout detection
- Node report parsing (`#xxxx [yyyy] zzzzz` format)

### 3.2 DeviceNode + DeviceRegistry (new design)

- `DeviceNode` struct with full Art-Net 4 fields (Section 1.2 above)
- Keyed by `(Ipv4Addr, BindIndex)`
- `PortInfo` with decoded status bits, protocol selection, merge state
- `list_products()` → groups by BindIP for UI product cards
- `find_subscribers(universe)` → returns list of IPs subscribed to a universe (from SwIn/SwOut)
- Prune nodes not seen for 3 seconds

### 3.3 SourceTracker (replaces MergeEngine)

Since LumenFlow doesn't merge, it detects merge conditions:

```rust
pub struct SourceTracker {
    /// Per-universe source tracking, inline in UniverseBuffer
    source_a_ip: AtomicU32,
    source_a_physical: AtomicU8,
    source_a_last_nanos: AtomicU64,
    source_b_ip: AtomicU32,
    source_b_physical: AtomicU8,
    source_b_last_nanos: AtomicU64,
}

impl SourceTracker {
    /// Returns the number of active sources (0, 1, or 2)
    /// Used by UI to show merge badge
    pub fn active_source_count(&self, now_nanos: u64) -> u8 { ... }

    /// Records a packet from a source IP
    pub fn record(&self, ip: u32, physical: u8, now_nanos: u64) { ... }
}
```

### 3.4 SyncDetector (replaces SyncBarrier)

Simple atomic-based detector as described in Section 1.4. ~50 lines.

### 3.5 ArtDmx Sequence Tracking

Add `sequence_errors: AtomicU64` to `UniverseBuffer`. On each packet, if `incoming_seq != 0` and `current_seq != 0`, check if `incoming_seq` is the expected next value. If not, increment `sequence_errors`.

### 3.6 Stale Universe Detection

Track `last_update_nanos` per universe (already planned). In the IPC emit loop, compare with current time:

- < 1.5s → Active
- 1.5s - 4s → Stale (amber badge)
- 4s → Disconnected (red badge, dim universe tile)

### 3.7 OpAddress Builder

Build `ArtAddress` packets with the full command enum. Include the `AcnPriority` field (new in Art-Net 4, range 0-200, 255=no change).

### 3.8 OpInput Parser + Builder

Parse and build `ArtInput` packets. Track which inputs are enabled per device in `DeviceNode.PortInfo`.

### 3.9 ArtPollReply Builder (our identity)

Build our own ArtPollReply:

- Style = `StConfig` (0x05)
- Status1 = RDM capable (if rdm-support feature enabled)
- Status2 = 15-bit addressing, web config if applicable
- No ports (we're a monitor, not a gateway)
- Short name = "LumenFlow"

---

## 4. Sprint 2: Frontend Alignment (Week 3)

### 4.1 App.tsx Decomposition

Extract from the 588-line monolith:

- `ArtNetStore` context (DMX data, device list, sync state)
- `DataSource` adapter interface (mock vs real backend)
- `ClockProvider` (consolidate redundant 1Hz timers)

### 4.2 Uint8Array Store

Replace `Record<number, number[]>` with `Record<number, Uint8Array>` to eliminate the `Array.from()` allocation per frame.

### 4.3 Per-Universe Status Badges

Wire the new backend data to the UI:

- **Stale badge** (amber/red) from `last_update_nanos`
- **Merge badge** ("2 SRC" indicator) from `SourceTracker`
- **Sync indicator** (green dot) from `SyncDetector`
- **Sequence error counter** from `sequence_errors`

---

## 5. Sprint 3: Diagnostics & Timecode (Weeks 4-5)

### 5.1 OpDiagData (0x2300) — Parse + UI

Ring buffer of diagnostic entries. Priority-colored log panel.
Update our ArtPoll Flags.2 to request diagnostics from nodes.

### 5.2 OpTimeCode (0x9700) — Parse + UI

Timecode clock widget. Conditionally shown when timecode detected.
Display type (Film/EBU/DF/SMPTE) and StreamId.

### 5.3 OpCommand (0x2400) — Parse + Build

Text command parser. Builder for `SwoutText` and `SwinText` relabeling.

### 5.4 OpTrigger (0x9900) — Parse + Build

Trigger detection in log. Optional trigger send panel.

### 5.5 OpNzs (0x5100) — Parse

Nearly identical to ArtDmx. Add `start_code` field to `UniverseMetrics`.
NZS badge in channel inspector.

### 5.6 OpIpProg (0xF800) + OpIpProgReply (0xF900)

IP configuration dialog with safety confirmation. Parse reply to verify.

### 5.7 OpDataRequest (0x2700) + OpDataReply (0x2800)

Query product URLs. Display in device detail panel as clickable links.

### 5.8 OpTimeSync (0x9800)

Real-time clock sync. Replace local JS clock when present.

---

## 6. Sprint 4: RDM (Weeks 6-10, Feature-Gated)

Full RDM discovery and parameter control as described in Section 1.14.
Feature-gated behind `rdm-support` Cargo feature.

---

## 7. Module Structure (Revised)

```
crates/lumenflow_core/src/
├── lib.rs
├── artnet/
│   ├── mod.rs              # OpCode enum (all 38), ParseError, header validation
│   ├── dmx.rs              # ArtDmx parse (+ ArtNzs, shared wire format)
│   ├── poll.rs             # ArtPoll parse + build (18-byte Art-Net 4)
│   ├── poll_reply.rs       # ArtPollReply parse (207+ bytes) + build (our identity)
│   ├── sync.rs             # ArtSync parse (0x5200 corrected)
│   ├── address.rs          # ArtAddress parse + build + command enum
│   ├── input.rs            # ArtInput parse + build
│   ├── diag.rs             # ArtDiagData parse
│   ├── timecode.rs         # ArtTimeCode parse
│   ├── trigger.rs          # ArtTrigger parse + build
│   ├── command.rs          # ArtCommand parse + build
│   ├── ip_prog.rs          # ArtIpProg build + ArtIpProgReply parse
│   ├── data_request.rs     # ArtDataRequest build + ArtDataReply parse
│   └── rdm/                # Feature-gated
│       └── ...
├── engine/
│   ├── mod.rs
│   ├── discovery.rs        # DiscoveryEngine (poll loop, timeout, self-reply)
│   ├── source_tracker.rs   # Per-universe multi-source detection
│   ├── sync_detector.rs    # ArtSync presence detection
│   ├── universe_store.rs   # Flat pre-allocated array, AtomicU8 channels
│   ├── universe_metrics.rs # Sequence errors, pkt/s, stale detection
│   └── diag_buffer.rs      # Ring buffer for diagnostic messages
├── device.rs               # DeviceNode, PortInfo, DeviceRegistry
├── network.rs              # ArtNetSocket, directed broadcast
└── pcap.rs                 # Feature-gated: pcap-export
```

**Key difference from previous plan:** `engine/` module separates protocol _behavior_ (state machines, detection logic) from `artnet/` module (wire format parsing/building). This is the correct architectural separation for a protocol stack.

---

## 8. Testing Strategy

### Per-Packet Tests (unchanged from previous plan)

1. Spec-canonical hex test
2. Round-trip test (build → parse → compare)
3. Truncation test
4. Fuzz target
5. Property-based test

### Behavioral Tests (NEW — not in previous plan)

1. **Discovery lifecycle**: Poll → Reply → DeviceTree → Timeout → Prune
2. **Multi-port binding**: 3 ArtPollReply from same IP with different BindIndex → 3 entries in registry
3. **Source detection**: Two IPs sending to same universe → `active_source_count() == 2`
4. **Stale detection**: No ArtDmx for 2 seconds → universe marked stale
5. **Sync detection**: ArtSync received → active. No ArtSync for 4s → inactive.
6. **ArtAddress confirmation**: Send ArtAddress → expect ArtPollReply within 3s
7. **ArtPollReply 207-byte minimum**: Parse valid Art-Net 3 packet (207 bytes) → success
8. **Sequence error counting**: Out-of-order packets → counter increments

---

## 9. What to Do First

### Day 1: Sprint 0 (Critical Fixes)

Fix OpSync, recv_buf, DeviceRegistry key, ArtPollReply min-length, Mutex→Atomic, DashMap→flat array, directed broadcast, add all OpCodes to enum, alignment assertions, benchmarks.

**All existing tests must still pass after these changes.**

### Day 2-3: Discovery Engine + DeviceNode

This is the backbone. Without correct discovery, nothing else works. Implement the full DiscoveryEngine with the 2.5s poll loop, directed broadcast, self-reply, and 3-second timeout.

### Day 4-5: SourceTracker + SyncDetector + Metrics

Add the lightweight monitoring instrumentation to UniverseBuffer. These are the features that make LumenFlow valuable as a diagnostic tool.

### Week 2: Builders + Frontend Wiring

Complete the ArtAddress builder, ArtInput builder, ArtPollReply builder. Wire everything to the Tauri IPC layer.

---

## 10. Risk Register

| Risk                                          | Impact   | Mitigation                                                       |
| --------------------------------------------- | -------- | ---------------------------------------------------------------- |
| OpSync bug → broken sync detection            | CRITICAL | Fix first (Sprint 0)                                             |
| 207-byte ArtPollReply parsing complexity      | HIGH     | Manual byte-offset parsing, not zerocopy for this one type       |
| DeviceRegistry re-key → API change            | HIGH     | Change early before more code depends on it                      |
| Flat array memory cost (16.8MB)               | LOW      | Acceptable for desktop; can use lazy init if needed              |
| Art-Net subnet detection on multi-NIC systems | MEDIUM   | Let user select interface, default to first Art-Net subnet found |
| RDM complexity scope creep                    | HIGH     | Feature-gated, separate sprint, no dependencies from core        |

---

_This plan treats LumenFlow as what it is — a professional monitoring and configuration tool — rather than a gateway node. Every design decision follows from that identity._
