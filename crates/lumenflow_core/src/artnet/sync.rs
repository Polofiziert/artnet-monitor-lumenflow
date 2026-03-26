//! ArtSync (OpCode 0x5200) wire-format struct, parser and builder.

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, OpCode, ParseError, ART_NET_HEADER};

/// Art-Net `OpSync` packet (14 bytes on wire).
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtSyncPacket {
    pub id: [u8; 8],
    pub opcode: [u8; 2],
    pub proto_ver_hi: u8,
    pub proto_ver_lo: u8,
    pub aux1: u8,
    pub aux2: u8,
}

/// Parses a raw UDP payload as an ArtSync (OpCode 0x5200) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than the struct.
pub(super) fn parse_sync(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let size = core::mem::size_of::<ArtSyncPacket>();
    let packet = ArtSyncPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;
    Ok(ArtNetPacket::Sync(packet))
}

/// Builds a 14-byte ArtSync (OpCode 0x5200) packet per Art-Net 4 spec.
///
/// Aux1 and Aux2 are reserved; transmit as 0.
pub fn build_art_sync() -> [u8; 14] {
    let mut pkt = [0u8; 14];
    pkt[0..8].copy_from_slice(ART_NET_HEADER);
    pkt[8..10].copy_from_slice(&(OpCode::Sync as u16).to_le_bytes());
    pkt[10] = 0x00;
    pkt[11] = 0x0e;
    pkt[12] = 0x00; // aux1
    pkt[13] = 0x00; // aux2
    pkt
}
