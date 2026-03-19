# Art-Net 4 Complete Implementation Plan

**Author:** Backend Engineering Lead
**Date:** March 15, 2026
**Spec Reference:** Art-Net 4 Protocol V1.4, Revision DP (23/10/2025)
**Crate:** `lumenflow_core`

---

## 1. Current State Assessment

### Already Implemented (artnet.rs)

| OpCode      | Value  | Status              | Notes                              |
| ----------- | ------ | ------------------- | ---------------------------------- |
| OpPoll      | 0x2000 | ✅ Parse + Build    | Struct, parser, `build_art_poll()` |
| OpPollReply | 0x2100 | ✅ Parse            | 239-byte struct with accessors     |
| OpDmx       | 0x5000 | ✅ Parse            | Zero-copy header + data slice      |
| OpAddress   | 0x6000 | ✅ Parse            | Full struct with command byte      |
| OpSync      | 0x9800 | ⚠️ **WRONG OPCODE** | See critical bug below             |
| OpTimeCode  | 0x9700 | ⚠️ Enum only        | No struct, no parser               |

### Critical Bug: OpSync Value

```
Current code:  Sync = 0x9800  ← WRONG
Spec (Table 1): OpSync = 0x5200  (ArtSync — force synchronous DMX output)
Spec (Table 1): OpTimeSync = 0x9800  (real-time date/clock sync)
```

The current `Sync = 0x9800` is actually `OpTimeSync`, not `OpSync`. This must be corrected before any further development.

### Supporting Infrastructure

- `UniverseStore` with `DashMap<u16, UniverseBuffer>` — lock-free, AtomicU8 per channel
- `DeviceRegistry` with `DashMap<IpAddr, DeviceInfo>` — concurrent upsert/prune
- `ArtNetSocket` with SO_REUSEADDR, SO_BROADCAST, 8MB recv buffer
- `build_art_poll()` — 14-byte packet builder

---

## 2. Complete Art-Net 4 OpCode Catalog

### Tier 1: Core (Must-Have for v0.2 Stable)

These are the packets that flow on every Art-Net network. Without them, LumenFlow is blind.

| #   | OpCode      | Value  | Direction     | Purpose                   | UI Impact                       |
| --- | ----------- | ------ | ------------- | ------------------------- | ------------------------------- |
| 1   | OpPoll      | 0x2000 | TX broadcast  | Device discovery          | Device List auto-populate       |
| 2   | OpPollReply | 0x2100 | RX unicast    | Device status/config      | Device cards, routing matrix    |
| 3   | OpDmx       | 0x5000 | RX/TX unicast | DMX512 data transport     | Channel Inspector, heatmap      |
| 4   | OpSync      | 0x5200 | RX broadcast  | Synchronous DMX output    | ArtSync indicator in UI         |
| 5   | OpAddress   | 0x6000 | TX unicast    | Remote node programming   | Config panel, routing drag-drop |
| 6   | OpInput     | 0x7000 | TX unicast    | Enable/disable DMX inputs | Input toggle in device detail   |

### Tier 2: Diagnostics & Control (v0.3 — v1.0)

Professional monitoring tools need these for real-world troubleshooting.

| #   | OpCode        | Value  | Direction    | Purpose                 | UI Impact                |
| --- | ------------- | ------ | ------------ | ----------------------- | ------------------------ |
| 7   | OpDiagData    | 0x2300 | RX/TX        | Diagnostics logging     | Diagnostics log panel    |
| 8   | OpCommand     | 0x2400 | TX unicast   | Text property commands  | Advanced config panel    |
| 9   | OpTimeCode    | 0x9700 | RX broadcast | SMPTE/EBU timecode      | Timecode clock display   |
| 10  | OpTrigger     | 0x9900 | TX broadcast | Trigger macros          | Trigger button panel     |
| 11  | OpNzs         | 0x5100 | RX unicast   | Non-zero start code DMX | NZS indicator, data view |
| 12  | OpIpProg      | 0xF800 | TX unicast   | Reprogram node IP/mask  | IP config dialog         |
| 13  | OpIpProgReply | 0xF900 | RX unicast   | IP programming ack      | Config success toast     |
| 14  | OpDataRequest | 0x2700 | TX unicast   | Request product URLs    | Device detail links      |
| 15  | OpDataReply   | 0x2800 | RX unicast   | Product URL response    | Device detail links      |
| 16  | OpTimeSync    | 0x9800 | RX/TX        | Real-time clock sync    | Clock display            |

### Tier 3: RDM (v1.5 — v2.0)

Remote Device Management is complex and warrants its own feature flag.

| #   | OpCode       | Value  | Direction            | Purpose                   | UI Impact            |
| --- | ------------ | ------ | -------------------- | ------------------------- | -------------------- |
| 17  | OpTodRequest | 0x8000 | TX unicast/broadcast | Request RDM device table  | RDM device tree      |
| 18  | OpTodData    | 0x8100 | RX unicast           | RDM device table response | RDM device list      |
| 19  | OpTodControl | 0x8200 | TX unicast/broadcast | RDM discovery control     | Discovery controls   |
| 20  | OpRdm        | 0x8300 | TX/RX unicast        | RDM get/set commands      | RDM parameter editor |
| 21  | OpRdmSub     | 0x8400 | TX/RX unicast        | Compressed RDM sub-device | RDM sub-device grid  |

### Tier 4: Firmware & File Transfer (v2.0+)

Rarely needed in a monitoring tool, but completeness matters for a professional product.

| #   | OpCode           | Value  | Direction  | Purpose             | UI Impact              |
| --- | ---------------- | ------ | ---------- | ------------------- | ---------------------- |
| 22  | OpFirmwareMaster | 0xF200 | TX unicast | Upload firmware     | Firmware update wizard |
| 23  | OpFirmwareReply  | 0xF300 | RX unicast | Firmware upload ack | Progress bar           |
| 24  | OpFileTnMaster   | 0xF400 | TX unicast | Upload user files   | File manager           |
| 25  | OpFileFnMaster   | 0xF500 | TX unicast | Download user files | File manager           |
| 26  | OpFileFnReply    | 0xF600 | RX unicast | Download ack        | Progress bar           |

### Tier 5: Specialty / Deprecated (Log-only or feature-gated)

These are either deprecated, rarely seen, or media-server specific.

| #   | OpCode             | Value               | Status            | Purpose                     |
| --- | ------------------ | ------------------- | ----------------- | --------------------------- |
| 27  | OpVlc              | via OpNzs (SC=0x91) | Specialty         | Visible Light Communication |
| 28  | OpMedia            | 0x9000              | Media-server only | Media extensions            |
| 29  | OpMediaPatch       | 0x9100              | Media-server only | Media patching              |
| 30  | OpMediaControl     | 0x9200              | Media-server only | Media control               |
| 31  | OpMediaContrlReply | 0x9300              | Media-server only | Media control reply         |
| 32  | OpVideoSetup       | 0xA010              | Deprecated        | Legacy video                |
| 33  | OpVideoPalette     | 0xA020              | Deprecated        | Legacy video                |
| 34  | OpVideoData        | 0xA040              | Deprecated        | Legacy video                |
| 35  | OpMacMaster        | 0xF000              | Deprecated        | MAC programming             |
| 36  | OpMacSlave         | 0xF100              | Deprecated        | MAC programming             |
| 37  | OpDirectory        | 0x9A00              | Rare              | Request file list           |
| 38  | OpDirectoryReply   | 0x9B00              | Rare              | Reply with file list        |

---

## 3. Implementation Roadmap

### Phase 0: Critical Fix (Immediate — Day 1)

**Fix OpSync value and add OpTimeSync:**

```rust
// BEFORE (wrong):
Sync = 0x9800,

// AFTER (correct per spec Table 1):
Sync = 0x5200,      // ArtSync — synchronous DMX output
TimeSync = 0x9800,   // ArtTimeSync — real-time clock
```

- Update all tests referencing 0x9800 for Sync
- Update ArtSyncPacket struct to match 0x5200
- Add regression test with spec-canonical hex bytes

### Phase 1: Complete Tier 1 (v0.2 Stable — Weeks 1-2)

#### 1.1 OpSync Correction + Synchronous Mode Engine

- Fix OpSync to 0x5200
- Implement `SyncBarrier` state machine per spec:
  - On power-on: non-synchronous mode (ArtDmx outputs immediately)
  - On ArtSync receipt: enter synchronous mode (buffer ArtDmx, output on next ArtSync)
  - 4-second timeout: revert to non-synchronous if no ArtSync received
  - Multi-controller: compare ArtSync source IP with most recent ArtDmx source IP
- Wire SyncBarrier into UniverseStore

#### 1.2 OpInput Parser + Builder

- Parse `ArtInput` packet (18 bytes minimum)
- Build `ArtInput` packet for sending enable/disable commands
- Wire to DeviceRegistry (track input enable state per port)

#### 1.3 OpAddress Builder (we already parse, need to send)

- Implement `build_art_address()` for all command codes:
  - AcNone, AcCancelMerge, AcLedNormal/Mute/Locate
  - AcFailHold/Zero/Full/Scene/Record
  - AcMergeLtp0, AcMergeHtp0, AcDirectionTx0/Rx0
  - AcArtNetSel0, AcAcnSel0, AcClearOp0
  - AcStyleDelta0, AcStyleConst0, AcRdmEnable0/Disable0
  - AcBqp0-15
- Create `ArtAddressCommand` enum with all command codes
- Validate sACN priority range (0-200, 255=no change)

#### 1.4 OpPollReply Builder

- Build `ArtPollReply` for our own controller identity
- Respond to incoming ArtPoll with our capabilities
- Required for LumenFlow to be a proper Art-Net citizen

### Phase 2: Diagnostics & Timecode (v0.3 — Weeks 3-5)

#### 2.1 OpDiagData (0x2300)

- Parse incoming diagnostic messages from nodes
- Display priority levels: DpLow(0x10), DpMed(0x40), DpHigh(0x80), DpCritical(0xe0), DpVolatile(0xf0)
- Store in ring buffer with timestamps
- Forward to UI via diagnostic log panel

#### 2.2 OpTimeCode (0x9700) — Full Implementation

- Parse: Frames(0-29), Seconds(0-59), Minutes(0-59), Hours(0-23)
- Timecode types: Film(24fps), EBU(25fps), DF(29.97fps), SMPTE(30fps)
- StreamId for multiple timecode streams (0x00 = master)
- Emit to UI for clock display widget

#### 2.3 OpCommand (0x2400)

- Parse incoming commands (text-based, null-terminated, max 512 bytes)
- Command syntax: `Command=Data&` (ampersand-delimited)
- Known commands: SwoutText, SwinText
- Builder for sending commands to nodes

#### 2.4 OpTrigger (0x9900)

- Parse: OEM code filtering, Key, SubKey, 512-byte payload
- Key values: KeyAscii(0), KeyMacro(1), KeySoft(2), KeyShow(3)
- Builder for sending triggers
- OEM code 0xFFFF = universal trigger

#### 2.5 OpNzs (0x5100)

- Nearly identical to OpDmx but with StartCode field instead of Physical
- StartCode must not be zero or RDM
- Detect VLC subset (StartCode = 0x91, magic bytes 0x41, 0x4C, 0x45)

#### 2.6 OpIpProg (0xF800) + OpIpProgReply (0xF900)

- Builder for IP programming commands (IP, subnet mask, default gateway)
- Command bitfield: enable programming, DHCP, reset defaults
- Parser for reply (current IP, mask, DHCP status, gateway)

#### 2.7 OpDataRequest (0x2700) + OpDataReply (0x2800)

- Builder for requesting: DrPoll, DrUrlProduct, DrUrlUserGuide, DrUrlSupport, DrUrlPersUdr, DrUrlPersGdtf
- Parser for reply with payload (max 512 bytes, null-terminated)

#### 2.8 OpTimeSync (0x9800)

- Parse real-time date/clock synchronization
- Separate from OpSync (DMX synchronization at 0x5200)

### Phase 3: RDM Support (v1.5 — Weeks 6-10)

Feature-gated behind `rdm-support` Cargo feature.

#### 3.1 RDM Discovery Infrastructure

- `RdmDeviceTable` (TOD): HashMap of RDM UIDs per universe
- Discovery state machine: Full discovery, Incremental discovery

#### 3.2 OpTodRequest (0x8000)

- Builder with Net, Command(TodFull=0x00), AddCount, Address array (max 32)
- Send to discover RDM devices on specified universes

#### 3.3 OpTodData (0x8100)

- Parser for RDM device table response
- Handle multi-packet TOD (BlockCount, UidCount, up to 200 UIDs per packet)
- BindIndex + Port for physical port identification
- TodFull(0x00) vs TodNak(0xFF) response handling

#### 3.4 OpTodControl (0x8200)

- Builder with commands: AtcNone, AtcFlush, AtcEnd, AtcIncOn, AtcIncOff
- AtcFlush triggers full discovery on target port

#### 3.5 OpRdm (0x8300)

- Full RDM message encapsulation over Art-Net
- Unicast only (broadcast deprecated in Art-Net 4)
- RDM FIFO parameters support
- GET/SET command routing

#### 3.6 OpRdmSub (0x8400)

- Compressed RDM sub-device data
- Efficient bulk parameter reads for fixtures with many sub-devices

### Phase 4: Firmware & File Transfer (v2.0+ — Feature-gated)

#### 4.1 OpFirmwareMaster/Reply (0xF200/0xF300)

- Multi-block firmware upload protocol
- 30-second timeout per block
- FirmFirst/FirmCont/FirmLast state machine
- UBEA support (UbeaFirst/UbeaCont/UbeaLast)
- OEM validation against firmware file header

#### 4.2 OpFileTnMaster/OpFileFnMaster/OpFileFnReply (0xF400/0xF500/0xF600)

- User file upload/download protocol
- Same block transfer mechanism as firmware

### Phase 5: Specialty Packets (Log-only)

#### 5.1 OpVlc (via OpNzs)

- Detect VLC magic bytes in OpNzs payload
- Parse VLC-specific fields (ManId, Flags, Transaction, SlotAddr, etc.)
- Feature-gated, log-only initially

#### 5.2 Deprecated OpCodes (Log + Ignore)

- OpMacMaster(0xF000), OpMacSlave(0xF100): Log and ignore
- OpVideoSetup(0xA010), OpVideoPalette(0xA020), OpVideoData(0xA040): Log and ignore
- These should be recognized in the OpCode enum to avoid `UnknownOpCode` errors

---

## 4. Architecture Design

### 4.1 OpCode Enum (Complete)

```rust
#[repr(u16)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OpCode {
    // Tier 1: Core
    Poll          = 0x2000,
    PollReply     = 0x2100,
    Dmx           = 0x5000,
    Nzs           = 0x5100,
    Sync          = 0x5200,  // CORRECTED from 0x9800
    Address       = 0x6000,
    Input         = 0x7000,

    // Tier 2: Diagnostics & Control
    DiagData      = 0x2300,
    Command       = 0x2400,
    DataRequest   = 0x2700,
    DataReply     = 0x2800,
    TimeCode      = 0x9700,
    TimeSync      = 0x9800,
    Trigger       = 0x9900,
    Directory     = 0x9A00,
    DirectoryReply = 0x9B00,

    // Tier 3: RDM
    TodRequest    = 0x8000,
    TodData       = 0x8100,
    TodControl    = 0x8200,
    Rdm           = 0x8300,
    RdmSub        = 0x8400,

    // Tier 4: Firmware & Files
    FirmwareMaster = 0xF200,
    FirmwareReply  = 0xF300,
    FileTnMaster   = 0xF400,
    FileFnMaster   = 0xF500,
    FileFnReply    = 0xF600,
    IpProg         = 0xF800,
    IpProgReply    = 0xF900,

    // Tier 5: Media (log-only)
    Media          = 0x9000,
    MediaPatch     = 0x9100,
    MediaControl   = 0x9200,
    MediaContrlReply = 0x9300,

    // Deprecated (recognize but ignore)
    MacMaster      = 0xF000,
    MacSlave       = 0xF100,
    VideoSetup     = 0xA010,
    VideoPalette   = 0xA020,
    VideoData      = 0xA040,
}
```

### 4.2 Packet Processing Pipeline

```
UDP Socket (port 6454)
    │
    ▼
┌─────────────────────┐
│  ArtNetParser::parse │  ← Zero-copy, returns ArtNetPacket<'a>
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   PacketDispatcher   │  ← Routes to handlers by OpCode
└─────────┬───────────┘
          │
    ┌─────┼──────────┬──────────┬──────────┐
    ▼     ▼          ▼          ▼          ▼
 DmxHandler  PollHandler  SyncHandler  DiagHandler  ...
    │         │            │            │
    ▼         ▼            ▼            ▼
UniverseStore DeviceRegistry SyncBarrier DiagBuffer
    │         │            │            │
    └─────────┴────────────┴────────────┘
              │
              ▼
    ┌─────────────────────┐
    │  IPC Emit Loop (60Hz)│  ← Viewport-culled binary payloads
    └─────────┬───────────┘
              │
              ▼
        SolidJS Frontend
```

### 4.3 Module Structure

```
crates/lumenflow_core/src/
├── lib.rs                  # Public API re-exports
├── artnet/
│   ├── mod.rs              # OpCode enum, ParseError, common types
│   ├── header.rs           # Art-Net header validation
│   ├── dmx.rs              # OpDmx parser + builder
│   ├── poll.rs             # OpPoll parser + builder
│   ├── poll_reply.rs       # OpPollReply parser + builder
│   ├── sync.rs             # OpSync parser (0x5200)
│   ├── address.rs          # OpAddress parser + builder + command enum
│   ├── input.rs            # OpInput parser + builder
│   ├── diag.rs             # OpDiagData parser
│   ├── timecode.rs         # OpTimeCode parser
│   ├── trigger.rs          # OpTrigger parser + builder
│   ├── command.rs          # OpCommand parser + builder
│   ├── nzs.rs              # OpNzs parser (+ VLC detection)
│   ├── ip_prog.rs          # OpIpProg + OpIpProgReply
│   ├── data_request.rs     # OpDataRequest + OpDataReply
│   ├── time_sync.rs        # OpTimeSync (0x9800)
│   └── rdm/                # Feature-gated: rdm-support
│       ├── mod.rs
│       ├── tod_request.rs
│       ├── tod_data.rs
│       ├── tod_control.rs
│       ├── rdm.rs
│       └── rdm_sub.rs
├── buffer.rs               # UniverseBuffer, UniverseStore
├── sync_barrier.rs         # ArtSync synchronous mode engine
├── device.rs               # DeviceRegistry, DeviceInfo
├── network.rs              # ArtNetSocket, packet builders
├── metrics.rs              # EMA jitter, packet counters, flicker score
├── merge.rs                # HTP/LTP merge engine (2-source)
└── pcap.rs                 # Feature-gated: pcap-export
```

### 4.4 Sync Barrier State Machine

```
                    ┌──────────────────┐
                    │  NON-SYNCHRONOUS │ ◄── Power-on default
                    │  (output ArtDmx  │
                    │   immediately)   │
                    └───────┬──────────┘
                            │ ArtSync received
                            ▼
                    ┌──────────────────┐
             ┌─────│   SYNCHRONOUS    │◄────┐
             │     │  (buffer ArtDmx, │     │ ArtSync received
             │     │  output on Sync) │─────┘
             │     └───────┬──────────┘
             │             │ 4s timeout (no ArtSync)
             │             ▼
             │     ┌──────────────────┐
             └─────│  NON-SYNCHRONOUS │
                   └──────────────────┘

Multi-controller rule:
  - Compare ArtSync source IP with most recent ArtDmx source IP
  - Ignore ArtSync if IPs don't match
  - When merging multiple ArtDmx streams: ignore all ArtSync
```

### 4.5 Merge Engine Design

```rust
pub struct MergeEngine {
    source_a: Option<MergeSource>,
    source_b: Option<MergeSource>,
    mode: MergeMode,           // HTP (default) or LTP
    cancel_pending: bool,      // AcCancelMerge received
}

struct MergeSource {
    ip: IpAddr,
    physical: u8,
    data: [u8; 512],
    last_seen: Instant,
}

enum MergeMode {
    Htp,  // Highest Takes Precedence (default)
    Ltp,  // Latest Takes Precedence
}
```

Rules per spec:

- Max 2 sources per universe
- 10-second timeout for failed source recovery
- AcCancelMerge: next ArtDmx ends merge, discard non-matching IPs

---

## 5. UI Integration Map

### 5.1 How Each OpCode Maps to UI Components

| OpCode              | Frontend Component                  | Data Flow                    | Update Frequency   |
| ------------------- | ----------------------------------- | ---------------------------- | ------------------ |
| OpDmx               | ChannelInspector, UniverseMap       | Binary IPC (viewport-culled) | 60Hz               |
| OpPollReply         | DeviceList, RoutingMatrix           | Tauri command (JSON)         | On discovery (~3s) |
| OpSync              | SourceSyncPanel (ArtSync indicator) | Signal update                | On receive         |
| OpAddress           | DeviceDetail config panel           | Tauri command (send)         | On user action     |
| OpInput             | DeviceDetail input toggles          | Tauri command (send)         | On user action     |
| OpDiagData          | New: DiagnosticsLog panel           | Tauri event stream           | On receive         |
| OpTimeCode          | New: TimecodeDisplay widget         | Signal update                | ~30Hz              |
| OpCommand           | DeviceDetail advanced panel         | Tauri command (send)         | On user action     |
| OpTrigger           | New: TriggerPanel                   | Tauri command (send)         | On user action     |
| OpNzs               | ChannelInspector (NZS badge)        | Binary IPC                   | 60Hz               |
| OpIpProg            | DeviceDetail IP config dialog       | Tauri command (send)         | On user action     |
| OpIpProgReply       | Toast notification                  | Tauri event                  | On receive         |
| OpDataRequest/Reply | DeviceDetail info links             | Tauri command                | On user action     |
| OpTimeSync          | StatusBar clock                     | Signal update                | ~1Hz               |

### 5.2 New UI Components Required

#### Phase 1 (v0.2)

- **ArtSync Indicator**: Green dot in SourceSyncPanel when sync mode active (already exists, needs backend wire-up)
- **Merge Mode Badge**: Show "HTP" / "LTP" / "MERGE" indicator on universe tiles

#### Phase 2 (v0.3)

- **DiagnosticsLog**: Scrolling log panel with priority-colored rows (Low=gray, Med=blue, High=amber, Critical=red, Volatile=single-line ticker)
- **TimecodeDisplay**: Large SMPTE clock (`HH:MM:SS:FF`) in header area, type indicator (Film/EBU/DF/SMPTE)
- **TriggerPanel**: Grid of trigger buttons (Key + SubKey), OEM selector
- **IpConfigDialog**: Modal for IP/mask/gateway programming with DHCP toggle
- **DeviceDetailPanel**: Expanded accordion with port configuration, input enable/disable, protocol selection (Art-Net/sACN)

#### Phase 3 (v1.5)

- **RdmDeviceTree**: Hierarchical tree of RDM devices per universe
- **RdmParameterEditor**: GET/SET parameter control panel
- **DiscoveryControls**: Start/stop discovery, flush TOD buttons

### 5.3 IPC Additions (Tauri Commands)

```typescript
// Phase 1 — Tier 1 commands
invoke('send_art_address', { targetIp, netSwitch, subSwitch, ... })
invoke('send_art_input', { targetIp, bindIndex, inputs: boolean[] })
invoke('get_sync_state') → { active: boolean, sourceIp: string }
invoke('get_merge_state', { universe }) → { merging: boolean, mode: 'htp'|'ltp', sources: string[] }

// Phase 2 — Diagnostics
invoke('get_diagnostics', { minPriority }) → DiagEntry[]
invoke('send_art_command', { targetIp, command: string })
invoke('send_art_trigger', { oem, key, subKey, payload? })
invoke('send_art_ip_prog', { targetIp, ip?, mask?, gateway?, dhcp? })
invoke('request_device_data', { targetIp, requestType }) → string
listen('artnet://timecode', handler)
listen('artnet://diagnostics', handler)
listen('artnet://sync-state', handler)

// Phase 3 — RDM
invoke('rdm_discover', { net, addresses }) → RdmUid[]
invoke('rdm_get', { targetIp, universe, uid, pid }) → RdmResponse
invoke('rdm_set', { targetIp, universe, uid, pid, data }) → RdmResponse
```

---

## 6. Performance Constraints

### Hot Path (Zero-Allocation Required)

These functions execute at 22,000+ calls/second and must not allocate:

- `ArtNetParser::parse()` — already zero-copy via zerocopy
- `UniverseStore::update()` — atomic writes
- `SyncBarrier::on_dmx()` / `SyncBarrier::on_sync()` — state machine transitions
- `MergeEngine::merge()` — pre-allocated buffers

### Warm Path (Minimal Allocation)

These execute less frequently but should minimize allocation:

- `DeviceRegistry::upsert()` — String allocation for names (acceptable, ~1/3s)
- `DiagBuffer::push()` — Ring buffer, pre-allocated
- `RdmDeviceTable::update_tod()` — Vec growth (bounded by device count)

### Cold Path (Allocation Allowed)

These are user-triggered or infrequent:

- `build_art_address()` — Stack-allocated output array
- `build_art_ip_prog()` — Stack-allocated output array
- `build_art_trigger()` — Contains 512-byte payload

---

## 7. Testing Strategy

### Per-OpCode Test Requirements

Each new OpCode implementation requires:

1. **Spec-canonical hex test**: Known-good packet bytes from spec, verify parse
2. **Round-trip test**: Build → parse → compare fields
3. **Truncation test**: Verify graceful rejection of short packets
4. **Fuzz target**: Add to `cargo fuzz` harness
5. **Property test**: proptest for field range validation

### Integration Tests

- **Parse-to-store pipeline**: OpDmx → UniverseStore → snapshot
- **Sync barrier lifecycle**: Non-sync → ArtSync → sync mode → timeout → non-sync
- **Merge engine**: Two-source HTP merge, LTP merge, cancel merge, source timeout
- **Discovery cycle**: ArtPoll TX → ArtPollReply RX → DeviceRegistry update → prune
- **IP programming**: ArtIpProg TX → ArtIpProgReply RX → verify settings

### Chaos Tests

- **Packet reordering**: Out-of-sequence ArtDmx with sequence numbers
- **Source failover**: Primary source drops, secondary takes over
- **Sync jitter**: ArtSync arriving with variable delay
- **Merge conflict**: Three sources (third should be ignored per spec)

---

## 8. Implementation Order & Dependencies

```
Phase 0 (Day 1):
  └── Fix OpSync 0x9800 → 0x5200 ──────────────────────────┐
                                                             │
Phase 1 (Weeks 1-2):                                        │
  ├── 1.1 SyncBarrier state machine ◄───────────────────────┘
  ├── 1.2 OpInput parser + builder
  ├── 1.3 OpAddress builder (send commands)
  ├── 1.4 OpPollReply builder (be a citizen)
  └── 1.5 MergeEngine (HTP/LTP) ◄── depends on 1.3 for AcCancelMerge

Phase 2 (Weeks 3-5):
  ├── 2.1 OpDiagData parser
  ├── 2.2 OpTimeCode parser ◄── can be parallel
  ├── 2.3 OpCommand parser + builder ◄── can be parallel
  ├── 2.4 OpTrigger parser + builder ◄── can be parallel
  ├── 2.5 OpNzs parser ◄── similar to OpDmx
  ├── 2.6 OpIpProg + OpIpProgReply
  ├── 2.7 OpDataRequest + OpDataReply
  └── 2.8 OpTimeSync (0x9800) parser

Phase 3 (Weeks 6-10):
  ├── 3.1 RDM discovery infrastructure
  ├── 3.2 OpTodRequest builder ◄── depends on 3.1
  ├── 3.3 OpTodData parser ◄── depends on 3.1
  ├── 3.4 OpTodControl builder
  ├── 3.5 OpRdm parser + builder ◄── depends on 3.1-3.4
  └── 3.6 OpRdmSub parser + builder

Phase 4 (Future):
  ├── 4.1 OpFirmwareMaster/Reply
  └── 4.2 File transfer packets
```

---

## 9. Risk Assessment

| Risk                                          | Impact | Mitigation                            |
| --------------------------------------------- | ------ | ------------------------------------- |
| OpSync bug causes real-world incompatibility  | HIGH   | Fix immediately (Phase 0)             |
| Merge engine race conditions                  | HIGH   | Loom testing, single-writer design    |
| RDM complexity explosion                      | MEDIUM | Feature-gate, iterative delivery      |
| ArtPollReply struct size (239+ bytes) changes | LOW    | Accept minimum 207 bytes per spec     |
| Deprecated OpCodes cause UnknownOpCode errors | LOW    | Add all opcodes to enum, log + ignore |
| VLC subset detection false positives          | LOW    | Strict magic number validation        |

---

## 10. Definition of Done

An OpCode implementation is complete when:

- [ ] Wire-format struct is `#[repr(C, packed)]` with `zerocopy::FromBytes`
- [ ] Parser validates all fields per spec (header, version, length, ranges)
- [ ] Builder produces spec-compliant packets
- [ ] `ParseError` variant covers all rejection cases
- [ ] `///` doc comments on all public items with `# Errors` section
- [ ] Spec-canonical hex test passes
- [ ] Round-trip test passes
- [ ] Truncation test passes
- [ ] Added to fuzz target
- [ ] Property-based test covers field ranges
- [ ] No `.unwrap()` or `.expect()` in non-test code
- [ ] Zero heap allocation in hot-path functions
- [ ] Integrated into `PacketDispatcher`
- [ ] IPC bridge to frontend defined (Tauri command or event)

---

_"We build this system not for fair weather. We build it for the moment the FOH switch is burning and the network is screaming. Only an implementation on SQLite-grade rigor gives us the confidence that LumenFlow will still be standing."_
