//! ArtTimeSync (OpCode 0x9800).
//!
//! Real-time date and clock synchronization. Different from ArtSync (0x5200)
//! which forces synchronous DMX output.

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, ParseError, ART_NET_HEADER};

/// Art-Net `OpTimeSync` packet (0x9800).
///
/// Wire layout per Art-Net 4 spec. Used to synchronise real-time date and clock.
/// Minimal packet: 14 bytes (header + 2 bytes aux/filler).
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtTimeSyncPacket {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0x9800.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    /// Aux1 (reserved, transmit as 0).
    pub aux1: u8,
    /// Aux2 (reserved, transmit as 0).
    pub aux2: u8,
}

/// Parses a raw UDP payload as an ArtTimeSync (OpCode 0x9800) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than the struct.
pub(super) fn parse_time_sync(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let size = core::mem::size_of::<ArtTimeSyncPacket>();
    let packet = ArtTimeSyncPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;
    if packet.id.as_slice() != ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }
    if u16::from_le_bytes(packet.opcode) != 0x9800 {
        return Err(ParseError::WrongOpCode {
            expected: 0x9800,
            actual: u16::from_le_bytes(packet.opcode),
        });
    }
    Ok(ArtNetPacket::TimeSync(packet))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;

    /// Validates parsing of a known-good ArtTimeSync packet.
    #[test]
    fn test_parse_art_time_sync_from_spec() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x98,  // OpCode (LE): 0x9800
            0x00, 0x0e,
            0x00, 0x00,
        ];

        let parsed = parse_time_sync(packet).expect("valid spec packet must parse");
        match parsed {
            ArtNetPacket::TimeSync(p) => {
                assert_eq!(u16::from_le_bytes(p.opcode), 0x9800);
                assert_eq!(p.aux1, 0x00);
                assert_eq!(p.aux2, 0x00);
            }
            _ => panic!("expected TimeSync"),
        }
    }

    #[test]
    fn test_parse_art_time_sync_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_time_sync(truncated).is_err());
    }

    #[test]
    fn test_parse_art_time_sync_wrong_opcode() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x52, 0x00, 0x0e, 0x00, 0x00,  // OpSync 0x5200 instead
        ];
        assert!(parse_time_sync(packet).is_err());
    }

    #[test]
    fn test_parse_art_time_sync_via_parser() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x98,
            0x00, 0x0e, 0x01, 0x02,
        ];
        match ArtNetParser::parse(packet) {
            Ok(ArtNetPacket::TimeSync(p)) => {
                assert_eq!(p.aux1, 0x01);
                assert_eq!(p.aux2, 0x02);
            }
            other => panic!("expected TimeSync, got {other:?}"),
        }
    }

    #[test]
    fn test_time_sync_distinct_from_sync() {
        // OpSync = 0x5200, OpTimeSync = 0x9800
        let sync_packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x52, 0x00, 0x0e, 0x00, 0x00,
        ];
        let time_sync_packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x98, 0x00, 0x0e, 0x00, 0x00,
        ];
        match ArtNetParser::parse(sync_packet) {
            Ok(ArtNetPacket::Sync(_)) => {}
            other => panic!("expected Sync, got {other:?}"),
        }
        match ArtNetParser::parse(time_sync_packet) {
            Ok(ArtNetPacket::TimeSync(_)) => {}
            other => panic!("expected TimeSync, got {other:?}"),
        }
    }
}
