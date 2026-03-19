//! ArtInput (OpCode 0x7000) wire-format struct, parser and builder.

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, ParseError, ART_NET_HEADER};

/// Art-Net `OpInput` packet (OpCode 0x7000), 20 bytes on wire.
///
/// Sent by a controller to selectively disable (or re-enable) a node's
/// DMX input ports.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtInputPacket {
    pub id: [u8; 8],
    pub opcode: [u8; 2],
    pub proto_ver_hi: u8,
    pub proto_ver_lo: u8,
    pub filler1: u8,
    pub bind_index: u8,
    pub num_ports: [u8; 2],
    pub input: [u8; 4],
}

const _: () = {
    assert!(core::mem::size_of::<ArtInputPacket>() == 20);
    assert!(core::mem::align_of::<ArtInputPacket>() == 1);
};

impl ArtInputPacket {
    /// Returns the number of input ports (big-endian).
    pub fn num_ports(&self) -> u16 {
        u16::from_be_bytes(self.num_ports)
    }

    /// Returns `true` if the given port index (0–3) is disabled.
    pub fn is_disabled(&self, port: usize) -> bool {
        port < 4 && (self.input[port] & 0x01) != 0
    }
}

/// Parses a raw UDP payload as an ArtInput (OpCode 0x7000) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than the struct.
pub(super) fn parse_input(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let size = core::mem::size_of::<ArtInputPacket>();
    let packet = ArtInputPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;
    Ok(ArtNetPacket::Input(packet))
}

/// Builds a 20-byte ArtInput packet.
///
/// # Errors
/// This function is infallible.
pub fn build_art_input(bind_index: u8, inputs_disabled: [bool; 4]) -> [u8; 20] {
    let mut pkt = [0u8; 20];

    pkt[0..8].copy_from_slice(ART_NET_HEADER);
    pkt[8..10].copy_from_slice(&0x7000u16.to_le_bytes());
    pkt[10] = 0x00;
    pkt[11] = 0x0E;
    pkt[13] = bind_index;
    pkt[14..16].copy_from_slice(&4u16.to_be_bytes());

    for i in 0..4 {
        pkt[16 + i] = u8::from(inputs_disabled[i]);
    }

    pkt
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;

    #[test]
    fn test_build_art_input_round_trip() {
        let pkt = build_art_input(2, [false, true, false, true]);
        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Input(inp)) => {
                assert_eq!(inp.bind_index, 2);
                assert_eq!(inp.num_ports(), 4);
                assert!(!inp.is_disabled(0));
                assert!(inp.is_disabled(1));
                assert!(!inp.is_disabled(2));
                assert!(inp.is_disabled(3));
            }
            other => panic!("expected Input, got {other:?}"),
        }
    }

    #[test]
    fn test_build_art_input_all_enabled() {
        let pkt = build_art_input(0, [false; 4]);
        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Input(inp)) => {
                for i in 0..4 {
                    assert!(!inp.is_disabled(i), "port {i} should be enabled");
                }
            }
            other => panic!("expected Input, got {other:?}"),
        }
    }

    #[test]
    fn test_build_art_input_all_disabled() {
        let pkt = build_art_input(1, [true; 4]);
        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Input(inp)) => {
                for i in 0..4 {
                    assert!(inp.is_disabled(i), "port {i} should be disabled");
                }
            }
            other => panic!("expected Input, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_input_truncation_rejected() {
        let mut short = vec![0u8; 15];
        short[0..8].copy_from_slice(b"Art-Net\0");
        short[8..10].copy_from_slice(&0x7000u16.to_le_bytes());
        short[10] = 0x00;
        short[11] = 0x0E;
        assert!(matches!(
            ArtNetParser::parse(&short),
            Err(crate::artnet::ParseError::TooShort {
                expected: 20,
                actual: 15,
            })
        ));
    }

    #[test]
    fn test_build_art_input_wire_offsets() {
        let pkt = build_art_input(5, [true, false, true, false]);

        assert_eq!(&pkt[0..8], b"Art-Net\0");
        assert_eq!(u16::from_le_bytes([pkt[8], pkt[9]]), 0x7000);
        assert_eq!(pkt[10], 0x00);
        assert_eq!(pkt[11], 0x0E);
        assert_eq!(pkt[12], 0x00);
        assert_eq!(pkt[13], 5);
        assert_eq!(u16::from_be_bytes([pkt[14], pkt[15]]), 4);
        assert_eq!(pkt[16], 0x01);
        assert_eq!(pkt[17], 0x00);
        assert_eq!(pkt[18], 0x01);
        assert_eq!(pkt[19], 0x00);
    }
}
