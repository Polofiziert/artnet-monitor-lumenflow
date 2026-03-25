//! ArtDataRequest (0x2700) and ArtDataReply (0x2800).
//!
//! Art-Net 4: Query product URLs and other device metadata.
//! DataRequest: Filler/ESTA/OEM, Type (DrUrlProduct 0x0001, DrUrlUserGuide 0x0002, etc).
//! DataReply: Type, Length, Data (URL string).

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, ParseError, ART_NET_HEADER};

/// Data request type constants (Art-Net 4).
pub const DR_POLL: u16 = 0x0000;
pub const DR_URL_PRODUCT: u16 = 0x0001;
pub const DR_URL_USER_GUIDE: u16 = 0x0002;
pub const DR_URL_SUPPORT: u16 = 0x0003;
pub const DR_URL_PERS_UDR: u16 = 0x0004;
pub const DR_URL_PERS_GDTF: u16 = 0x0005;

/// Art-Net `OpDataRequest` packet (0x2700).
///
/// Wire layout per Art-Net 4 spec. ESTA/OEM/Request are big-endian.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtDataRequestPacket {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0x2700.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    /// ESTA manufacturer code (2 bytes, big-endian).
    pub esta_man: [u8; 2],
    /// OEM code (2 bytes, big-endian).
    pub oem: [u8; 2],
    /// Request type (2 bytes, big-endian): DrUrlProduct 0x0001, etc.
    pub request: [u8; 2],
    /// Spare (22 bytes).
    pub spare: [u8; 22],
}

impl ArtDataRequestPacket {
    /// Returns the request type (big-endian).
    pub fn request_type(&self) -> u16 {
        u16::from_be_bytes(self.request)
    }

    /// Returns the ESTA manufacturer code (big-endian).
    pub fn esta_man(&self) -> u16 {
        u16::from_be_bytes(self.esta_man)
    }

    /// Returns the OEM code (big-endian).
    pub fn oem(&self) -> u16 {
        u16::from_be_bytes(self.oem)
    }
}

/// Builds an ArtDataRequest (OpCode 0x2700) packet per Art-Net 4 spec.
///
/// Sent UNICAST to the device IP to query product URLs and other metadata.
/// The device responds with ArtDataReply (0x2800) containing the URL string.
///
/// # Parameters
/// - `esta_man`: ESTA manufacturer code from ArtPollReply (decoded to host-order `u16`).
/// - `oem`: OEM code from ArtPollReply (decoded to host-order `u16`).
/// - `request_type`: One of `DR_URL_PRODUCT`, `DR_URL_USER_GUIDE`, `DR_URL_SUPPORT`, etc.
///
/// # Returns
/// A 44-byte packet ready to send via UDP to `target_ip:6454`.
pub fn build_art_data_request(esta_man: u16, oem: u16, request_type: u16) -> [u8; 44] {
    let mut pkt = [0u8; 44];
    pkt[0..8].copy_from_slice(ART_NET_HEADER);
    pkt[8..10].copy_from_slice(&0x2700u16.to_le_bytes());
    pkt[10] = 0x00;
    pkt[11] = 0x0e;
    pkt[12..14].copy_from_slice(&esta_man.to_be_bytes());
    pkt[14..16].copy_from_slice(&oem.to_be_bytes());
    pkt[16..18].copy_from_slice(&request_type.to_be_bytes());
    // spare[22] remains zero
    pkt
}

/// Art-Net `OpDataReply` packet (0x2800) fixed header.
///
/// Variable-length payload follows. Header is 20 bytes after common 12-byte prefix.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtDataReplyHeader {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0x2800.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    /// ESTA manufacturer code (2 bytes, big-endian).
    pub esta_man: [u8; 2],
    /// OEM code (2 bytes, big-endian).
    pub oem: [u8; 2],
    /// Request type (2 bytes, big-endian).
    pub request: [u8; 2],
    /// Payload length (2 bytes, big-endian).
    pub payload_length: [u8; 2],
}

impl ArtDataReplyHeader {
    /// Returns the payload length (big-endian).
    pub fn payload_length(&self) -> u16 {
        u16::from_be_bytes(self.payload_length)
    }

    /// Returns the request type (big-endian).
    pub fn request_type(&self) -> u16 {
        u16::from_be_bytes(self.request)
    }
}

/// Parses a raw UDP payload as an ArtDataRequest (OpCode 0x2700) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than the struct.
pub(super) fn parse_data_request(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let size = core::mem::size_of::<ArtDataRequestPacket>();
    let packet = ArtDataRequestPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;
    if packet.id.as_slice() != ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }
    if u16::from_le_bytes(packet.opcode) != 0x2700 {
        return Err(ParseError::WrongOpCode {
            expected: 0x2700,
            actual: u16::from_le_bytes(packet.opcode),
        });
    }
    Ok(ArtNetPacket::DataRequest(packet))
}

/// Parses a raw UDP payload as an ArtDataReply (OpCode 0x2800) packet.
///
/// Returns the header and the payload slice (URL string or other data).
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than the header
/// or if the declared payload length exceeds the remaining bytes.
pub(super) fn parse_data_reply(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let header_size = core::mem::size_of::<ArtDataReplyHeader>();
    let header = ArtDataReplyHeader::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: header_size,
        actual: payload.len(),
    })?;
    if header.id.as_slice() != ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }
    if u16::from_le_bytes(header.opcode) != 0x2800 {
        return Err(ParseError::WrongOpCode {
            expected: 0x2800,
            actual: u16::from_le_bytes(header.opcode),
        });
    }
    let plen = header.payload_length() as usize;
    let data_end = header_size + plen;
    if payload.len() < data_end {
        return Err(ParseError::TooShort {
            expected: data_end,
            actual: payload.len(),
        });
    }
    Ok(ArtNetPacket::DataReply {
        header,
        data: &payload[header_size..data_end],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;

    /// Validates parsing of a known-good ArtDataRequest packet.
    #[test]
    fn test_parse_art_data_request_from_spec() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x27,
            0x00, 0x0e,
            0x00, 0x00, 0x00, 0x00,  // ESTA=0, OEM=0
            0x00, 0x01,              // Request: DrUrlProduct
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];

        let parsed = parse_data_request(packet).expect("valid spec packet must parse");
        match parsed {
            ArtNetPacket::DataRequest(p) => {
                assert_eq!(u16::from_le_bytes(p.opcode), 0x2700);
                assert_eq!(p.request_type(), 0x0001);
                assert_eq!(p.esta_man(), 0);
                assert_eq!(p.oem(), 0);
            }
            _ => panic!("expected DataRequest"),
        }
    }

    #[test]
    fn test_parse_art_data_request_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_data_request(truncated).is_err());
    }

    #[test]
    fn test_parse_art_data_request_via_parser() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x27,
            0x00, 0x0e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        match ArtNetParser::parse(packet) {
            Ok(ArtNetPacket::DataRequest(p)) => assert_eq!(p.request_type(), 0x0002),
            other => panic!("expected DataRequest, got {other:?}"),
        }
    }

    /// Validates parsing of a known-good ArtDataReply packet with URL payload.
    #[test]
    fn test_parse_art_data_reply_from_spec() {
        let url = b"https://example.com/product";
        let plen = url.len() as u16;
        let mut packet = vec![0u8; 20 + url.len()];
        packet[0..8].copy_from_slice(b"Art-Net\0");
        packet[8..10].copy_from_slice(&0x2800u16.to_le_bytes());
        packet[10] = 0x00;
        packet[11] = 0x0e;
        packet[12..14].copy_from_slice(&0u16.to_be_bytes());
        packet[14..16].copy_from_slice(&0u16.to_be_bytes());
        packet[16..18].copy_from_slice(&0x0001u16.to_be_bytes());
        packet[18..20].copy_from_slice(&plen.to_be_bytes());
        packet[20..].copy_from_slice(url);

        let parsed = parse_data_reply(&packet).expect("valid spec packet must parse");
        match parsed {
            ArtNetPacket::DataReply { header, data } => {
                assert_eq!(u16::from_le_bytes(header.opcode), 0x2800);
                assert_eq!(header.request_type(), 0x0001);
                assert_eq!(header.payload_length(), url.len() as u16);
                assert_eq!(data, url);
            }
            _ => panic!("expected DataReply"),
        }
    }

    #[test]
    fn test_parse_art_data_reply_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_data_reply(truncated).is_err());
    }

    #[test]
    fn test_build_art_data_request() {
        let pkt = build_art_data_request(0x0043, 0x0001, DR_URL_PRODUCT);
        assert_eq!(&pkt[0..8], b"Art-Net\0");
        assert_eq!(u16::from_le_bytes([pkt[8], pkt[9]]), 0x2700);
        assert_eq!(u16::from_be_bytes([pkt[12], pkt[13]]), 0x0043);
        assert_eq!(u16::from_be_bytes([pkt[14], pkt[15]]), 0x0001);
        assert_eq!(u16::from_be_bytes([pkt[16], pkt[17]]), DR_URL_PRODUCT);
        assert_eq!(pkt.len(), 44);

        let parsed = parse_data_request(&pkt).expect("built packet must parse");
        match parsed {
            ArtNetPacket::DataRequest(p) => {
                assert_eq!(p.esta_man(), 0x0043);
                assert_eq!(p.oem(), 0x0001);
                assert_eq!(p.request_type(), DR_URL_PRODUCT);
            }
            _ => panic!("expected DataRequest"),
        }
    }

    #[test]
    fn test_parse_art_data_reply_empty_payload() {
        let mut packet = vec![0u8; 20];
        packet[0..8].copy_from_slice(b"Art-Net\0");
        packet[8..10].copy_from_slice(&0x2800u16.to_le_bytes());
        packet[10] = 0x00;
        packet[11] = 0x0e;
        packet[18..20].copy_from_slice(&0u16.to_be_bytes());

        match ArtNetParser::parse(&packet) {
            Ok(ArtNetPacket::DataReply { header, data }) => {
                assert_eq!(header.payload_length(), 0);
                assert!(data.is_empty());
            }
            other => panic!("expected DataReply, got {other:?}"),
        }
    }
}
