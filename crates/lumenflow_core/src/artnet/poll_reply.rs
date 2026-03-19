//! ArtPollReply (OpCode 0x2100) wire-format struct, parser and builder.

use zerocopy::{FromBytes, FromZeroes};

use super::{decode_port_address, ArtNetPacket, ParseError, ART_NET_HEADER};

/// Art-Net `OpPollReply` packet (239 bytes on wire).
///
/// Unlike other Art-Net packets the protocol-version field sits *after* the
/// IP/port block, so this struct covers the full wire layout from byte 0.
///
/// Per spec, consumers must accept packets of 207 bytes or larger. Fields
/// after offset 206 (the `mac` field) are optional Art-Net 4 extensions.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtPollReplyPacket {
    pub id: [u8; 8],
    pub opcode: [u8; 2],
    pub ip_address: [u8; 4],
    pub port: [u8; 2],
    pub vers_info: [u8; 2],
    pub net_switch: u8,
    pub sub_switch: u8,
    pub oem: [u8; 2],
    pub ubea_version: u8,
    pub status1: u8,
    pub esta_man: [u8; 2],
    pub short_name: [u8; 18],
    pub long_name: [u8; 64],
    pub node_report: [u8; 64],
    pub num_ports: [u8; 2],
    pub port_types: [u8; 4],
    pub good_input: [u8; 4],
    pub good_output: [u8; 4],
    pub sw_in: [u8; 4],
    pub sw_out: [u8; 4],
    pub acn_priority: u8,
    pub sw_macro: u8,
    pub sw_remote: u8,
    pub spare: [u8; 3],
    pub style: u8,
    pub mac: [u8; 6],
    // --- Art-Net 4 optional fields (offset 207+) ---
    pub bind_ip: [u8; 4],
    pub bind_index: u8,
    pub status2: u8,
    pub good_output_b: [u8; 4],
    pub status3: u8,
    pub def_resp: [u8; 6],
    pub user: [u8; 2],
    pub refresh_rate: [u8; 2],
    pub filler: [u8; 11],
}

impl ArtPollReplyPacket {
    /// Returns the advertised IPv4 address.
    pub fn ip(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::new(
            self.ip_address[0],
            self.ip_address[1],
            self.ip_address[2],
            self.ip_address[3],
        )
    }

    /// Returns the short name as a trimmed UTF-8 string (max 18 chars).
    pub fn short_name_str(&self) -> &str {
        let end = self
            .short_name
            .iter()
            .position(|&b| b == 0)
            .unwrap_or(18);
        core::str::from_utf8(&self.short_name[..end]).unwrap_or("")
    }

    /// Returns the long name as a trimmed UTF-8 string (max 64 chars).
    pub fn long_name_str(&self) -> &str {
        let end = self
            .long_name
            .iter()
            .position(|&b| b == 0)
            .unwrap_or(64);
        core::str::from_utf8(&self.long_name[..end]).unwrap_or("")
    }

    /// Returns the firmware version from the big-endian `vers_info` field.
    pub fn firmware_version(&self) -> u16 {
        u16::from_be_bytes(self.vers_info)
    }

    /// Returns the OEM code from the big-endian `oem` field.
    pub fn oem_code(&self) -> u16 {
        u16::from_be_bytes(self.oem)
    }

    /// Returns the ESTA manufacturer code from the big-endian `esta_man` field.
    pub fn esta_man(&self) -> u16 {
        u16::from_be_bytes(self.esta_man)
    }

    /// Returns the number of ports from the big-endian `num_ports` field.
    pub fn num_ports(&self) -> u16 {
        u16::from_be_bytes(self.num_ports)
    }

    /// Returns the full 15-bit port-addresses for each output port.
    pub fn output_port_addresses(&self) -> Vec<u16> {
        let n = self.num_ports().min(4) as usize;
        (0..n)
            .map(|i| {
                decode_port_address(
                    (self.sub_switch << 4) | (self.sw_out[i] & 0x0F),
                    self.net_switch,
                )
            })
            .collect()
    }

    /// Returns the full 15-bit port-addresses for each input port (SwIn).
    pub fn input_port_addresses(&self) -> Vec<u16> {
        let n = self.num_ports().min(4) as usize;
        (0..n)
            .map(|i| {
                decode_port_address(
                    (self.sub_switch << 4) | (self.sw_in[i] & 0x0F),
                    self.net_switch,
                )
            })
            .collect()
    }
}

/// Parses a raw UDP payload as an ArtPollReply (OpCode 0x2100) packet.
///
/// ArtPollReply does **not** carry a protocol-version field at the standard
/// offset, so the caller must skip the version check before calling this.
///
/// Per Art-Net spec, packets of 207 bytes or larger are valid. Packets
/// between 207 and 238 bytes are zero-padded to 239 bytes on a stack
/// buffer before parsing, and the result is heap-boxed (one allocation
/// per short PollReply — acceptable since PollReply is infrequent).
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is shorter than 207 bytes.
pub(super) fn parse_poll_reply(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    const MIN_LEN: usize = 207;
    let full_size = core::mem::size_of::<ArtPollReplyPacket>();

    if payload.len() < MIN_LEN {
        return Err(ParseError::TooShort {
            expected: MIN_LEN,
            actual: payload.len(),
        });
    }

    if payload.len() >= full_size {
        let packet =
            ArtPollReplyPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
                expected: full_size,
                actual: payload.len(),
            })?;
        Ok(ArtNetPacket::PollReply(Box::new(*packet)))
    } else {
        let mut padded = [0u8; 239];
        padded[..payload.len()].copy_from_slice(payload);
        let packet =
            ArtPollReplyPacket::ref_from_prefix(&padded).ok_or(ParseError::TooShort {
                expected: full_size,
                actual: payload.len(),
            })?;
        Ok(ArtNetPacket::PollReply(Box::new(*packet)))
    }
}

// ── Builder ──────────────────────────────────────────────────────────

const ST_CONFIG: u8 = 0x05;

/// Builds a 239-byte ArtPollReply identifying LumenFlow as an Art-Net controller.
///
/// # Errors
/// This function is infallible.
pub fn build_our_poll_reply(our_ip: std::net::Ipv4Addr, our_mac: [u8; 6]) -> [u8; 239] {
    let mut pkt = [0u8; 239];
    let octets = our_ip.octets();

    pkt[0..8].copy_from_slice(ART_NET_HEADER);
    pkt[8..10].copy_from_slice(&0x2100u16.to_le_bytes());
    pkt[10..14].copy_from_slice(&octets);
    pkt[14..16].copy_from_slice(&6454u16.to_le_bytes());
    pkt[16] = 0x00;
    pkt[17] = 0x01;
    pkt[23] = 0x02; // Status1: RDM capable
    pkt[26..35].copy_from_slice(b"LumenFlow");
    pkt[44..69].copy_from_slice(b"LumenFlow Art-Net Monitor");
    pkt[200] = ST_CONFIG;
    pkt[201..207].copy_from_slice(&our_mac);
    pkt[207..211].copy_from_slice(&octets);
    pkt[211] = 1; // BindIndex
    pkt[212] = 0x08; // Status2: 15-bit port-address

    pkt
}

/// Configuration for building a mock ArtPollReply (e.g. for testing).
#[derive(Debug, Clone)]
pub struct MockPollReplyConfig {
    pub ip: std::net::Ipv4Addr,
    pub mac: [u8; 6],
    pub short_name: String,
    pub long_name: String,
    /// Output port 15-bit addresses (max 4 for basic reply).
    pub port_addresses: Vec<u16>,
}

/// Builds a 239-byte ArtPollReply for a mock node (testing without hardware).
pub fn build_mock_poll_reply(config: &MockPollReplyConfig) -> [u8; 239] {
    let mut pkt = [0u8; 239];
    let octets = config.ip.octets();

    pkt[0..8].copy_from_slice(ART_NET_HEADER);
    pkt[8..10].copy_from_slice(&0x2100u16.to_le_bytes());
    pkt[10..14].copy_from_slice(&octets);
    pkt[14..16].copy_from_slice(&6454u16.to_le_bytes());
    pkt[16] = 0x00;
    pkt[17] = 0x01;
    pkt[23] = 0x02; // Status1
    pkt[200] = ST_CONFIG;
    pkt[201..207].copy_from_slice(&config.mac);
    pkt[207..211].copy_from_slice(&octets);
    pkt[211] = 1;
    pkt[212] = 0x08; // Status2: 15-bit port-address

    let short = config.short_name.as_bytes();
    pkt[26..26 + short.len().min(18)].copy_from_slice(&short[..short.len().min(18)]);
    let long = config.long_name.as_bytes();
    pkt[44..44 + long.len().min(64)].copy_from_slice(&long[..long.len().min(64)]);

    let n = config.port_addresses.len().min(4);
    pkt[172..174].copy_from_slice(&(n as u16).to_be_bytes());
    pkt[174..178].copy_from_slice(&[0x80; 4]); // port_types: DMX output
    pkt[178..182].copy_from_slice(&[0x00; 4]); // good_input
    pkt[182..186].copy_from_slice(&[0x80; 4]); // good_output: data available
    for (i, &pa) in config.port_addresses.iter().take(4).enumerate() {
        let univ = (pa & 0x0F) as u8;
        let sub = ((pa >> 4) & 0x0F) as u8;
        let net = ((pa >> 8) & 0x7F) as u8;
        if i == 0 {
            pkt[18] = net;
            pkt[19] = sub;
        }
        pkt[190 + i] = univ; // sw_out: universe bits
    }

    pkt
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;

    #[test]
    fn test_build_our_poll_reply_round_trip() {
        let ip = std::net::Ipv4Addr::new(10, 0, 0, 42);
        let mac = [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF];
        let pkt = build_our_poll_reply(ip, mac);

        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::PollReply(reply)) => {
                assert_eq!(reply.ip(), ip);
                assert_eq!(reply.short_name_str(), "LumenFlow");
                assert_eq!(reply.long_name_str(), "LumenFlow Art-Net Monitor");
                assert_eq!(reply.style, ST_CONFIG);
                assert_eq!(reply.mac, mac);
                assert_eq!(reply.bind_index, 1);
                assert_eq!(reply.status2, 0x08);
                assert_eq!(reply.num_ports(), 0);
                assert_eq!(u16::from_le_bytes(reply.port), 6454);
                assert_eq!(reply.firmware_version(), 0x0001);
            }
            other => panic!("expected PollReply, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_poll_reply_207_bytes() {
        let mut packet = vec![0u8; 207];
        packet[0..8].copy_from_slice(b"Art-Net\0");
        packet[8] = 0x00;
        packet[9] = 0x21;
        packet[10] = 192;
        packet[11] = 168;
        packet[12] = 1;
        packet[13] = 100;
        packet[26..33].copy_from_slice(b"OldNode");
        match ArtNetParser::parse(&packet) {
            Ok(ArtNetPacket::PollReply(reply)) => {
                assert_eq!(reply.ip(), std::net::Ipv4Addr::new(192, 168, 1, 100));
                assert_eq!(reply.short_name_str(), "OldNode");
                assert_eq!(reply.bind_index, 0);
                assert_eq!(reply.status2, 0);
            }
            other => panic!("expected PollReply, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_poll_reply_220_bytes() {
        let mut packet = vec![0u8; 220];
        packet[0..8].copy_from_slice(b"Art-Net\0");
        packet[8] = 0x00;
        packet[9] = 0x21;
        packet[10] = 10;
        packet[11] = 10;
        packet[12] = 10;
        packet[13] = 10;
        // bind_index is at offset 211
        packet[211] = 0x42;
        match ArtNetParser::parse(&packet) {
            Ok(ArtNetPacket::PollReply(reply)) => {
                assert_eq!(reply.ip(), std::net::Ipv4Addr::new(10, 10, 10, 10));
                assert_eq!(reply.bind_index, 0x42);
            }
            other => panic!("expected PollReply, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_poll_reply_too_short_206() {
        let mut packet = vec![0u8; 206];
        packet[0..8].copy_from_slice(b"Art-Net\0");
        packet[8] = 0x00;
        packet[9] = 0x21;
        assert!(matches!(
            ArtNetParser::parse(&packet),
            Err(ParseError::TooShort {
                expected: 207,
                actual: 206
            })
        ));
    }

    #[test]
    fn test_build_our_poll_reply_wire_offsets() {
        let ip = std::net::Ipv4Addr::new(10, 0, 0, 1);
        let mac = [0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE];
        let pkt = build_our_poll_reply(ip, mac);

        assert_eq!(&pkt[0..8], b"Art-Net\0");
        assert_eq!(u16::from_le_bytes([pkt[8], pkt[9]]), 0x2100);
        assert_eq!(&pkt[10..14], &[10, 0, 0, 1]);
        assert_eq!(u16::from_le_bytes([pkt[14], pkt[15]]), 6454);
        assert_eq!(pkt[200], 0x05);
        assert_eq!(&pkt[201..207], &mac);
        assert_eq!(&pkt[207..211], &[10, 0, 0, 1]);
        assert_eq!(pkt[211], 1);
        assert_eq!(pkt.len(), 239);
    }
}
