//! ArtPoll (OpCode 0x2000) wire-format struct and parser.

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, ParseError};

/// Minimum ArtPoll length per Art-Net 4.
pub const ART_POLL_MIN_LEN: usize = 14;
/// Full ArtPoll length when extended fields are included.
pub const ART_POLL_FULL_LEN: usize = core::mem::size_of::<ArtPollPacket>();

/// Art-Net `OpPoll` packet (22 bytes full; 14 bytes minimum on wire).
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtPollPacket {
    pub id: [u8; 8],
    pub opcode: [u8; 2],
    pub proto_ver_hi: u8,
    pub proto_ver_lo: u8,
    pub flags: u8,
    pub diag_priority: u8,
    /// Top of the targeted port-address range (Hi, Lo). Valid when Flags bit 5 is set.
    pub target_port_top: [u8; 2],
    /// Bottom of the targeted port-address range (Hi, Lo). Valid when Flags bit 5 is set.
    pub target_port_bottom: [u8; 2],
    /// ESTA manufacturer code (Hi, Lo).
    pub esta_man: [u8; 2],
    /// OEM code (Hi, Lo).
    pub oem: [u8; 2],
}

/// Parses a raw UDP payload as an ArtPoll (OpCode 0x2000) packet.
///
/// Per Art-Net 4 spec, ArtPoll may be 14 bytes (legacy) or larger (fields added over time).
/// Short packets are zero-padded to the full packet size so the result is always a full `ArtPollPacket`
/// (target fields 0 when omitted). For 14–17 byte packets we use a heap buffer so the
/// returned reference is valid (one small allocation per minimal ArtPoll; discovery traffic
/// is low frequency).
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is shorter than 14 bytes.
pub(super) fn parse_poll(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    if payload.len() < ART_POLL_MIN_LEN {
        return Err(ParseError::TooShort {
            expected: ART_POLL_MIN_LEN,
            actual: payload.len(),
        });
    }
    if payload.len() >= ART_POLL_FULL_LEN {
        let packet = ArtPollPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
            expected: ART_POLL_FULL_LEN,
            actual: payload.len(),
        })?;
        return Ok(ArtNetPacket::Poll(packet));
    }
    let mut buf = Box::new([0u8; ART_POLL_FULL_LEN]);
    buf[..payload.len()].copy_from_slice(payload);
    let buf = Box::leak(buf);
    let packet = ArtPollPacket::ref_from_prefix(buf).ok_or(ParseError::TooShort {
        expected: ART_POLL_FULL_LEN,
        actual: payload.len(),
    })?;
    Ok(ArtNetPacket::Poll(packet))
}
