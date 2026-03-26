//! ArtCommand (OpCode 0x2400) parser and builder.
//!
//! Wire format per Art-Net 4 spec: Header(12) + EstaMan(2 BE) + Length(2 BE) + Data[Length].
//! Standard commands (SwoutText, SwinText) use EstaMan = 0xFFFF. Data is null-terminated.

use zerocopy::{FromBytes, FromZeroes};

use super::{OpCode, ParseError, ART_NET_HEADER, ART_NET_PROTOCOL_VERSION};

/// Art-Net `OpCommand` fixed header (12 bytes). Data follows as variable-length ASCII text.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtCommandHeader {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0x2400.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
}

/// Maximum length of command data payload (bytes).
pub const ART_COMMAND_DATA_MAX: usize = 512;

/// Minimum ArtCommand size: header(12) + EstaMan(2) + Length(2) = 16 bytes.
const ART_COMMAND_MIN_LEN: usize = 16;

/// Parses a raw UDP payload as an ArtCommand (OpCode 0x2400) packet.
///
/// Per Art-Net 4 spec: Header(12) + EstaMan(2 BE) + Length(2 BE) + Data[Length].
/// Returns the header and the command data slice (excluding null terminator for convenience).
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than 16 bytes or 16+length.
/// Returns `ParseError::WrongOpCode` if the OpCode is not 0x2400.
pub(super) fn parse_command(payload: &[u8]) -> Result<(&ArtCommandHeader, &[u8]), ParseError> {
    const HEADER_SIZE: usize = core::mem::size_of::<ArtCommandHeader>();
    if payload.len() < ART_COMMAND_MIN_LEN {
        return Err(ParseError::TooShort {
            expected: ART_COMMAND_MIN_LEN,
            actual: payload.len(),
        });
    }
    let header = ArtCommandHeader::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: HEADER_SIZE,
        actual: payload.len(),
    })?;
    if header.id != *ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }
    let opcode = u16::from_le_bytes(header.opcode);
    if opcode != OpCode::Command as u16 {
        return Err(ParseError::WrongOpCode {
            expected: OpCode::Command as u16,
            actual: opcode,
        });
    }
    let length = u16::from_be_bytes([payload[14], payload[15]]) as usize;
    let data_end = 16 + length;
    if payload.len() < data_end {
        return Err(ParseError::TooShort {
            expected: data_end,
            actual: payload.len(),
        });
    }
    let data = &payload[16..data_end];
    Ok((header, data))
}

/// ESTA manufacturer code for standard Art-Net commands (SwoutText, SwinText).
pub const ART_COMMAND_ESTA_STANDARD: u16 = 0xFFFF;

/// Builds an ArtCommand (OpCode 0x2400) packet per Art-Net 4 spec.
///
/// Wire format: Header(12) + EstaMan(2 BE) + Length(2 BE) + Data[Length].
/// Standard commands use EstaMan = 0xFFFF. Data is null-terminated.
///
/// # Errors
/// Returns `ParseError::TooShort` if the command string is empty.
/// Returns an error if the command exceeds 511 bytes (512 including null).
pub fn build_art_command(command: &str) -> Result<Vec<u8>, ParseError> {
    let data = command.as_bytes();
    if data.is_empty() {
        return Err(ParseError::TooShort {
            expected: 1,
            actual: 0,
        });
    }
    if data.len() >= ART_COMMAND_DATA_MAX {
        return Err(ParseError::CommandDataTooLong(data.len() + 1));
    }
    let length = (data.len() + 1) as u16; // +1 for null terminator
    let mut packet = Vec::with_capacity(16 + data.len() + 1);
    packet.extend_from_slice(ART_NET_HEADER.as_slice());
    packet.extend_from_slice(&(OpCode::Command as u16).to_le_bytes());
    packet.push((ART_NET_PROTOCOL_VERSION >> 8) as u8);
    packet.push((ART_NET_PROTOCOL_VERSION & 0xFF) as u8);
    packet.extend_from_slice(&ART_COMMAND_ESTA_STANDARD.to_be_bytes());
    packet.extend_from_slice(&length.to_be_bytes());
    packet.extend_from_slice(data);
    packet.push(0); // null terminator
    Ok(packet)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;
    use crate::ArtNetPacket;

    /// Validates parsing of a known-good OpCommand packet from Art-Net 4 spec.
    #[test]
    fn test_parse_art_command_from_spec() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            // Header: "Art-Net\0"
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            // OpCode (little-endian): 0x2400
            0x00, 0x24,
            // ProtVerHi, ProtVerLo: 0x00, 0x0e
            0x00, 0x0e,
            // EstaMan (BE): 0xFFFF
            0xFF, 0xFF,
            // Length (BE): 21 (SwoutText=TestLabel&\0)
            0x00, 0x15,
            // Data: SwoutText=TestLabel&\0
            0x53, 0x77, 0x6f, 0x75, 0x74, 0x54, 0x65, 0x78,
            0x74, 0x3d, 0x54, 0x65, 0x73, 0x74, 0x4c, 0x61,
            0x62, 0x65, 0x6c, 0x26, 0x00,
        ];

        match ArtNetParser::parse(packet) {
            Ok(ArtNetPacket::Command { header, data }) => {
                assert_eq!(u16::from_le_bytes(header.opcode), 0x2400);
                assert_eq!(header.proto_ver_hi, 0x00);
                assert_eq!(header.proto_ver_lo, 0x0e);
                assert_eq!(data, b"SwoutText=TestLabel&\0");
            }
            other => panic!("expected Command, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_command_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_command(truncated).is_err());
    }

    #[test]
    fn test_parse_art_command_empty_data() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x24, 0x00, 0x0e,
            0xFF, 0xFF, 0x00, 0x01,  // EstaMan, Length=1 (null only)
            0x00,
        ];
        let (header, data) = parse_command(packet).expect("valid minimal command");
        assert_eq!(u16::from_le_bytes(header.opcode), 0x2400);
        assert_eq!(data, b"\0");
    }

    #[test]
    fn test_build_art_command_swout_text() {
        let pkt = build_art_command("SwoutText=MyFixture&").expect("valid command");
        assert_eq!(pkt.len(), 16 + 21); // EstaMan+Length+ "SwoutText=MyFixture&\0"
        assert_eq!(&pkt[0..8], b"Art-Net\0");
        assert_eq!(u16::from_le_bytes([pkt[8], pkt[9]]), 0x2400);
        assert_eq!(u16::from_be_bytes([pkt[12], pkt[13]]), 0xFFFF);
        assert_eq!(u16::from_be_bytes([pkt[14], pkt[15]]), 21);
        assert_eq!(&pkt[16..], b"SwoutText=MyFixture&\0");
    }

    #[test]
    fn test_build_art_command_swin_text() {
        let pkt = build_art_command("SwinText=Input1&").expect("valid command");
        assert_eq!(&pkt[16..], b"SwinText=Input1&\0");
    }

    #[test]
    fn test_build_art_command_empty_fails() {
        assert!(build_art_command("").is_err());
    }

    #[test]
    fn test_build_and_parse_roundtrip() {
        let cmd = "SwoutText=Roundtrip&";
        let pkt = build_art_command(cmd).expect("build");
        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Command { data, .. }) => {
                assert_eq!(data, b"SwoutText=Roundtrip&\0");
            }
            other => panic!("expected Command, got {other:?}"),
        }
    }
}
