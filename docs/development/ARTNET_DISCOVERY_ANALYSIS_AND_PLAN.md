# Art-Net Discovery: Analysis and Implementation Plan

**Date:** 2025-03-18  
**Context:** LumenFlow ↔ Protokoll discovery broken; root cause analysis and plan to align with Art-Net 4 spec and fix discovery.

---

## 1. Problem Summary

| Direction                 | Observation                                                           | Implication                                                                                                          |
| ------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Protokoll → LumenFlow** | Protokoll does not discover LumenFlow (LumenFlow not in device list). | LumenFlow is not replying to Protokoll’s ArtPoll, or Protokoll never sends ArtPoll to an address LumenFlow receives. |
| **LumenFlow → Protokoll** | LumenFlow Devices tab shows only LumenFlow, not Protokoll.            | LumenFlow either never receives Protokoll’s ArtPollReply, or the parser rejects it.                                  |

Pcaps show Protokoll sending valid 239-byte ArtPollReply to 192.168.2.108 (LumenFlow). So either those packets never reach the LumenFlow process (firewall/routing/pcap host), or they are received and dropped by the parser.

---

## 2. What’s Already Fixed (from RCA)

- `**our_ip` was `None`\*\* — Fallback now sets `our_ip` from the first non-loopback interface so ArtPollReply can be sent.
- **Self-echo** — ArtPoll from LumenFlow’s own IP is ignored; no reply to self; self not added via network path (added at startup).
- **Broken pipe** — Self-reply send to our own IP removed; LumenFlow is added to the device registry at listener startup.

---

## 3. Spec and Code Alignment

### 3.1 Art-Net 4 (Artistic Licence) – Relevant Points

- **Port:** 6454 UDP (single socket send + receive).
- **Discovery:** Controller sends **ArtPoll** (OpCode 0x2000) to directed broadcast; nodes reply with **ArtPollReply** (OpCode 0x2100) unicast to the poll sender.
- **Directed broadcast (spec):** 2.255.255.255, 10.255.255.255, 127.255.255.255. Many real setups use 192.168.x.x; subnet broadcast (e.g. 192.168.2.255) is then required for local discovery.
- **ArtPoll:** 18 bytes min; ProtVer 14 (0x00 0x0e) big-endian; OpCode little-endian.
- **ArtPollReply:** 207–239 bytes; no ProtVer at standard offset; IpAddress network byte order; Port 6454 LE (0x1936); 239 bytes full format.

LumenFlow’s implementation matches this (see ARTNET_SPEC_ASSESSMENT.md): binding 0.0.0.0:6454, 18-byte ArtPoll, 207–239 byte ArtPollReply with padding, correct OpCodes and port.

### 3.2 Where Packets Can Be Lost

| Stage            | Possible failure                                                                | How to verify                                                                                           |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Network**      | ArtPoll not sent to subnet (e.g. only 2.x/10.x) so 192.168.2.108 never sees it. | Pcap on LumenFlow host: ArtPoll from Protokoll to 192.168.2.255 or 192.168.2.108.                       |
| **OS / process** | Firewall or routing drops packets.                                              | Same pcap on the machine running LumenFlow.                                                             |
| **Receive path** | `our_ip` is `None` → we don’t send ArtPollReply.                                | Log `our_ip` at listener startup; log when ArtPoll received but `our_ip` is None.                       |
| **Parser**       | ArtPollReply (or ArtPoll) rejected → “Ignoring packet”.                         | Run with `RUST_LOG=lumenflow_ui=debug` and check “Received UDP packet from=…” and “Ignoring packet: …”. |

### 3.3 Binding: 0.0.0.0:6454 vs 192.168.2.108:6454

**Binding to `0.0.0.0:6454` is correct.** A socket bound to `0.0.0.0:6454` receives unicast to any local IPv4 (e.g. 192.168.2.108:6454) and directed broadcast to port 6454. You do **not** need to bind to 192.168.2.108:6454.

If Wireshark shows ArtPollReply arriving at the LumenFlow machine but the app never logs receiving it: (1) **Port conflict** — run `lsof -i :6454` while LumenFlow is running; only one process should listen. (2) **macOS Application Firewall** — allow LumenFlow **incoming**. (3) With default `RUST_LOG=info` you should see `Received UDP packet (discovery-sized) from=192.168.2.125 len=239`; if that never appears, the packet is not reaching the app.

### 3.4 Parser Rejection Points (ArtPollReply)

- **ArtPollReply** is handled in `mod.rs` with an early return (no ProtVer check).
- `poll_reply::parse_poll_reply` requires length ≥ 207; if 207–238 bytes, payload is padded to 239 and cast to `ArtPollReplyPacket`.
- Rejection only if: `payload.len() < 207`, or `ref_from_prefix` fails (e.g. alignment; with packed 239-byte struct and length 239 this should not happen for valid packets).
- Parse errors are already logged at **warn** (“Ignoring packet: {e}”), so if Protokoll’s reply is rejected, logs will show it.

Conclusion: If Protokoll’s 239-byte ArtPollReply is well-formed (header “Art-Net\0”, OpCode 0x2100 LE), it should parse. If it doesn’t, the log message will indicate the reason.

---

## 4. Expected Behavior (Recap)

- **LumenFlow sends:** Periodic ArtPoll to broadcast targets (spec + optional subnet 192.168.2.255); ArtPollReply only in response to an ArtPoll from another host, unicast to that host.
- **LumenFlow receives:** ArtPoll from others → reply with ArtPollReply (if `our_ip` set); ArtPollReply from others → upsert device (unless from self).
- **UI:** Devices tab shows self (from startup) plus every device discovered via ArtPollReply; online/offline from `last_seen`.

---

## 5. Implementation Plan

### Phase 1: Diagnostics (no behavior change)

1. **Startup logging**
   In `run_udp_listener`, log `our_ip` when the Art-Net UDP listener starts (e.g. `our_ip = ?our_ip`). This confirms whether LumenFlow can reply to ArtPoll at all.
2. **Fallback failure warning**
   In `derive_network_config`, after the fallback block, if `our_ip` is still `None`, log a **warn** (e.g. “No our_ip derived; ArtPollReply will not be sent. Select a NIC or enable subnet.”). This makes misconfiguration visible without debug.
3. **User verification steps**
   Document: run with `RUST_LOG=lumenflow_ui=debug,lumenflow_core=debug`, trigger discovery from Protokoll, then check:

- “Received UDP packet from=192.168.2.125” → packets reach process.
- “Received ArtPoll from external controller” / “Sent ArtPollReply” → we reply when polled.
- “Discovered Art-Net device” → we accept Protokoll’s ArtPollReply.
- “Ignoring packet: …” → parser rejection (inspect error and packet if needed).
- “Received ArtPoll but our_ip is None” → need to fix `our_ip` (NIC/fallback or sender-subnet).

### Phase 2: Sender-subnet fallback (primary fix for “no our_ip”)

When we receive an ArtPoll and `our_ip` is `None`, derive an IP from the **sender’s subnet** and use it for this reply (and optionally cache for self-registration):

1. **Helper:** `derive_cidr_from_sender(sender_ip: Ipv4Addr) -> String`
   Use a simple convention, e.g. /24 from first three octets: `a.b.c.d` → `a.b.c.0/24`. Covers 192.168.x.x, 10.x.x.x, 2.x.x.x.
2. **In ArtPoll handler:**
   `ip_to_use = our_ip.or_else(|| { from sender addr compute cidr; resolve_interface_for_cidr(&cidr).ok().flatten().map(|i| i.ip) });`  
    If `ip_to_use` is `Some`, build and send ArtPollReply; else log the existing “could not derive our_ip” warning.
3. **Optional:** When we derive IP from sender subnet, update a cached “last reply IP” so the next discovery tick or self-registration can use it (avoids re-resolving every time). Defer if not needed for MVP.

### Phase 3: Subnet broadcast and documentation

- Ensure **subnet broadcast** is added to discovery targets when using “All Interfaces” (or equivalent) so LumenFlow sends ArtPoll to 192.168.2.255 when on 192.168.2.x. (Already in place per RCA: fallback adds subnet_targets when broadcast is available.)
- Document in TESTING.md or SETUP.md: on 192.168.x.x, controllers (e.g. Protokoll) should send ArtPoll to the **subnet broadcast** (e.g. 192.168.2.255) so that LumenFlow receives it; spec-only 2.x/10.x broadcast does not reach 192.168.x.x.

### Phase 4: Optional robustness

- **ArtPollReply delay (spec):** Add 0–1 s random delay before sending ArtPollReply to reduce broadcast storms (see ARTNET_SPEC_ASSESSMENT.md H1). Defer until discovery is stable.
- **Parser diagnostics:** If we log “Ignoring packet” for a payload with length in 207..=239 and OpCode 0x2100, optionally log first 20 bytes hex to debug third-party ArtPollReply formats.
- **Reference.md:** Fix EstaMan if spec says LE (reference.md says LE; assessment says BE); confirm against official Art-Net 4 PDF. Low priority for discovery.

---

## 6. Checklist

- Add `our_ip` to “Art-Net UDP listener started” log.
- Add warning in `derive_network_config` when `our_ip` remains None after fallback.
- Implement sender-subnet fallback in ArtPoll handler (`derive_cidr_24_from_ip` + `resolve_interface_for_cidr`).
- Document verification steps (RUST_LOG, what to look for) in TESTING.md or SETUP.md.
- Confirm subnet broadcast is in discovery targets when using fallback (already done; spot-check).
- (Optional) ArtPollReply random delay; (optional) hex dump on ArtPollReply parse failure.

---

## 7. References

- `docs/development/ARTNET_DISCOVERY_ROOT_CAUSE_ANALYSIS.md`
- `docs/development/ARTNET_SPEC_ASSESSMENT.md`
- `.cursor/skills/spec-compliance/reference.md`
- `viewport_culler.rs` — `run_udp_listener`, ArtPoll/ArtPollReply handling
- `network_commands.rs` — `derive_network_config`, `our_ip` fallback
- `lumenflow_core/src/network/interfaces.rs` — `get_network_interfaces`, `resolve_interface_for_cidr`
- `lumenflow_core/src/artnet/poll_reply.rs` — ArtPollReply parse and layout
