# Art-Net 4 Spec Compliance Assessment

**Date:** March 18, 2026  
**Scope:** Rust Art-Net backend (`lumenflow_core`), virtual scripts (`virtual-console`, `virtual-node`), spawn-virtual-network

---

## Executive Summary

The LumenFlow Art-Net Rust backend is in **good shape** regarding Art-Net 4 spec compliance. All six critical findings from the March 2026 implementation review have been addressed. The virtual scripts use the same spec-compliant builders from `lumenflow_core`. A few gaps remain for full "Luftschlösser-free" assurance.

---

## 1. Critical Fixes — Status

| ID  | Finding                               | Status   | Evidence                                                         |
| --- | ------------------------------------- | -------- | ---------------------------------------------------------------- |
| C1  | OpSync 0x9800 → 0x5200                | ✅ Fixed | `sync.rs`: OpCode 0x5200; `mod.rs`: Sync=0x5200, TimeSync=0x9800 |
| C2  | recv_buf 1024 → 2048                  | ✅ Fixed | `network.rs:91`: `vec![0u8; 2048]`                               |
| C3  | DeviceRegistry keyed by IP only       | ✅ Fixed | `device.rs`: `DashMap<(Ipv4Addr, u8), DeviceInfo>`               |
| C4  | ArtPollReply rejects 207-byte packets | ✅ Fixed | `poll_reply.rs`: MIN_LEN=207, padding for 207–238 bytes          |
| C5  | Mutex in hot path                     | ✅ Fixed | `buffer.rs`: `AtomicU64` for `last_update_nanos`                 |
| C6  | DashMap in UniverseStore              | ✅ Fixed | `buffer.rs`: flat `Box<[UniverseSlot]>` (32,768 slots)           |

---

## 2. OpCode Implementation Matrix

| OpCode | Name           | Parser | Builder | Tests                          |
| ------ | -------------- | ------ | ------- | ------------------------------ |
| 0x2000 | ArtPoll        | ✅     | ✅      | ✅                             |
| 0x2100 | ArtPollReply   | ✅     | ✅      | ✅ (207, 220, 239 bytes)       |
| 0x2300 | ArtDiagData    | ✅     | —       | ✅                             |
| 0x2400 | ArtCommand     | ✅     | ✅      | —                              |
| 0x5000 | ArtDmx         | ✅     | ✅      | ✅ (spec hex, odd-length, min) |
| 0x5200 | ArtSync        | ✅     | —       | ✅                             |
| 0x6000 | ArtAddress     | ✅     | ✅      | ✅                             |
| 0x7000 | ArtInput       | ✅     | ✅      | —                              |
| 0x9700 | ArtTimeCode    | ✅     | —       | ✅                             |
| 0x9800 | ArtTimeSync    | ✅     | —       | —                              |
| 0x9900 | ArtTrigger     | ✅     | ✅      | —                              |
| 0xF800 | ArtIpProg      | ✅     | ✅      | —                              |
| 0xF900 | ArtIpProgReply | ✅     | —       | —                              |
| 0x5100 | ArtNzs         | ✅     | —       | —                              |
| 0x2700 | ArtDataRequest | ✅     | ✅      | —                              |
| 0x2800 | ArtDataReply   | ✅     | —       | —                              |

---

## 3. Wire-Format Compliance

### 3.1 Common Header (12 bytes)

- **ID:** `"Art-Net\0"` (8 bytes) — validated in parser
- **OpCode:** Little-endian — correct
- **ProtVer:** Big-endian 14 (0x00 0x0e) — validated; rejects &lt; 14

### 3.2 ArtDmx (0x5000)

- Sequence, Physical, PortAddress (LE), Length (BE) — per spec
- DMX length: 2–512, must be even — enforced
- Zero-padding to 512 in builder — correct

### 3.3 ArtPollReply (0x2100)

- Accepts 207–239 bytes (Art-Net 3 + 4) — correct
- IpAddress network byte order — correct
- Port 6454 (0x1936 LE) — correct
- VersInfo, Oem, EstaMan, NumPorts — big-endian — correct

### 3.4 15-bit Port-Address Decoding

```rust
decode_port_address(sub_uni, net) = ((net & 0x7F) << 8) | sub_uni
```

Matches Art-Net 4: Net (14:8), SubNet (7:4), Universe (3:0).

### 3.5 Discovery & Broadcast

- Directed broadcast: `2.255.255.255`, `10.255.255.255`, `127.255.255.255` — per spec
- ArtPoll 18 bytes with targeted range fields — correct
- Poll interval 2.5 s — per spec

---

## 4. Virtual Scripts Compliance

### 4.1 Virtual Console

- Uses `lumenflow_core::build_art_dmx()` — spec-compliant
- Uses `build_mock_poll_reply()` — spec-compliant
- Responds to ArtPoll with ArtPollReply — correct
- Sends periodic ArtPollReply to target (for discovery) — correct
- Physical port 0–3 for merge testing — correct
- recv_buf 2048 — adequate

### 4.2 Virtual Node

- Uses `build_mock_poll_reply()` — spec-compliant
- Responds to ArtPoll with ArtPollReply — correct
- Periodic ArtPollReply to target — correct
- Parses ArtDmx, ArtSync — correct

### 4.3 Spawn Script & Config

- YAML-driven; uses CLI `virtual-console` and `virtual-node` — same builders
- Default: 2 consoles, 1 node — suitable for merge + discovery tests

---

## 5. Remaining Gaps (Spec & Robustness)

### 5.1 High Priority

| Gap            | Description                                 | Recommendation                                                                                                                                          |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1             | No 0–1 s random delay on ArtPollReply       | Spec: nodes should delay reply to avoid broadcast storm. Add `sleep(rng.gen_range(0..1000ms))` in virtual scripts and `build_our_poll_reply` call path. |
| H4             | No ArtDmx sequence validation               | When sequence != 0, discard out-of-order packets; log as metric.                                                                                        |
| Odd-length DMX | Parser rejects odd-length DMX (2–512, even) | Spec says even; some cheap nodes send odd. Consider accepting and truncating for interop.                                                               |

### 5.2 Medium Priority

| Gap             | Description                    | Recommendation                                 |
| --------------- | ------------------------------ | ---------------------------------------------- |
| Reference.md    | OpSync listed as 0x9800        | Fix: OpSync = 0x5200, OpTimeSync = 0x9800.     |
| ArtDmx TX rate  | No 44 Hz limit when sending    | Add rate limiter if LumenFlow ever TXs ArtDmx. |
| Viewport culler | recv_buf 256/512 in test paths | Ensure sufficient for ArtDmx (530 bytes).      |

### 5.3 Low Priority

| Gap                 | Description                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Art-Net subnet docs | 2.x.x.x and 10.x.x.x conventions not documented for users                                                       |
| HUMAN-NOTES         | "No artPoll packets" — LumenFlow _does_ send ArtPoll via discovery; clarify that virtual scripts only _respond_ |

---

## 6. Test Coverage for Spec Compliance

- **Unit tests:** Hex-encoded packets for ArtDmx, ArtPoll, ArtSync, ArtPollReply (207/220/239), ArtAddress, ArtDiagData, ArtTimeCode
- **Round-trip:** `build_art_dmx` → parse → assert
- **Property-based:** `property_tests.rs` for header variations
- **Fuzz:** `artnet_dmx_parser`, `artnet_header` targets
- **Chaos:** `network_simulation` for packet loss, jitter, reordering

---

## 7. Recommendations to Avoid "Luftschlösser"

1. **Add spec-canonical hex tests** for every new OpCode — use `.cursor/skills/spec-compliance/SKILL.md` workflow.
2. **Fix reference.md** — OpSync = 0x5200, OpTimeSync = 0x9800.
3. **Add ArtPollReply random delay** in virtual scripts and discovery self-reply path.
4. **Document Art-Net 4 Table 1** — maintain a single source of truth for OpCodes (e.g. in `reference.md`).
5. **CI regression** — run `cargo test -p lumenflow_core` and property/chaos tests on every PR.
6. **Wireshark validation** — periodically capture traffic from virtual scripts and verify in Wireshark (filter `udp.port == 6454`).

---

## 8. Conclusion

The Rust Art-Net backend and virtual scripts are **spec-compliant** for the implemented OpCodes. Critical structural issues from the implementation review are resolved. Remaining work is mainly robustness (sequence validation, ArtPollReply delay) and documentation (reference.md, subnet conventions). No major "Luftschlösser" risks were found in the current implementation.
