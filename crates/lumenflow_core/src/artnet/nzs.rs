//! ArtNzs (OpCode 0x5100) parser.
//!
//! Identical to ArtDmx except byte 13 is StartCode instead of Physical.
//! Carries non-zero start code DMX512 data for a single Universe.

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, ParseError, DMX_CHANNELS_PER_UNIVERSE};

/// Art-Net `OpNzs` header (18 bytes), followed by 2–512 bytes of DMX data.
/// Same layout as ArtDmxHeader but byte 13 is StartCode instead of Physical.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtNzsHeader {
    pub id: [u8; 8],
    pub opcode: [u8; 2],
    pub proto_ver_hi: u8,
    pub proto_ver_lo: u8,
    pub sequence: u8,
    /// Non-zero start code (0x00 and RDM codes reserved).
    pub start_code: u8,
    pub port_address: [u8; 2],
    pub dmx_length: [u8; 2],
}

impl ArtNzsHeader {
    /// Returns the 15-bit port-address (little-endian on wire).
    pub fn port_address(&self) -> u16 {
        u16::from_le_bytes(self.port_address)
    }

    /// Returns the DMX data length (big-endian on wire).
    pub fn dmx_length(&self) -> u16 {
        u16::from_be_bytes(self.dmx_length)
    }
}

/// Parses a raw UDP payload as an ArtNzs (OpCode 0x5100) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the header or data is truncated, or
/// `ParseError::InvalidDmxLength` if the declared length is odd or out of range.
pub(super) fn parse_nzs(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let header_size = core::mem::size_of::<ArtNzsHeader>();
    let header = ArtNzsHeader::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: header_size,
        actual: payload.len(),
    })?;
    let dmx_len = header.dmx_length() as usize;
    if !(2..=DMX_CHANNELS_PER_UNIVERSE).contains(&dmx_len) || dmx_len % 2 != 0 {
        return Err(ParseError::InvalidDmxLength(header.dmx_length()));
    }
    let data_end = header_size + dmx_len;
    if payload.len() < data_end {
        return Err(ParseError::TooShort {
            expected: data_end,
            actual: payload.len(),
        });
    }
    Ok(ArtNetPacket::Nzs {
        header,
        dmx_data: &payload[header_size..data_end],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;
    use crate::ArtNetPacket;

    /// Validates parsing of a known-good OpNzs packet from Art-Net 4 spec.
    #[test]
    fn test_parse_art_nzs_from_spec() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            // Header: "Art-Net\0"
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            // OpCode (little-endian): 0x5100
            0x00, 0x51,
            // ProtVerHi, ProtVerLo: 0x00, 0x0e
            0x00, 0x0e,
            // Sequence, StartCode (0x91 = VLC example)
            0x01, 0x91,
            // Port address (little-endian): 0x0001
            0x01, 0x00,
            // DMX length (big-endian): 512
            0x02, 0x00,
            // DMX data (512 bytes)
        ];
        let mut full_packet = packet.to_vec();
        full_packet.extend_from_slice(&[0u8; 512]);

        match ArtNetParser::parse(&full_packet) {
            Ok(ArtNetPacket::Nzs { header, dmx_data }) => {
                assert_eq!(u16::from_le_bytes(header.opcode), 0x5100);
                assert_eq!(header.sequence, 0x01);
                assert_eq!(header.start_code, 0x91);
                assert_eq!(header.port_address(), 0x0001);
                assert_eq!(header.dmx_length(), 512);
                assert_eq!(dmx_data.len(), 512);
            }
            other => panic!("expected Nzs, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_nzs_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(ArtNetParser::parse(truncated).is_err());
    }

    #[test]
    fn test_parse_art_nzs_minimum_length() {
        #[rustfmt::skip]
        let mut packet: Vec<u8> = vec![
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x51, 0x00, 0x0e,
            0x00, 0x01,  // Sequence, StartCode
            0x00, 0x00,  // Port 0
            0x00, 0x02,  // Length 2 (big-endian)
        ];
        packet.extend_from_slice(&[0xFF, 0x80]);
        match ArtNetParser::parse(&packet) {
            Ok(ArtNetPacket::Nzs { header, dmx_data }) => {
                assert_eq!(header.start_code, 0x01);
                assert_eq!(header.dmx_length(), 2);
                assert_eq!(dmx_data, &[0xFF, 0x80]);
            }
            other => panic!("expected Nzs, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_nzs_odd_length_fails() {
        #[rustfmt::skip]
        let mut packet: Vec<u8> = vec![
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x51, 0x00, 0x0e,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x03,  // Length 3 (odd - invalid)
        ];
        packet.extend_from_slice(&[0xFF, 0x80, 0x00]);
        assert!(matches!(
            ArtNetParser::parse(&packet),
            Err(ParseError::InvalidDmxLength(3))
        ));
    }
}
