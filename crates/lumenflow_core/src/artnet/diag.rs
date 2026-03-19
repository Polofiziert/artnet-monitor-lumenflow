//! ArtDiagData (OpCode 0x2300) parser.
//!
//! Wire format per Art-Net 4: Header (12 bytes) + Priority (1 byte) + Length (2 bytes LE) + Data (variable).
//! Priority: 0x10=DpLow, 0x40=DpMed, 0x80=DpHigh, 0xe0=DpCritical, 0xf0=DpVolatile.

use zerocopy::{FromBytes, FromZeroes};

use super::{ParseError, ART_NET_HEADER};

/// Art-Net `OpDiagData` packet (OpCode 0x2300).
///
/// Wire layout per Art-Net 4 spec. Fixed header is 15 bytes; variable-length
/// diagnostic data follows.
///
/// # Safety
/// `#[repr(C, packed)]` ensures the struct matches the on-wire byte layout
/// exactly, with no padding inserted by the compiler.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtDiagDataPacket {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0x2300.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    /// Diagnostic priority: 0x10=DpLow, 0x40=DpMed, 0x80=DpHigh, 0xe0=DpCritical, 0xf0=DpVolatile.
    pub priority: u8,
    /// Length of diagnostic data in bytes (little-endian).
    pub length: [u8; 2],
}

impl ArtDiagDataPacket {
    /// Returns the diagnostic data length (little-endian on wire).
    pub fn data_length(&self) -> u16 {
        u16::from_le_bytes(self.length)
    }
}

/// Parses a raw UDP payload as an ArtDiagData (OpCode 0x2300) packet.
///
/// Returns the fixed header and the variable-length diagnostic data slice.
///
/// # Errors
/// Returns `ParseError::TooShort` if the header or data is truncated.
pub fn parse_diag_data(
    payload: &[u8],
) -> Result<(&ArtDiagDataPacket, &[u8]), ParseError> {
    let header_size = core::mem::size_of::<ArtDiagDataPacket>();
    let packet = ArtDiagDataPacket::ref_from_prefix(payload)
        .ok_or(ParseError::TooShort {
            expected: header_size,
            actual: payload.len(),
        })?;

    if packet.id != *ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }

    let opcode = u16::from_le_bytes(packet.opcode);
    if opcode != 0x2300 {
        return Err(ParseError::WrongOpCode {
            expected: 0x2300,
            actual: opcode,
        });
    }

    let data_len = packet.data_length() as usize;
    let data_end = header_size + data_len;
    if payload.len() < data_end {
        return Err(ParseError::TooShort {
            expected: data_end,
            actual: payload.len(),
        });
    }

    Ok((packet, &payload[header_size..data_end]))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Validates parsing of a known-good OpDiagData packet built from Art-Net 4 spec.
    #[test]
    fn test_parse_diag_data_from_spec() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            // Header: "Art-Net\0"
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            // OpCode (little-endian): 0x2300
            0x00, 0x23,
            // ProtVerHi, ProtVerLo: 0x00, 0x0e = 14
            0x00, 0x0e,
            // Priority: 0x40 (DpMed)
            0x40,
            // Length (LE): 4 bytes
            0x04, 0x00,
            // Data: "test"
            0x74, 0x65, 0x73, 0x74,
        ];

        let (parsed, data) = parse_diag_data(packet).expect("valid spec packet must parse");

        assert_eq!(u16::from_le_bytes(parsed.opcode), 0x2300);
        assert_eq!(parsed.proto_ver_hi, 0x00);
        assert_eq!(parsed.proto_ver_lo, 0x0e);
        assert_eq!(parsed.priority, 0x40);
        assert_eq!(parsed.data_length(), 4);
        assert_eq!(data, b"test");
    }

    /// Rejects packets shorter than the fixed-size header.
    #[test]
    fn test_parse_diag_data_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_diag_data(truncated).is_err());
    }

    /// Rejects packets with wrong OpCode.
    #[test]
    fn test_parse_diag_data_wrong_opcode() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x20, // OpPoll instead of OpDiagData
            0x00, 0x0e,
            0x40,
            0x00, 0x00,
        ];
        assert!(parse_diag_data(packet).is_err());
    }

    /// Rejects packets with declared length exceeding payload.
    #[test]
    fn test_parse_diag_data_truncated_data() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x23,
            0x00, 0x0e,
            0x40,
            0x10, 0x00, // Length 16, but only 0 bytes follow
        ];
        assert!(parse_diag_data(packet).is_err());
    }

    /// Accepts empty diagnostic data.
    #[test]
    fn test_parse_diag_data_empty_data() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x23,
            0x00, 0x0e,
            0x80, // DpHigh
            0x00, 0x00, // Length 0
        ];
        let (parsed, data) = parse_diag_data(packet).expect("empty data must parse");
        assert_eq!(parsed.priority, 0x80);
        assert_eq!(parsed.data_length(), 0);
        assert!(data.is_empty());
    }
}
