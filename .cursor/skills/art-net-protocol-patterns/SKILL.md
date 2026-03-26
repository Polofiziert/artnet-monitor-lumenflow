---
name: art-net-protocol-patterns
description: >-
  Design Art-Net 4 multi-packet flows, discovery/config verification, merge and
  subscription policy, and UDP hardening (timeouts, correlation, dedup, unstable
  networks). Use when choreographing Poll/PollReply, ArtAddress verify-after-write,
  TOD/RDM pairing, DMX+Sync source rules, multi-controller behaviour, or when the
  user mentions Art-Net workflows, network reliability, jitter, or trust boundaries.
  For wire layouts, parsers, and hex tests, use spec-compliance instead. For
  diagnostics event wording and operator triage semantics, use
  light-bytes-diagnostics.
---

# Art-Net 4 Protocol Interaction Patterns

This skill covers **how** Art-Net packets combine over time and topology: discovery windows, verification without application-level ACKs, merge policy, and **operational** behaviour on lossy or jittery UDP. It **does not** redefine field-by-field wire layouts; those belong in [spec-compliance](../spec-compliance/SKILL.md) and in [docs/art-net4.txt](../../../docs/art-net4.txt).

Diagnostics severity language and remediation text should align with [light-bytes-diagnostics](../light-bytes-diagnostics/SKILL.md) and `docs/development/LIGHT_BYTES_DIAGNOSTICS_STANDARD.md`.

## When to use which skill

| Need | Skill |
|------|--------|
| `#[repr(C, packed)]` structs, `ArtNetParser` arms, hex tests, `ParseError` | [spec-compliance](../spec-compliance/SKILL.md) |
| Poll loops, verify-after-ArtAddress, DMX stream keys, RDM transaction policy | **This skill** |

---

## 1. Trust and correlation (cross-cutting)

- **Do not use source IP alone** as stable device identity on multi-homed networks, Wi‑Fi, or when broadcast and unicast paths differ. Prefer tuples that survived **ArtPollReply** (e.g. **MAC + bind index + advertised IP**, plus your own **poll generation** or session id).
- **Composite keys** for streams: **(15-bit universe / port-address, source IP, source UDP port)** for ArtDmx; align with product-level merge rules.
- **ArtSync** should only **arm** output or timing logic when matched to **known** ArtDmx sources (same policy your app uses for “this rig”), not arbitrary datagrams on port 6454.
- **Broadcast** payloads are not proof of authenticity; treat them as **hints** until correlated with discovery or an explicit user binding.

---

## 2. Pattern: ArtPoll → ArtPollReply (discovery)

- Use a **bounded reply window** after each poll (hundreds of ms to a few seconds, capped); **stagger** polls with **exponential backoff + jitter** on busy or lossy segments to avoid broadcast storms.
- **Correlate** replies with a **monotonic poll generation id** and wall clock; **dedupe** nodes inside the window by a stable tuple (e.g. MAC, IP, bind index, short/long name per your registry).
- **Unstable networks:** expect **duplicate** PollReplies and **reordered** arrivals; idempotent upserts into discovery state.
- **Wire:** malformed or truncated PollReply must be rejected **before** updating discovery (parser rules live in spec-compliance).

---

## 3. Pattern: ArtAddress (no ACK) + verification

- ArtAddress is **optimistic**: there is no Art-Net “ACK” opcode for a successful rename/program.
- Maintain a **pending-change token** per target (IP/MAC/bind); **verify** with a **follow-up ArtPoll** (or spec-allowed readback) within **T_verify**; on mismatch, **retry with backoff** and cap attempts.
- **Strict parse** on outbound builds and inbound parse so garbage never drives config state.

---

## 4. Pattern: ArtDmx streaming + sequence

- **Per-stream state:** track **sequence** (and gap statistics) per logical key **(universe, source IP, source port)** — not IP alone.
- **Duplicates:** suppress identical `(universe, seq, source)` within a short window when the spec allows treating them as repeats.
- **Reordering:** a **small** reorder tolerance is optional for analytics; for **control** output, follow your merge/subscription policy explicitly.
- **Gaps:** count sequence gaps; surface warnings with **hysteresis** so single-packet loss does not flap the UI.
- **Multi-controller:** either **separate streams per source** or a documented **merge policy**; never silently overwrite without policy.

---

## 5. Pattern: ArtSync + source matching

- Apply sync only when tied to **configured or discovered** Dmx sources (IP:port or session binding per product rules).
- Ignore or deprioritize sync from **unknown** sources when the user expects a specific rig.

---

## 6. Pattern: TOD (broadcast / universe scope)

- Expect **duplicates** and **bursts**; **dedupe** with a short TTL using **(universe, source IP, UID / frame fingerprint)** or spec-relevant counters when present.
- Do not assume the same visibility as ArtPoll (VLANs, Wi‑Fi, filters): **partial visibility** is normal.

---

## 7. Pattern: ArtRdm / ArtRdmSub

- **Correlate** requests and responses with **RDM transaction number**, **destination UID**, and **subdevice / response type**; drop **late** responses that belong to a **superseded** transaction.
- **Serialize or single-flight** per UID to reduce cross-talk under loss.
- Per-operation-class **timeouts**; cap total wait per user action.
- **Wire:** checksum and length validation before mutating state (spec-compliance).

---

## 8. Unstable networks and “hardening” summary

| Concern | Practice |
|---------|----------|
| Loss / duplication | Bounded windows, idempotent discovery upserts, dedup keys, backoff + jitter |
| Jitter / non-44 Hz | Do not assume wall-clock frame period; sample metrics over windows |
| Reordering | Small reorder buffers only where needed; explicit policy for DMX vs analytics |
| Multi-NIC | Bind sockets and discovery to the intended interface; duplicate discovery if multiple captures |
| Split horizon | You may see PollReply but not Dmx (or the reverse); UI should not assume one implies the other |
| Offline / pcap replay | No real UDP timeouts; correlation rules may differ from live capture |
| IPC / UI fanout | Do not amplify every UDP packet to the frontend (see viewport-culling skill); backpressure matters under congestion |

---

## 9. Strict parse vs best-effort display

- **Mutation paths** (config, RDM writes, anything that changes devices) must use **spec-compliant** parsing and validation.
- **Monitoring-only** paths may use higher-level **best-effort** display of partial data **only** if failures are visible and never drive silent config — still prefer shared parsers from core for consistency.

---

## 10. Project references

- [docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md](../../../docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md) — spec-cited behaviours and naming traps (Port Name vs `short_name`, etc.).
- [docs/api/CORE_API.md](../../../docs/api/CORE_API.md) — what the core crate parses/builds vs `Unimplemented`.
- [spec-compliance](../spec-compliance/SKILL.md) — zerocopy structs, `ArtNetParser`, hex tests.
