//! ArtDmx (OpCode 0x5000) wire-format struct and parser.

use zerocopy::{FromBytes, FromZeroes};

use super::{
    ArtNetPacket, ParseError, ART_NET_HEADER, ART_NET_PROTOCOL_VERSION, DMX_CHANNELS_PER_UNIVERSE,
    OpCode,
};

/// Art-Net `OpDmx` header (18 bytes), followed by 2–512 bytes of DMX data.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtDmxHeader {
    pub id: [u8; 8],
    pub opcode: [u8; 2],
    pub proto_ver_hi: u8,
    pub proto_ver_lo: u8,
    pub sequence: u8,
    pub physical: u8,
    pub port_address: [u8; 2],
    pub dmx_length: [u8; 2],
}

impl ArtDmxHeader {
    /// Returns the 15-bit port-address (little-endian on wire).
    pub fn port_address(&self) -> u16 {
        u16::from_le_bytes(self.port_address)
    }

    /// Returns the DMX data length (big-endian on wire).
    pub fn dmx_length(&self) -> u16 {
        u16::from_be_bytes(self.dmx_length)
    }
}

/// Parses a raw UDP payload as an ArtDmx (OpCode 0x5000) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the header or data is truncated, or
/// `ParseError::InvalidDmxLength` if the declared length is odd or out of range.
pub(super) fn parse_dmx(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let header_size = core::mem::size_of::<ArtDmxHeader>();
    let header = ArtDmxHeader::ref_from_prefix(payload).ok_or(ParseError::TooShort {
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
    Ok(ArtNetPacket::Dmx {
        header,
        dmx_data: &payload[header_size..data_end],
    })
}

/// Builds a spec-compliant ArtDmx (OpCode 0x5000) packet.
///
/// Zero-pads `dmx_data` to 512 bytes if shorter. Always emits full 512-channel
/// packets for compatibility with receivers expecting full frames.
///
/// # Returns
/// A `Vec<u8>` of length 530 (18-byte header + 512 bytes DMX) ready to send via UDP.
pub fn build_art_dmx(universe: u16, sequence: u8, dmx_data: &[u8]) -> Vec<u8> {
    let mut pkt = Vec::with_capacity(18 + DMX_CHANNELS_PER_UNIVERSE);
    pkt.extend_from_slice(ART_NET_HEADER);
    pkt.extend_from_slice(&(OpCode::Dmx as u16).to_le_bytes());
    pkt.extend_from_slice(&ART_NET_PROTOCOL_VERSION.to_be_bytes());
    pkt.push(sequence);
    pkt.push(0x00); // physical
    pkt.extend_from_slice(&universe.to_le_bytes());
    pkt.extend_from_slice(&(DMX_CHANNELS_PER_UNIVERSE as u16).to_be_bytes());
    pkt.extend_from_slice(&dmx_data[..dmx_data.len().min(DMX_CHANNELS_PER_UNIVERSE)]);
    while pkt.len() < 18 + DMX_CHANNELS_PER_UNIVERSE {
        pkt.push(0);
    }
    pkt
}
