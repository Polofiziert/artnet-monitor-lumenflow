# Art-Net Discovery Root Cause Analysis

**Problem:** LumenFlow does not send ArtPollReply to Protokoll when Protokoll sends ArtPoll. Protokoll cannot discover LumenFlow. Pcap shows no packets from LumenFlow (192.168.2.108) to Protokoll (192.168.2.125).

**Date:** 2025-03-18

---

## 1. Executive Summary

The ArtPollReply is only sent when `our_ip` is `Some`. The `our_ip` value is derived in `derive_network_config()` from either:

- Manual NIC selection
- Auto mode with a specific CIDR (e.g. `192.168.2.0/24`)
- **Fallback:** First non-loopback interface from `get_network_interfaces()`

When the fallback fails (empty interfaces, enumeration error, or platform-specific issues), `our_ip` remains `None` and **no ArtPollReply is ever sent**, even though ArtPoll is received and parsed correctly.

---

## 2. Code Path Analysis

### 2.1 Full Flow: ArtPoll Receive → ArtPollReply Send

```
UDP recv_from()  →  ArtNetParser::parse()  →  Poll match arm  →  if our_ip.is_some()  →  socket.send_to(reply, addr)
```

| Step | Location                     | Condition / Behavior                                    |
| ---- | ---------------------------- | ------------------------------------------------------- |
| 1    | `viewport_culler.rs:464`     | `socket.recv()` returns `(data, addr)`                  |
| 2    | `viewport_culler.rs:473`     | `ArtNetParser::parse(data)`                             |
| 3    | `artnet/mod.rs:240`          | `OpCode::Poll` → `poll::parse_poll(payload)`            |
| 4    | `poll.rs:26`                 | Requires ≥18 bytes; returns `ArtNetPacket::Poll(_)`     |
| 5    | `viewport_culler.rs:491-506` | **If `our_ip` is `Some`:** build reply, `send_to(addr)` |
| 6    |                              | **If `our_ip` is `None`:** Log warning, **no send**     |

### 2.2 Parser Rejection Points (Packet Never Reaches Handler)

If any of these fail, the packet is logged as `"Ignoring packet: {e}"` and the Poll handler is never reached:

| Condition                      | Error                | Location            |
| ------------------------------ | -------------------- | ------------------- |
| `payload.len() < 10`           | `TooShort`           | `artnet/mod.rs:211` |
| Header ≠ `"Art-Net\0"`         | `InvalidHeader`      | `artnet/mod.rs:217` |
| Unknown OpCode                 | `UnknownOpCode`      | `artnet/mod.rs:222` |
| `payload.len() < 12`           | `TooShort`           | `artnet/mod.rs:227` |
| `proto_ver < 14`               | `UnsupportedVersion` | `artnet/mod.rs:234` |
| `payload.len() < 18` (ArtPoll) | `TooShort`           | `poll.rs:27`        |

**Note:** ArtPollReply has a special early-return path and does not require protocol version check. ArtPoll does.

### 2.3 When is `our_ip` Set?

**`derive_network_config()` in `network_commands.rs`:**

| Path                        | Condition                                                        | `our_ip`                                 |
| --------------------------- | ---------------------------------------------------------------- | ---------------------------------------- | --- | -------------------------- | --- | ------ |
| Manual + NIC found          | `interface_mode == "manual"` and `primary_nic` matches           | `Some(iface.ip)`                         |
| Manual + NIC not found      | `primary_nic` set but no match                                   | `None`                                   |
| Manual + no NIC             | `primary_nic` is `None`                                          | `None`                                   |
| Auto + CIDR match           | `preferred_ip_cidr` matches an interface (e.g. `192.168.2.0/24`) | `Some(iface.ip)`                         |
| Auto + `0.0.0.0/0` or empty | Default settings                                                 | `None` (until fallback)                  |
| Auto + CIDR no match        | CIDR does not match any interface                                | `None`                                   |
| **Fallback**                | `our_ip.is_none()`                                               | `get_network_interfaces().ok().and_then( | i   | i.into_iter().next()).map( | i   | i.ip)` |

### 2.4 Fallback Block (Lines 183–196)

```rust
if our_ip.is_none() {
    if let Ok(ifaces) = get_network_interfaces() {
        if let Some(iface) = ifaces.into_iter().next() {
            our_ip = Some(iface.ip);
            // ...
        }
    }
}
```

`our_ip` stays `None` when:

1. `get_network_interfaces()` returns `Err`
2. `get_network_interfaces()` returns `Ok(vec![])` (no interfaces)
3. **Windows:** `get_network_interfaces()` is a stub that always returns `Ok(Vec::new())` — **fallback never works on Windows**

### 2.5 `get_network_interfaces()` Behavior

**`lumenflow_core/src/network/interfaces.rs`:**

- **Unix (macOS, Linux):** Uses `nix::ifaddrs::getifaddrs()`. Skips loopback. Returns interfaces in OS-defined order.
- **Windows:** Returns `Ok(Vec::new())` — **no implementation**.

**Interface order:** On macOS, `getifaddrs` order is implementation-defined. The first non-loopback interface might be `en0`, `utun0`, `awdl0`, etc. If the first interface is a tunnel (e.g. VPN) with an IP on a different subnet, we would still **send** the reply (we'd have an IP), but we'd advertise the wrong IP in the packet. The symptom "no packets at all" suggests we're not sending — i.e. `our_ip` is `None`.

---

## 3. Root Cause Hypotheses (Prioritized)

### H1: `our_ip` is `None` (Most Likely)

**Evidence:**

- Fallback depends on `get_network_interfaces()` returning at least one interface.
- On Windows, fallback never works.
- On macOS/Linux, `getifaddrs` could fail or return empty in edge cases (sandbox, container, no network).
- When `our_ip` is `None`, the handler explicitly logs: `"Received ArtPoll but our_ip is None — cannot reply"`.

**Verification:** Run LumenFlow with `RUST_LOG=debug` and check for:

- `"Received ArtPoll"` — confirms we receive and parse
- `"Received ArtPoll but our_ip is None"` — confirms root cause
- `"Derived our_ip from first interface"` — confirms fallback worked

### H2: ArtPoll Parser Rejection

**Evidence:**

- Protokoll might send ArtPoll with protocol version < 14.
- Malformed or truncated packets would be ignored with `"Ignoring packet: {e}"`.

**Verification:** Change `Err(e) => tracing::trace!(...)` to `tracing::warn!` temporarily and capture what errors appear when Protokoll sends.

### H3: ArtPoll Not Received (Binding/Routing)

**Evidence:**

- LumenFlow binds to `0.0.0.0:6454`. Should receive subnet broadcast (e.g. 192.168.2.255).
- If Protokoll sends only to spec addresses (2.255.255.255, 10.255.255.255), LumenFlow on 192.168.2.x would not receive (different subnet).

**Verification:** Pcap on LumenFlow's machine: do we see ArtPoll from Protokoll? If not, Protokoll may be using spec-only broadcast.

### H4: `send_to` Fails Silently

**Evidence:**

- We log `"ArtPollReply send failed: {e}"` on error. User would see this.
- Unlikely if pcap shows no packets — we'd expect at least an attempt.

---

## 4. Resolution Plan

### Phase 1: Diagnostics (No Code Change)

1. **Run with verbose logging:**
   ```bash
   RUST_LOG=lumenflow_ui=debug,lumenflow_core=debug ./path/to/lumenflow
   ```
2. **Check for:**
   - `"Art-Net UDP listener started"` with `our_ip` (add if missing)
   - `"Received ArtPoll"` when Protokoll polls
   - `"Received ArtPoll but our_ip is None"` — confirms H1
   - `"Ignoring packet"` — suggests H2
3. **Pcap:** Confirm ArtPoll arrives at LumenFlow's machine.

### Phase 2: Add Startup Logging

In `run_udp_listener`, log `our_ip` at startup:

```rust
tracing::info!(
    addr = %bind_addr,
    our_ip = ?our_ip,
    broadcast_targets = broadcast_targets.len(),
    "Art-Net UDP listener started"
);
```

In `derive_network_config`, when fallback fails:

```rust
if our_ip.is_none() {
    tracing::warn!("No our_ip derived; ArtPollReply will not be sent. Select a NIC or add subnet broadcast.");
}
```

### Phase 3: Sender-Subnet Fallback (Primary Fix)

When we receive ArtPoll and `our_ip` is `None`, derive `our_ip` from the sender's subnet:

1. Extract sender IP from `addr` (e.g. 192.168.2.125).
2. Derive CIDR from sender (e.g. 192.168.2.0/24 for 192.168.x.x).
3. Call `resolve_interface_for_cidr(cidr)` to find our interface on that subnet.
4. If found, use that IP for this reply (and optionally cache for discovery self-reply).

**Implementation sketch:**

```rust
Ok(lumenflow_core::ArtNetPacket::Poll(_)) => {
    tracing::debug!(from = %addr, "Received ArtPoll");
    let ip_to_use = our_ip.or_else(|| {
        if let std::net::SocketAddr::V4(v4) = addr {
            let sender = v4.ip();
            let cidr = derive_cidr_from_ip(*sender); // e.g. "192.168.2.0/24"
            resolve_interface_for_cidr(&cidr).ok().flatten().map(|i| i.ip)
        } else { None }
    });
    if let Some(ip) = ip_to_use {
        let reply = build_our_poll_reply(ip, [0u8; 6]);
        // ... send_to
    } else {
        tracing::warn!("Received ArtPoll but could not derive our_ip");
    }
}
```

### Phase 4: Windows Support

Implement `get_network_interfaces()` for Windows (e.g. via `netdev` or `ipconfig` parsing) so the fallback works.

### Phase 5: Subnet Broadcast in Discovery

If Protokoll only listens on subnet broadcast (192.168.2.255), ensure `subnet_targets` is populated when `our_ip` is derived. The current flow already adds to `subnet_targets` when we have an interface. Verify `subnet_broadcast: true` in settings when using "All Interfaces".

---

## 5. Testing Strategy

### 5.1 Unit Tests

- `derive_network_config` with mock `get_network_interfaces` returning empty → `our_ip` is `None`.
- `derive_network_config` with one interface → `our_ip` is `Some`.

### 5.2 Integration Test: Poll Discovers LumenFlow

**Location:** `tests/integration/discovery_poll.rs` (or add to existing integration suite).

1. Start LumenFlow (or a mock that replies to ArtPoll).
2. Run `cargo run -p lumenflow_cli -- poll --timeout 3`.
3. Assert LumenFlow appears in discovered devices.

**Mocking:** For unit tests of `derive_network_config`, use a test-only code path or feature flag to inject mock interfaces. Alternatively, test the sender-subnet fallback in isolation with a mock `resolve_interface_for_cidr` input.

### 5.3 Manual Test with Protokoll

1. Start LumenFlow with `RUST_LOG=debug`.
2. Start Protokoll.
3. Trigger discovery in Protokoll.
4. Check logs for "Received ArtPoll", "our_ip", "Sent ArtPollReply".
5. Pcap: verify ArtPollReply from LumenFlow to Protokoll.

### 5.4 Existing Scripts

- `scripts/spawn-virtual-network.sh` — virtual console and nodes.
- `cargo run -p lumenflow_cli -- poll` — sends ArtPoll, collects replies.
- `cargo run -p lumenflow_cli -- virtual-node` — replies to ArtPoll (use `--port 6455` if LumenFlow uses 6454).

**Suggested test:** Run LumenFlow and `lumenflow_cli poll` on the same machine. If poll discovers LumenFlow, the receive/reply path works. If not, logs will show why.

---

## 6. Checklist Before Implementation

- [ ] Add startup logging for `our_ip`
- [ ] Add warning when fallback fails in `derive_network_config`
- [ ] Implement sender-subnet fallback in ArtPoll handler
- [ ] Add `derive_cidr_from_ip` helper (handle 10.x, 172.16-31.x, 192.168.x.x)
- [ ] Add integration test: poll discovers LumenFlow
- [ ] Document in TESTING.md
- [ ] Verify against spec-compliance skill and project rules

---

## 7. Future Improvements (Post-Fix)

- **ARTNET_SPEC_ASSESSMENT.md H1:** Add 0–1 s random delay on ArtPollReply to avoid broadcast storms (spec recommendation). Defer until core discovery works.

---

## 8. Protokoll and Controller Compatibility

For LumenFlow to be discovered by external controllers (e.g. Protokoll) on the same subnet:

- **LumenFlow receives** on `0.0.0.0:6454` and will receive subnet broadcast (e.g. `192.168.2.255`).
- **Controllers must send ArtPoll** to subnet broadcast (e.g. `192.168.2.255`) for discovery on local networks.
- **If a controller only sends** to spec targets (`2.255.255.255`, `10.255.255.255`), it will not reach LumenFlow on `192.168.x.x` networks.

When using the "All Interfaces" fallback, LumenFlow now adds subnet broadcast to its discovery targets, so it sends ArtPoll to the local subnet (e.g. `192.168.2.255`), maximizing compatibility with controllers on the same subnet.

---

## 9. References

- `viewport_culler.rs` — `run_udp_listener`, ArtPoll handler
- `network_commands.rs` — `derive_network_config`, `our_ip` fallback
- `lumenflow_core/src/network/interfaces.rs` — `get_network_interfaces`
- `lumenflow_core/src/artnet/poll.rs` — ArtPoll parse
- `lumenflow_core/src/artnet/poll_reply.rs` — `build_our_poll_reply`
- `docs/development/TESTING.md` — Test infrastructure
- `.cursor/skills/spec-compliance/` — Art-Net 4 spec
