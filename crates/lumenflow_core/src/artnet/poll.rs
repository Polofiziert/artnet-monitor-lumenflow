//! ArtPoll (OpCode 0x2000) wire-format struct and parser.

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, ParseError};

/// Minimum ArtPoll length per Art-Net 4 (bytes 14–17 are optional targeted range).
pub const ART_POLL_MIN_LEN: usize = 14;
/// Full ArtPoll length when targeted port range is included.
pub const ART_POLL_FULL_LEN: usize = core::mem::size_of::<ArtPollPacket>();

/// Art-Net `OpPoll` packet (18 bytes full; 14 bytes minimum on wire).
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtPollPacket {
    pub id: [u8; 8],
    pub opcode: [u8; 2],
    pub proto_ver_hi: u8,
    pub proto_ver_lo: u8,
    pub flags: u8,
    pub diag_priority: u8,
    pub target_port_top: [u8; 2],
    pub target_port_bottom: [u8; 2],
}

/// Parses a raw UDP payload as an ArtPoll (OpCode 0x2000) packet.
///
/// Per Art-Net 4 spec, ArtPoll may be 14 bytes (without targeted port range) or 18 bytes.
/// Short packets are zero-padded to 18 bytes so the result is always a full `ArtPollPacket`
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
