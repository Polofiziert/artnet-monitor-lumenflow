---
name: spec-compliance
description: >-
  Wire-level Art-Net 4: zerocopy packed structs, endianness, ArtNetParser dispatch,
  hex-encoded unit tests, fuzz targets, and ParseError handling. Use when adding or
  changing OpCode parsers, packet layouts, or when the user mentions Art-Net bytes,
  parsing, or the spec document. For multi-packet flows, timeouts, merge policy, and
  UDP hardening, use art-net-protocol-patterns. Canonical naming traps and spec notes:
  docs/art-net4.txt and docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md.
---

# Art-Net 4 Spec-Compliance

Ensures every new OpCode handler strictly follows Art-Net 4 (Artistic Licence) specifications. Uses `#[repr(C, packed)]` structs with `zerocopy` for zero-copy byte-casting, and validates against hex-encoded sample packets.

**Multi-packet behaviour** (discovery windows, verify-after-ArtAddress, DMX merge policy, RDM transaction rules, unstable networks) belongs in [art-net-protocol-patterns](../art-net-protocol-patterns/SKILL.md). This skill stays on the **wire** and **parse** path.

## Project docs (read before inventing field names)

| Document | Use |
|----------|-----|
| [docs/art-net4.txt](../../../docs/art-net4.txt) | Authoritative field order and OpCode definitions |
| [docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md](../../../docs/development/ARTNET_PROTOCOL_PATTERNS_DMXW_COMPLIANCE.md) | Spec-cited behaviours and naming traps (e.g. Port Name terminology vs UI `short_name`) |
| [docs/api/CORE_API.md](../../../docs/api/CORE_API.md) | What `lumenflow_core` parses/builds vs still unimplemented |

## Parser coverage in `ArtNetParser`

Maintain this list when adding `match` arms in `crates/lumenflow_core/src/artnet/mod.rs`:

- **`ParseError::UnknownOpCode(u16)`** — wire value not in `OpCode::from_u16` (see `crates/lumenflow_core/src/artnet/mod.rs` `OpCode` enum).
- **`ParseError::Unimplemented(u16)`** — value **is** a known `OpCode` but **not** handled in `ArtNetParser::parse` (falls through to `_ => Err(Unimplemented)` after header/version checks). **ArtPollReply** is **not** in that `match`; it uses `poll_reply::parse_poll_reply` first.

**Handled inbound** (subset of `OpCode`): **Poll**, **PollReply** (dedicated path), **Dmx**, **Sync**, **Address**, **Input**, **DiagData**, **TimeCode**, **Command**, **Trigger**, **Nzs**, **IpProg**, **IpProgReply**, **DataRequest**, **DataReply**, **TimeSync**.

**Known `OpCode` variants still `Unimplemented` for inbound parse** (non-exhaustive; confirm against `match opcode` in `mod.rs`): **TodRequest**, **TodData**, **TodControl**, **Rdm**, **RdmSub**, **Media**, **MediaPatch**, **MediaControl**, **MediaContrlReply**, **Directory**, **DirectoryReply**, **VideoSetup**, **VideoPalette**, **VideoData**, **MacMaster**, **MacSlave**, **FirmwareMaster**, **FirmwareReply**, **FileTnMaster**, **FileFnMaster**, **FileFnReply**.

Submodules may still expose **builders** or **partial** parsers for some of these (e.g. TOD helpers in `artnet/tod.rs`); only wire dispatch through `ArtNetParser::parse` counts as “implemented” for `ArtNetPacket` consumers.

## Workflow

Copy this checklist and track progress:

```
Spec-Compliance Progress:
- [ ] Step 1: Identify OpCode and gather spec fields
- [ ] Step 2: Define the wire-format struct
- [ ] Step 3: Implement parsing logic
- [ ] Step 4: Write unit test with hex packet
- [ ] Step 5: Add fuzz target
- [ ] Step 6: Verify with clippy + miri
```

---

## Step 1: Identify OpCode and Gather Spec Fields

1. Look up the OpCode in the Art-Net 4 specification document.
2. Record every field in **exact wire order**: name, byte offset, size, endianness, and valid range.
3. Check the `OpCode` enum in `crates/lumenflow_core/src/artnet/mod.rs` — add the variant if missing.
4. For field layouts of common OpCodes, see [reference.md](reference.md).

---

## Step 2: Define the Wire-Format Struct

Place per-OpCode structs and `parse_*` functions in `crates/lumenflow_core/src/artnet/` (e.g. `dmx.rs`, `poll.rs`, `mod.rs`) — use a submodule when a type grows beyond a manageable size.

### Template

```rust
use zerocopy::{FromBytes, Immutable, KnownLayout};

/// Art-Net `OpXxx` packet (OpCode 0xNNNN).
///
/// Wire layout per Art-Net 4 spec, Section X.X.
/// All multi-byte fields are little-endian unless noted.
///
/// # Safety
/// `#[repr(C, packed)]` ensures the struct matches the on-wire byte layout
/// exactly, with no padding inserted by the compiler.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromBytes, KnownLayout, Immutable)]
pub struct ArtXxxPacket {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian).
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    // ... remaining fields in wire order
}
```

### Rules

| Rule                  | Detail                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Attribute**         | Always `#[repr(C, packed)]` — no padding, exact wire layout                                                                      |
| **Derives**           | `FromBytes, KnownLayout, Immutable` from `zerocopy`; plus `Debug, Clone, Copy`                                                   |
| **Field types**       | Use fixed-size primitives only: `u8`, `[u8; N]`, `u16` (with explicit endian handling)                                           |
| **Endianness**        | Art-Net uses **little-endian** for OpCode and Universe fields, **big-endian** for ProtVer. Document each field.                  |
| **No `Vec`/`String`** | Wire structs must be stack-only. Variable-length data (e.g., DMX channels) lives in a trailing `&[u8]` slice, not in the struct. |
| **Doc comments**      | Every field gets a `///` comment with its byte offset and meaning.                                                               |

### Parsing the struct from bytes

```rust
use zerocopy::FromBytes;

pub fn parse_art_xxx(payload: &[u8]) -> Result<&ArtXxxPacket, ParseError> {
    let (packet, _remainder) = ArtXxxPacket::ref_from_prefix(payload)
        .map_err(|_| ParseError::TooShort {
            expected: core::mem::size_of::<ArtXxxPacket>(),
            actual: payload.len(),
        })?;
    // Validate header
    if &packet.id != b"Art-Net\0" {
        return Err(ParseError::InvalidHeader);
    }
    // Validate OpCode
    let opcode = u16::from_le_bytes(packet.opcode);
    if opcode != 0xNNNN {
        return Err(ParseError::WrongOpCode { expected: 0xNNNN, actual: opcode });
    }
    Ok(packet)
}
```

---

## Step 3: Implement Parsing Logic

1. Add a match arm to `ArtNetParser::parse()` that dispatches on the OpCode.
2. Validate the header and protocol version before reading OpCode-specific fields.
3. Return typed `ParseError` variants — never `.unwrap()` or `.expect()`.
4. For variable-length trailing data, return `(&ArtXxxPacket, &[u8])`.

### Error types

Extend `ParseError` with descriptive variants:

```rust
#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("packet too short: expected {expected} bytes, got {actual}")]
    TooShort { expected: usize, actual: usize },
    #[error("invalid Art-Net header")]
    InvalidHeader,
    #[error("wrong OpCode: expected 0x{expected:04X}, got 0x{actual:04X}")]
    WrongOpCode { expected: u16, actual: u16 },
    #[error("unsupported protocol version: {0}")]
    UnsupportedVersion(u16),
    #[error("field `{field}` out of range: {value}")]
    FieldOutOfRange { field: &'static str, value: u16 },
}
```

---

## Step 4: Write Unit Test with Hex Packet

Every OpCode handler **must** have a test using a real hex-encoded packet. Construct the byte array from the spec's example or manually from field definitions.

### Template

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Validates parsing of a known-good OpXxx packet built from Art-Net 4 spec.
    #[test]
    fn test_parse_art_xxx_from_spec() {
        // Packet bytes constructed from Art-Net 4 spec, Section X.X
        #[rustfmt::skip]
        let packet: &[u8] = &[
            // Header: "Art-Net\0"
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            // OpCode (little-endian): 0xNNNN
            0xNN, 0xNN,
            // ProtVerHi, ProtVerLo (big-endian): 0x00, 0x0e = 14
            0x00, 0x0e,
            // ... remaining fields with inline comments
        ];

        let parsed = parse_art_xxx(packet).expect("valid spec packet must parse");

        // Assert every field matches expected spec values
        assert_eq!(u16::from_le_bytes(parsed.opcode), 0xNNNN);
        assert_eq!(parsed.proto_ver_hi, 0x00);
        assert_eq!(parsed.proto_ver_lo, 0x0e);
        // ... assert remaining fields
    }

    /// Rejects packets shorter than the fixed-size header.
    #[test]
    fn test_parse_art_xxx_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_art_xxx(truncated).is_err());
    }

    /// Rejects packets with wrong OpCode.
    #[test]
    fn test_parse_art_xxx_wrong_opcode() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x20, // OpPoll instead of OpXxx
            0x00, 0x0e,
            // ... pad to correct length
        ];
        assert!(parse_art_xxx(packet).is_err());
    }
}
```

### Test naming convention

- `test_parse_<opcode_name>_from_spec` — happy path with spec-sourced bytes
- `test_parse_<opcode_name>_too_short` — truncated packet
- `test_parse_<opcode_name>_wrong_opcode` — valid header, wrong OpCode
- `test_parse_<opcode_name>_<edge_case>` — field-specific boundary checks

---

## Step 5: Add Fuzz Target

Create a fuzz target in `crates/lumenflow_core/fuzz/fuzz_targets/`:

```rust
#![no_main]
use libfuzzer_sys::fuzz_target;
use lumenflow_core::artnet::parse_art_xxx;

fuzz_target!(|data: &[u8]| {
    let _ = parse_art_xxx(data);
});
```

The parser must **never panic** on arbitrary input.

---

## Step 6: Verify

Run these checks before considering the implementation complete:

```bash
cargo clippy -p lumenflow_core -- -D warnings
cargo test -p lumenflow_core
cargo +nightly miri test -p lumenflow_core  # UB check
```

---

## Quick Reference: Art-Net Common Header

All Art-Net packets share this 12-byte prefix:

| Offset | Size | Field     | Endian | Value                                     |
| ------ | ---- | --------- | ------ | ----------------------------------------- |
| 0      | 8    | ID        | —      | `"Art-Net\0"` (0x41 72 74 2d 4e 65 74 00) |
| 8      | 2    | OpCode    | LE     | Varies per packet type                    |
| 10     | 1    | ProtVerHi | —      | 0x00                                      |
| 11     | 1    | ProtVerLo | —      | 0x0e (14)                                 |

For per-OpCode field layouts, see [reference.md](reference.md).
