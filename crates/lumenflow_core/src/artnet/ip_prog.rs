//! ArtIpProg (0xF800) and ArtIpProgReply (0xF900).
//!
//! IP configuration packets. ArtIpProg is sent unicast to reprogram a node's
//! IP/mask/gateway. ArtIpProgReply is the node's reply confirming settings.
//! Command byte bit 7 = read-only query (no programming).

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, ParseError, ART_NET_HEADER};

/// Art-Net `OpIpProg` packet (0xF800).
///
/// Wire layout per Art-Net 4 spec. All multi-byte fields (IP, mask, port, gateway)
/// are big-endian (network byte order).
///
/// Command byte: bit 7 = Enable Programming (0 = read-only query), bit 6 = Enable DHCP,
/// bit 5 = Program Gateway, bit 4 = Reset, bit 3 = Program IP, bit 2 = Program Subnet Mask,
/// bit 1 = Program Port.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtIpProgPacket {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0xF800.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    /// Filler (2 bytes), reserved.
    pub filler1: [u8; 2],
    /// Command byte. Bit 7 = read-only query.
    pub command: u8,
    /// Filler (1 byte), reserved.
    pub filler2: u8,
    /// IP address (4 bytes, network byte order).
    pub prog_ip: [u8; 4],
    /// Subnet mask (4 bytes, network byte order).
    pub prog_sm: [u8; 4],
    /// Port (2 bytes, big-endian).
    pub prog_port: [u8; 2],
    /// Default gateway (4 bytes, network byte order).
    pub prog_gw: [u8; 4],
    /// Spare (4 bytes).
    pub spare: [u8; 4],
}

impl ArtIpProgPacket {
    /// Returns true if bit 7 is set (enable programming). If clear, read-only query.
    pub fn is_programming_enabled(&self) -> bool {
        self.command & 0x80 != 0
    }

    /// Returns the programmed IP address.
    pub fn ip(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::new(
            self.prog_ip[0],
            self.prog_ip[1],
            self.prog_ip[2],
            self.prog_ip[3],
        )
    }

    /// Returns the programmed subnet mask.
    pub fn subnet_mask(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::new(
            self.prog_sm[0],
            self.prog_sm[1],
            self.prog_sm[2],
            self.prog_sm[3],
        )
    }

    /// Returns the programmed port (big-endian).
    pub fn port(&self) -> u16 {
        u16::from_be_bytes(self.prog_port)
    }

    /// Returns the programmed default gateway.
    pub fn gateway(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::new(
            self.prog_gw[0],
            self.prog_gw[1],
            self.prog_gw[2],
            self.prog_gw[3],
        )
    }
}

/// Art-Net `OpIpProgReply` packet (0xF900).
///
/// Node's reply confirming IP configuration. Status byte bit 6 = DHCP enabled.
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtIpProgReplyPacket {
    /// Art-Net magic header: `b"Art-Net\0"` (8 bytes).
    pub id: [u8; 8],
    /// OpCode low byte first (little-endian): 0xF900.
    pub opcode: [u8; 2],
    /// Protocol version high byte (0x00).
    pub proto_ver_hi: u8,
    /// Protocol version low byte (14 = 0x0e).
    pub proto_ver_lo: u8,
    /// Filler (4 bytes), reserved.
    pub filler: [u8; 4],
    /// Current IP address (4 bytes, network byte order).
    pub prog_ip: [u8; 4],
    /// Current subnet mask (4 bytes, network byte order).
    pub prog_sm: [u8; 4],
    /// Current port (2 bytes, big-endian).
    pub prog_port: [u8; 2],
    /// Status byte. Bit 6 = DHCP enabled.
    pub status: u8,
    /// Spare (1 byte).
    pub spare1: u8,
    /// Default gateway (4 bytes, network byte order).
    pub prog_gw: [u8; 4],
    /// Spare (2 bytes).
    pub spare2: [u8; 2],
}

impl ArtIpProgReplyPacket {
    /// Returns true if DHCP is enabled (status bit 6).
    pub fn dhcp_enabled(&self) -> bool {
        self.status & 0x40 != 0
    }

    /// Returns the current IP address.
    pub fn ip(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::new(
            self.prog_ip[0],
            self.prog_ip[1],
            self.prog_ip[2],
            self.prog_ip[3],
        )
    }

    /// Returns the current subnet mask.
    pub fn subnet_mask(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::new(
            self.prog_sm[0],
            self.prog_sm[1],
            self.prog_sm[2],
            self.prog_sm[3],
        )
    }

    /// Returns the current port (big-endian).
    pub fn port(&self) -> u16 {
        u16::from_be_bytes(self.prog_port)
    }

    /// Returns the default gateway.
    pub fn gateway(&self) -> std::net::Ipv4Addr {
        std::net::Ipv4Addr::new(
            self.prog_gw[0],
            self.prog_gw[1],
            self.prog_gw[2],
            self.prog_gw[3],
        )
    }
}

/// Command byte bit flags for ArtIpProg.
///
/// Per Art-Net 4 spec:
/// - Bit 7 = Enable Programming (0 = read-only query)
/// - Bit 6 = Enable DHCP
/// - Bit 5 = Program Gateway
/// - Bit 4 = Reset
/// - Bit 3 = Program IP
/// - Bit 2 = Program Subnet Mask
/// - Bit 1 = Program Port
pub const IP_PROG_BIT_ENABLE: u8 = 0x80;
pub const IP_PROG_BIT_DHCP: u8 = 0x40;
pub const IP_PROG_BIT_GATEWAY: u8 = 0x20;
pub const IP_PROG_BIT_RESET: u8 = 0x10;
pub const IP_PROG_BIT_IP: u8 = 0x08;
pub const IP_PROG_BIT_SUBNET: u8 = 0x04;
pub const IP_PROG_BIT_PORT: u8 = 0x02;

/// Configuration for building an ArtIpProg packet.
///
/// For read-only query: set `enable_programming` to false and leave other fields as needed.
/// For programming: set `enable_programming` to true and the bits for each field to program.
#[derive(Debug, Clone)]
pub struct IpProgConfig {
    /// Bit 7: 0 = read-only query, 1 = enable programming.
    pub enable_programming: bool,
    /// Bit 6: Enable DHCP.
    pub enable_dhcp: bool,
    /// Bit 5: Program gateway.
    pub program_gateway: bool,
    /// Bit 4: Reset.
    pub reset: bool,
    /// Bit 3: Program IP.
    pub program_ip: bool,
    /// Bit 2: Program subnet mask.
    pub program_subnet: bool,
    /// Bit 1: Program port.
    pub program_port: bool,
    /// New IP address (network byte order). Used when program_ip is true.
    pub ip: Option<std::net::Ipv4Addr>,
    /// New subnet mask. Used when program_subnet is true.
    pub subnet_mask: Option<std::net::Ipv4Addr>,
    /// New port (big-endian). Used when program_port is true.
    pub port: Option<u16>,
    /// New default gateway. Used when program_gateway is true.
    pub gateway: Option<std::net::Ipv4Addr>,
}

impl Default for IpProgConfig {
    fn default() -> Self {
        Self {
            enable_programming: false,
            enable_dhcp: false,
            program_gateway: false,
            reset: false,
            program_ip: false,
            program_subnet: false,
            program_port: false,
            ip: None,
            subnet_mask: None,
            port: None,
            gateway: None,
        }
    }
}

/// Builds a 36-byte ArtIpProg packet (OpCode 0xF800) per Art-Net 4 spec.
///
/// For read-only query: use `IpProgConfig::default()` or set `enable_programming: false`.
/// The device will reply with ArtIpProgReply containing its current configuration.
///
/// For programming: set `enable_programming: true` and the appropriate program_* bits
/// and optional values. All multi-byte fields are big-endian (network byte order).
///
/// # Wire Layout
/// | Offset | Size | Field     | Value         |
/// |--------|------|-----------|---------------|
/// | 0      | 8    | ID        | `"Art-Net\0"` |
/// | 8      | 2    | OpCode LE | `0xF800`      |
/// | 10     | 2    | ProtVer   | `0x000e` BE   |
/// | 12     | 2    | Filler    | 0             |
/// | 14     | 1    | Command   | bits 7-1      |
/// | 15     | 1    | Filler    | 0             |
/// | 16     | 4    | ProgIp    | BE            |
/// | 20     | 4    | ProgSm    | BE            |
/// | 24     | 2    | ProgPort  | BE            |
/// | 26     | 4    | ProgGw    | BE            |
/// | 30     | 4    | Spare     | 0             |
pub fn build_art_ip_prog(config: &IpProgConfig) -> [u8; 36] {
    let mut pkt = [0u8; 36];

    pkt[0..8].copy_from_slice(ART_NET_HEADER);
    pkt[8..10].copy_from_slice(&0xF800u16.to_le_bytes());
    pkt[10] = 0x00;
    pkt[11] = 0x0e;
    // filler1 at 12-13
    let mut command = 0u8;
    if config.enable_programming {
        command |= IP_PROG_BIT_ENABLE;
    }
    if config.enable_dhcp {
        command |= IP_PROG_BIT_DHCP;
    }
    if config.program_gateway {
        command |= IP_PROG_BIT_GATEWAY;
    }
    if config.reset {
        command |= IP_PROG_BIT_RESET;
    }
    if config.program_ip {
        command |= IP_PROG_BIT_IP;
    }
    if config.program_subnet {
        command |= IP_PROG_BIT_SUBNET;
    }
    if config.program_port {
        command |= IP_PROG_BIT_PORT;
    }
    pkt[14] = command;
    // filler2 at 15

    let ip_bytes = config
        .ip
        .map(|a| a.octets())
        .unwrap_or([0u8; 4]);
    pkt[16..20].copy_from_slice(&ip_bytes);

    let sm_bytes = config
        .subnet_mask
        .map(|a| a.octets())
        .unwrap_or([0u8; 4]);
    pkt[20..24].copy_from_slice(&sm_bytes);

    let port = config.port.unwrap_or(6454);
    pkt[24..26].copy_from_slice(&port.to_be_bytes());

    let gw_bytes = config
        .gateway
        .map(|a| a.octets())
        .unwrap_or([0u8; 4]);
    pkt[26..30].copy_from_slice(&gw_bytes);
    // spare at 30-33

    pkt
}

/// Parses a raw UDP payload as an ArtIpProg (OpCode 0xF800) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than the struct.
pub(super) fn parse_ip_prog(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let size = core::mem::size_of::<ArtIpProgPacket>();
    let packet = ArtIpProgPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;
    if packet.id.as_slice() != ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }
    if u16::from_le_bytes(packet.opcode) != 0xF800 {
        return Err(ParseError::WrongOpCode {
            expected: 0xF800,
            actual: u16::from_le_bytes(packet.opcode),
        });
    }
    Ok(ArtNetPacket::IpProg(packet))
}

/// Parses a raw UDP payload as an ArtIpProgReply (OpCode 0xF900) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than the struct.
pub(super) fn parse_ip_prog_reply(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let size = core::mem::size_of::<ArtIpProgReplyPacket>();
    let packet = ArtIpProgReplyPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;
    if packet.id.as_slice() != ART_NET_HEADER {
        return Err(ParseError::InvalidHeader);
    }
    if u16::from_le_bytes(packet.opcode) != 0xF900 {
        return Err(ParseError::WrongOpCode {
            expected: 0xF900,
            actual: u16::from_le_bytes(packet.opcode),
        });
    }
    Ok(ArtNetPacket::IpProgReply(packet))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;

    /// Validates parsing of a known-good ArtIpProg packet from Art-Net 4 spec.
    #[test]
    fn test_parse_art_ip_prog_from_spec() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            // Header: "Art-Net\0"
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            // OpCode (LE): 0xF800
            0x00, 0xF8,
            // ProtVer: 0x00, 0x0e
            0x00, 0x0e,
            // Filler (2)
            0x00, 0x00,
            // Command: 0x80 = enable programming
            0x80,
            // Filler (1)
            0x00,
            // ProgIp: 192.168.1.100
            0xC0, 0xA8, 0x01, 0x64,
            // ProgSm: 255.255.255.0
            0xFF, 0xFF, 0xFF, 0x00,
            // ProgPort: 6454 (0x1936) BE
            0x19, 0x36,
            // ProgGw: 192.168.1.1
            0xC0, 0xA8, 0x01, 0x01,
            // Spare (4)
            0x00, 0x00, 0x00, 0x00,
        ];

        let parsed = parse_ip_prog(packet).expect("valid spec packet must parse");
        match parsed {
            ArtNetPacket::IpProg(p) => {
                assert_eq!(u16::from_le_bytes(p.opcode), 0xF800);
                assert!(p.is_programming_enabled());
                assert_eq!(p.ip(), std::net::Ipv4Addr::new(192, 168, 1, 100));
                assert_eq!(p.subnet_mask(), std::net::Ipv4Addr::new(255, 255, 255, 0));
                assert_eq!(p.port(), 6454);
                assert_eq!(p.gateway(), std::net::Ipv4Addr::new(192, 168, 1, 1));
            }
            _ => panic!("expected IpProg"),
        }
    }

    #[test]
    fn test_parse_art_ip_prog_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_ip_prog(truncated).is_err());
    }

    #[test]
    fn test_parse_art_ip_prog_via_parser() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0xF8,
            0x00, 0x0e, 0x00, 0x00, 0x00, 0x00,
            0x0a, 0x00, 0x00, 0x01, 0xFF, 0xFF, 0xFF, 0x00, 0x19, 0x36,
            0x0a, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
        ];
        match ArtNetParser::parse(packet) {
            Ok(ArtNetPacket::IpProg(p)) => {
                assert_eq!(p.ip(), std::net::Ipv4Addr::new(10, 0, 0, 1));
            }
            other => panic!("expected IpProg, got {other:?}"),
        }
    }

    /// Validates parsing of a known-good ArtIpProgReply packet.
    #[test]
    fn test_parse_art_ip_prog_reply_from_spec() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0xF9,
            0x00, 0x0e,
            0x00, 0x00, 0x00, 0x00,
            0xC0, 0xA8, 0x01, 0x64,
            0xFF, 0xFF, 0xFF, 0x00,
            0x19, 0x36,
            0x40, 0x00,  // status: DHCP enabled
            0xC0, 0xA8, 0x01, 0x01,
            0x00, 0x00,
        ];

        let parsed = parse_ip_prog_reply(packet).expect("valid spec packet must parse");
        match parsed {
            ArtNetPacket::IpProgReply(p) => {
                assert_eq!(u16::from_le_bytes(p.opcode), 0xF900);
                assert!(p.dhcp_enabled());
                assert_eq!(p.ip(), std::net::Ipv4Addr::new(192, 168, 1, 100));
            }
            _ => panic!("expected IpProgReply"),
        }
    }

    #[test]
    fn test_parse_art_ip_prog_reply_too_short() {
        let truncated = &[0x41, 0x72, 0x74, 0x2d];
        assert!(parse_ip_prog_reply(truncated).is_err());
    }

    #[test]
    fn test_build_art_ip_prog_read_only() {
        let config = IpProgConfig::default();
        let pkt = build_art_ip_prog(&config);
        assert_eq!(&pkt[0..8], ART_NET_HEADER.as_slice());
        assert_eq!(u16::from_le_bytes([pkt[8], pkt[9]]), 0xF800);
        assert_eq!(pkt[14], 0); // command = 0 for read-only
    }

    #[test]
    fn test_build_art_ip_prog_programming() {
        let config = IpProgConfig {
            enable_programming: true,
            program_ip: true,
            program_subnet: true,
            program_gateway: true,
            program_port: true,
            ip: Some(std::net::Ipv4Addr::new(192, 168, 1, 100)),
            subnet_mask: Some(std::net::Ipv4Addr::new(255, 255, 255, 0)),
            gateway: Some(std::net::Ipv4Addr::new(192, 168, 1, 1)),
            port: Some(6454),
            ..Default::default()
        };
        let pkt = build_art_ip_prog(&config);
        assert_eq!(pkt[14], 0x80 | 0x08 | 0x04 | 0x20 | 0x02); // enable + ip + subnet + gw + port
        assert_eq!(&pkt[16..20], &[192, 168, 1, 100]);
        assert_eq!(&pkt[20..24], &[255, 255, 255, 0]);
        assert_eq!(&pkt[24..26], &[0x19, 0x36]); // 6454 BE
        assert_eq!(&pkt[26..30], &[192, 168, 1, 1]);
    }

    #[test]
    fn test_parse_art_ip_prog_reply_via_parser() {
        #[rustfmt::skip]
        let packet: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0xF9,
            0x00, 0x0e, 0x00, 0x00, 0x00, 0x00,
            0x0a, 0x00, 0x00, 0x02, 0xFF, 0xFF, 0xFF, 0x00, 0x19, 0x36,
            0x00, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x00, 0x00,
        ];
        match ArtNetParser::parse(packet) {
            Ok(ArtNetPacket::IpProgReply(p)) => {
                assert_eq!(p.ip(), std::net::Ipv4Addr::new(10, 0, 0, 2));
                assert!(!p.dhcp_enabled());
            }
            other => panic!("expected IpProgReply, got {other:?}"),
        }
    }
}
