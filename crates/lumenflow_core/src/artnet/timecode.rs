//! ArtTimeCode (OpCode 0x9700) parser.
//!
//! Fixed 19-byte packet per Art-Net 4 spec: transports timecode data over the network.
//! Type: 0=Film(24fps), 1=EBU(25fps), 2=DF(29.97fps), 3=SMPTE(30fps).

use zerocopy::{FromBytes, FromZeroes};

use super::{ParseError, ART_NET_HEADER};

/// Art-Net `OpTimeCode` packet (OpCode 0x9700).
///
/// Wire layout per Art-Net 4 spec, Section TimeCode. Fixed 19 bytes.
///
/// # Safety
/// `#[repr(C, packed)]` ensures the struct matches the on-wire byte layout
/// exactly, with no padding inserted by the compiler.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtTimeCodePacket {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0x9700.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    /// Reserved (transmit as 0).
    pub filler: [u8; 2],
    /// Frames (0–29).
    pub frames: u8,
    /// Seconds (0–59).
    pub seconds: u8,
    /// Minutes (0–59).
    pub minutes: u8,
    /// Hours (0–23).
    pub hours: u8,
    /// Timecode type: 0=Film(24fps), 1=EBU(25fps), 2=DF(29.97fps), 3=SMPTE(30fps).
    pub timecode_type: u8,
}

/// Parses a raw UDP payload as an ArtTimeCode (OpCode 0x9700) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than 19 bytes.
pub fn parse_timecode(payload: &[u8]) -> Result<&ArtTimeCodePacket, ParseError> {
    let size = core::mem::size_of::<ArtTimeCodePacket>();
    let packet = ArtTimeCodePacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;

    if packet.id != *ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }

    let opcode = u16::from_le_bytes(packet.opcode);
    if opcode != 0x9700 {
        return Err(ParseError::WrongOpCode {
            expected: 0x9700,
            actual: opcode,
        });
    }

    Ok(packet)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Validates parsing of a known-good OpTimeCode packet built from Art-Net 4 spec.
    #[test]
    fn test_parse_timecode_from_spec() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            // Header: "Art-Net\0"
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            // OpCode (little-endian): 0x9700
            0x00, 0x97,
            // ProtVerHi, ProtVerLo: 0x00, 0x0e = 14
            0x00, 0x0e,
            // Filler: 0x00, 0x00
            0x00, 0x00,
            // Frames, Seconds, Minutes, Hours, Type
            0x0f, 0x1e, 0x2d, 0x17, 0x03, // 15 frames, 30 sec, 45 min, 23 hrs, SMPTE
        ];

        let parsed = parse_timecode(packet).expect("valid spec packet must parse");

        assert_eq!(u16::from_le_bytes(parsed.opcode), 0x9700);
        assert_eq!(parsed.proto_ver_hi, 0x00);
        assert_eq!(parsed.proto_ver_lo, 0x0e);
        assert_eq!(parsed.filler, [0x00, 0x00]);
        assert_eq!(parsed.frames, 0x0f);
        assert_eq!(parsed.seconds, 0x1e);
        assert_eq!(parsed.minutes, 0x2d);
        assert_eq!(parsed.hours, 0x17);
        assert_eq!(parsed.timecode_type, 0x03);
    }

    /// Rejects packets shorter than the fixed-size header.
    #[test]
    fn test_parse_timecode_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_timecode(truncated).is_err());
    }

    /// Rejects packets with wrong OpCode.
    #[test]
    fn test_parse_timecode_wrong_opcode() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x20, // OpPoll instead of OpTimeCode
            0x00, 0x0e,
            0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        assert!(parse_timecode(packet).is_err());
    }
}
