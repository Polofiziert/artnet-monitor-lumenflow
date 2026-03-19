//! ArtTrigger (OpCode 0x9900) parser and builder.
//!
//! Wire format per Art-Net 4 spec: Header(12) + Filler(2) + OEM(2 BE) + Key(1) + SubKey(1) + Data(512).
//! Key: 0=KeyAscii, 1=KeyMacro, 2=KeySoft, 3=KeyShow. OEM 0xFFFF = universal.

use zerocopy::{FromBytes, FromZeroes};

use super::{ParseError, ART_NET_HEADER, ART_NET_PROTOCOL_VERSION, OpCode};

/// Key type for ArtTrigger.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtTriggerKey {
    KeyAscii = 0,
    KeyMacro = 1,
    KeySoft = 2,
    KeyShow = 3,
}

impl ArtTriggerKey {
    /// Converts a raw `u8` into an `ArtTriggerKey` variant.
    pub fn from_u8(value: u8) -> ArtTriggerKey {
        match value {
            0 => ArtTriggerKey::KeyAscii,
            1 => ArtTriggerKey::KeyMacro,
            2 => ArtTriggerKey::KeySoft,
            3 => ArtTriggerKey::KeyShow,
            _ => ArtTriggerKey::KeyAscii,
        }
    }
}

/// OEM code for universal trigger (accepted by all nodes).
pub const ART_TRIGGER_OEM_UNIVERSAL: u16 = 0xFFFF;

/// Art-Net `OpTrigger` fixed header (18 bytes). Data payload (512 bytes) follows.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtTriggerPacket {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0x9900.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    /// Filler (2 bytes). Set to zero by sender, ignored by receiver.
    pub filler: [u8; 2],
    /// OEM code (big-endian). 0xFFFF = universal trigger.
    pub oem: [u8; 2],
    /// Key type: 0=KeyAscii, 1=KeyMacro, 2=KeySoft, 3=KeyShow.
    pub key: u8,
    /// SubKey (command or showfile number).
    pub sub_key: u8,
}

/// Total ArtTrigger packet size: 18-byte header + 512-byte payload.
pub const ART_TRIGGER_PACKET_SIZE: usize = 18 + 512;

impl ArtTriggerPacket {
    /// Returns the OEM code (big-endian on wire per Art-Net 4 spec).
    pub fn oem(&self) -> u16 {
        u16::from_be_bytes(self.oem)
    }

    /// Returns the key type as an enum.
    pub fn key_type(&self) -> ArtTriggerKey {
        ArtTriggerKey::from_u8(self.key)
    }

    /// Returns true if this is a universal trigger (OEM 0xFFFF).
    pub fn is_universal(&self) -> bool {
        self.oem() == ART_TRIGGER_OEM_UNIVERSAL
    }
}

/// Parses a raw UDP payload as an ArtTrigger (OpCode 0x9900) packet.
///
/// Per Art-Net 4 spec the full packet is 530 bytes (18-byte header + 512-byte payload).
/// This function validates the header; payload is not stored.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than 18 bytes.
pub(super) fn parse_trigger(payload: &[u8]) -> Result<&ArtTriggerPacket, ParseError> {
    let size = core::mem::size_of::<ArtTriggerPacket>();
    if payload.len() < size {
        return Err(ParseError::TooShort {
            expected: size,
            actual: payload.len(),
        });
    }
    let packet = ArtTriggerPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;
    if packet.id != *ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }
    let opcode = u16::from_le_bytes(packet.opcode);
    if opcode != OpCode::Trigger as u16 {
        return Err(ParseError::WrongOpCode {
            expected: OpCode::Trigger as u16,
            actual: opcode,
        });
    }
    Ok(packet)
}

/// Builds an ArtTrigger (OpCode 0x9900) packet per Art-Net 4 spec.
///
/// Wire format: Header(12) + Filler(2) + OEM(2 BE) + Key(1) + SubKey(1) + Data(512).
/// Use `oem: ART_TRIGGER_OEM_UNIVERSAL` for universal triggers.
/// Data payload is zero-padded (Key 0-3: payload not used per spec).
pub fn build_art_trigger(oem: u16, key: ArtTriggerKey, sub_key: u8) -> [u8; ART_TRIGGER_PACKET_SIZE] {
    let mut pkt = [0u8; ART_TRIGGER_PACKET_SIZE];
    pkt[0..8].copy_from_slice(ART_NET_HEADER.as_slice());
    pkt[8..10].copy_from_slice(&(OpCode::Trigger as u16).to_le_bytes());
    pkt[10] = (ART_NET_PROTOCOL_VERSION >> 8) as u8;
    pkt[11] = (ART_NET_PROTOCOL_VERSION & 0xFF) as u8;
    // Filler1, Filler2 at 12-13 (already zero)
    pkt[14..16].copy_from_slice(&oem.to_be_bytes());
    pkt[16] = key as u8;
    pkt[17] = sub_key;
    // Data[512] at 18-529 (already zero)
    pkt
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;
    use crate::ArtNetPacket;

    /// Validates parsing of a known-good OpTrigger packet from Art-Net 4 spec.
    #[test]
    fn test_parse_art_trigger_from_spec() {
        let mut packet = [0u8; ART_TRIGGER_PACKET_SIZE];
        packet[0..8].copy_from_slice(b"Art-Net\0");
        packet[8..10].copy_from_slice(&0x9900u16.to_le_bytes());
        packet[10] = 0x00;
        packet[11] = 0x0e;
        // Filler at 12-13 (zero)
        packet[14..16].copy_from_slice(&0xFFFFu16.to_be_bytes());
        packet[16] = 0; // KeyAscii
        packet[17] = 0x42; // SubKey

        match ArtNetParser::parse(&packet) {
            Ok(ArtNetPacket::Trigger(p)) => {
                assert_eq!(u16::from_le_bytes(p.opcode), 0x9900);
                assert_eq!(p.oem(), 0xFFFF);
                assert!(p.is_universal());
                assert_eq!(p.key_type(), ArtTriggerKey::KeyAscii);
                assert_eq!(p.sub_key, 0x42);
            }
            other => panic!("expected Trigger, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_trigger_key_macro() {
        let mut packet = [0u8; ART_TRIGGER_PACKET_SIZE];
        packet[0..8].copy_from_slice(b"Art-Net\0");
        packet[8..10].copy_from_slice(&0x9900u16.to_le_bytes());
        packet[10] = 0x00;
        packet[11] = 0x0e;
        packet[14..16].copy_from_slice(&0x0001u16.to_be_bytes());
        packet[16] = 1; // KeyMacro
        packet[17] = 5;
        match ArtNetParser::parse(&packet) {
            Ok(ArtNetPacket::Trigger(p)) => {
                assert_eq!(p.oem(), 0x0001);
                assert!(!p.is_universal());
                assert_eq!(p.key_type(), ArtTriggerKey::KeyMacro);
                assert_eq!(p.sub_key, 5);
            }
            other => panic!("expected Trigger, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_trigger_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_trigger(truncated).is_err());
    }

    #[test]
    fn test_build_art_trigger_universal() {
        let pkt = build_art_trigger(ART_TRIGGER_OEM_UNIVERSAL, ArtTriggerKey::KeyMacro, 3);
        assert_eq!(pkt.len(), ART_TRIGGER_PACKET_SIZE);
        assert_eq!(&pkt[0..8], b"Art-Net\0");
        assert_eq!(u16::from_le_bytes([pkt[8], pkt[9]]), 0x9900);
        assert_eq!(pkt[12], 0);
        assert_eq!(pkt[13], 0);
        assert_eq!(u16::from_be_bytes([pkt[14], pkt[15]]), 0xFFFF);
        assert_eq!(pkt[16], ArtTriggerKey::KeyMacro as u8);
        assert_eq!(pkt[17], 3);
    }

    #[test]
    fn test_build_and_parse_roundtrip() {
        let pkt = build_art_trigger(0x1234, ArtTriggerKey::KeyShow, 42);
        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Trigger(p)) => {
                assert_eq!(p.oem(), 0x1234);
                assert_eq!(p.key_type(), ArtTriggerKey::KeyShow);
                assert_eq!(p.sub_key, 42);
            }
            other => panic!("expected Trigger, got {other:?}"),
        }
    }
}
