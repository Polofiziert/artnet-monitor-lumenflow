pub mod dmx;
pub mod poll;
pub mod poll_reply;
pub mod sync;
pub mod address;
pub mod input;
pub mod command;
pub mod data_request;
pub mod diag;
pub mod ip_prog;
pub mod nzs;
pub mod timecode;
pub mod time_sync;
pub mod trigger;
pub mod tod;
pub mod rdm_tunnel;

pub use self::address::{build_art_address, ArtAddressCommand, ArtAddressPacket};
pub use self::command::{build_art_command, ArtCommandHeader, ART_COMMAND_DATA_MAX};
pub use self::dmx::{build_art_dmx, ArtDmxHeader};
pub use self::diag::ArtDiagDataPacket;
pub use self::input::{build_art_input, ArtInputPacket};
pub use self::nzs::ArtNzsHeader;
pub use self::poll::ArtPollPacket;
pub use self::poll_reply::{
    build_mock_poll_reply, build_our_poll_reply, build_swisson_bind_poll_reply,
    ArtPollReplyPacket, MockPollReplyConfig, SwissonBindPollReplyParams,
};
pub use self::sync::{build_art_sync, ArtSyncPacket};
pub use self::timecode::ArtTimeCodePacket;
pub use self::trigger::{
    build_art_trigger, ArtTriggerKey, ArtTriggerPacket, ART_TRIGGER_OEM_UNIVERSAL,
};
pub use self::ip_prog::{
    build_art_ip_prog, build_art_ip_prog_reply, ArtIpProgPacket, ArtIpProgReplyPacket, IpProgConfig,
};
pub use self::data_request::{
    build_art_data_request, ArtDataReplyHeader, ArtDataRequestPacket, DR_POLL, DR_URL_PERS_GDTF,
    DR_URL_PERS_UDR, DR_URL_PRODUCT, DR_URL_SUPPORT, DR_URL_USER_GUIDE,
};
pub use self::time_sync::ArtTimeSyncPacket;
pub use self::tod::{
    build_art_tod_data, parse_art_tod_control, parse_art_tod_request, ArtTodControlInfo,
    ArtTodRequestInfo, TOD_CMD_FULL, TOD_CTRL_FLUSH,
};
pub use self::rdm_tunnel::try_build_art_rdm_response_get_supported_parameters;

pub const ART_NET_HEADER: &[u8; 8] = b"Art-Net\0";
pub const ART_NET_PROTOCOL_VERSION: u16 = 14;
pub const DMX_CHANNELS_PER_UNIVERSE: usize = 512;
pub const ART_NET_PORT: u16 = 6454;

pub const ART_ADDRESS_NO_CHANGE: u8 = 0x7F;

#[repr(u16)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpCode {
    Poll = 0x2000,
    PollReply = 0x2100,
    DiagData = 0x2300,
    Command = 0x2400,
    DataRequest = 0x2700,
    DataReply = 0x2800,
    Dmx = 0x5000,
    Nzs = 0x5100,
    Sync = 0x5200,
    Address = 0x6000,
    Input = 0x7000,
    TodRequest = 0x8000,
    TodData = 0x8100,
    TodControl = 0x8200,
    Rdm = 0x8300,
    RdmSub = 0x8400,
    Media = 0x9000,
    MediaPatch = 0x9100,
    MediaControl = 0x9200,
    MediaContrlReply = 0x9300,
    TimeCode = 0x9700,
    TimeSync = 0x9800,
    Trigger = 0x9900,
    Directory = 0x9A00,
    DirectoryReply = 0x9B00,
    VideoSetup = 0xA010,
    VideoPalette = 0xA020,
    VideoData = 0xA040,
    MacMaster = 0xF000,
    MacSlave = 0xF100,
    FirmwareMaster = 0xF200,
    FirmwareReply = 0xF300,
    FileTnMaster = 0xF400,
    FileFnMaster = 0xF500,
    FileFnReply = 0xF600,
    IpProg = 0xF800,
    IpProgReply = 0xF900,
}

impl OpCode {
    /// Converts a raw `u16` (little-endian on wire) into an `OpCode` variant.
    ///
    /// # Errors
    /// Returns `ParseError::UnknownOpCode` if the value does not match any
    /// known variant.
    pub fn from_u16(value: u16) -> Result<Self, ParseError> {
        match value {
            0x2000 => Ok(Self::Poll),
            0x2100 => Ok(Self::PollReply),
            0x2300 => Ok(Self::DiagData),
            0x2400 => Ok(Self::Command),
            0x2700 => Ok(Self::DataRequest),
            0x2800 => Ok(Self::DataReply),
            0x5000 => Ok(Self::Dmx),
            0x5100 => Ok(Self::Nzs),
            0x5200 => Ok(Self::Sync),
            0x6000 => Ok(Self::Address),
            0x7000 => Ok(Self::Input),
            0x8000 => Ok(Self::TodRequest),
            0x8100 => Ok(Self::TodData),
            0x8200 => Ok(Self::TodControl),
            0x8300 => Ok(Self::Rdm),
            0x8400 => Ok(Self::RdmSub),
            0x9000 => Ok(Self::Media),
            0x9100 => Ok(Self::MediaPatch),
            0x9200 => Ok(Self::MediaControl),
            0x9300 => Ok(Self::MediaContrlReply),
            0x9700 => Ok(Self::TimeCode),
            0x9800 => Ok(Self::TimeSync),
            0x9900 => Ok(Self::Trigger),
            0x9A00 => Ok(Self::Directory),
            0x9B00 => Ok(Self::DirectoryReply),
            0xA010 => Ok(Self::VideoSetup),
            0xA020 => Ok(Self::VideoPalette),
            0xA040 => Ok(Self::VideoData),
            0xF000 => Ok(Self::MacMaster),
            0xF100 => Ok(Self::MacSlave),
            0xF200 => Ok(Self::FirmwareMaster),
            0xF300 => Ok(Self::FirmwareReply),
            0xF400 => Ok(Self::FileTnMaster),
            0xF500 => Ok(Self::FileFnMaster),
            0xF600 => Ok(Self::FileFnReply),
            0xF800 => Ok(Self::IpProg),
            0xF900 => Ok(Self::IpProgReply),
            _ => Err(ParseError::UnknownOpCode(value)),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("packet too short: expected {expected} bytes, got {actual}")]
    TooShort { expected: usize, actual: usize },

    #[error("invalid Art-Net header")]
    InvalidHeader,

    #[error("wrong OpCode: expected 0x{expected:04X}, got 0x{actual:04X}")]
    WrongOpCode { expected: u16, actual: u16 },

    #[error("unsupported protocol version: {0}")]
    UnsupportedVersion(u16),

    #[error("unknown OpCode: 0x{0:04X}")]
    UnknownOpCode(u16),

    #[error("DMX length out of range: {0} (must be 2..=512 and even)")]
    InvalidDmxLength(u16),

    #[error("recognized but unimplemented OpCode: 0x{0:04X}")]
    Unimplemented(u16),

    #[error("command data too long: {0} bytes (max 512)")]
    CommandDataTooLong(usize),
}

/// A successfully parsed Art-Net packet with its typed payload.
#[derive(Debug)]
pub enum ArtNetPacket<'a> {
    Dmx {
        header: &'a ArtDmxHeader,
        dmx_data: &'a [u8],
    },
    Poll(&'a ArtPollPacket),
    PollReply(Box<ArtPollReplyPacket>),
    Sync(&'a ArtSyncPacket),
    Address(&'a ArtAddressPacket),
    Input(&'a ArtInputPacket),
    DiagData(&'a ArtDiagDataPacket, &'a [u8]),
    TimeCode(&'a ArtTimeCodePacket),
    Command {
        header: &'a command::ArtCommandHeader,
        data: &'a [u8],
    },
    Trigger(&'a trigger::ArtTriggerPacket),
    Nzs {
        header: &'a nzs::ArtNzsHeader,
        dmx_data: &'a [u8],
    },
    IpProg(&'a ip_prog::ArtIpProgPacket),
    IpProgReply(&'a ip_prog::ArtIpProgReplyPacket),
    DataRequest(&'a data_request::ArtDataRequestPacket),
    DataReply {
        header: &'a data_request::ArtDataReplyHeader,
        data: &'a [u8],
    },
    TimeSync(&'a time_sync::ArtTimeSyncPacket),
}

pub struct ArtNetParser;

impl ArtNetParser {
    /// Parses a raw UDP payload into a typed `ArtNetPacket`.
    ///
    /// Validates the Art-Net header, protocol version, and OpCode before
    /// dispatching to OpCode-specific parsing in sub-modules.
    ///
    /// # Errors
    /// Returns `ParseError` for malformed, truncated, or unknown packets.
    pub fn parse(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
        if payload.len() < 10 {
            return Err(ParseError::TooShort {
                expected: 10,
                actual: payload.len(),
            });
        }
        if &payload[0..8] != ART_NET_HEADER.as_slice() {
            return Err(ParseError::InvalidHeader);
        }

        let opcode_raw = u16::from_le_bytes([payload[8], payload[9]]);
        let opcode = OpCode::from_u16(opcode_raw)?;

        if opcode == OpCode::PollReply {
            return poll_reply::parse_poll_reply(payload);
        }

        if payload.len() < 12 {
            return Err(ParseError::TooShort {
                expected: 12,
                actual: payload.len(),
            });
        }
        let proto_ver = u16::from_be_bytes([payload[10], payload[11]]);
        if proto_ver < ART_NET_PROTOCOL_VERSION {
            return Err(ParseError::UnsupportedVersion(proto_ver));
        }

        match opcode {
            OpCode::Dmx => dmx::parse_dmx(payload),
            OpCode::Poll => poll::parse_poll(payload),
            OpCode::Sync => sync::parse_sync(payload),
            OpCode::Address => address::parse_address(payload),
            OpCode::Input => input::parse_input(payload),
            OpCode::DiagData => {
                let (pkt, data) = diag::parse_diag_data(payload)?;
                Ok(ArtNetPacket::DiagData(pkt, data))
            }
            OpCode::TimeCode => {
                let pkt = timecode::parse_timecode(payload)?;
                Ok(ArtNetPacket::TimeCode(pkt))
            }
            OpCode::Command => {
                let (header, data) = command::parse_command(payload)?;
                Ok(ArtNetPacket::Command { header, data })
            }
            OpCode::Trigger => {
                let pkt = trigger::parse_trigger(payload)?;
                Ok(ArtNetPacket::Trigger(pkt))
            }
            OpCode::Nzs => nzs::parse_nzs(payload),
            OpCode::IpProg => ip_prog::parse_ip_prog(payload),
            OpCode::IpProgReply => ip_prog::parse_ip_prog_reply(payload),
            OpCode::DataRequest => data_request::parse_data_request(payload),
            OpCode::DataReply => data_request::parse_data_reply(payload),
            OpCode::TimeSync => time_sync::parse_time_sync(payload),
            _ => Err(ParseError::Unimplemented(opcode_raw)),
        }
    }
}

/// Decodes the 15-bit port-address from Sub-Universe and Net bytes.
pub fn decode_port_address(sub_uni: u8, net: u8) -> u16 {
    ((net as u16 & 0x7F) << 8) | sub_uni as u16
}

const _: () = {
    assert!(core::mem::align_of::<ArtDmxHeader>() == 1);
    assert!(core::mem::align_of::<ArtPollPacket>() == 1);
    assert!(core::mem::align_of::<ArtPollReplyPacket>() == 1);
    assert!(core::mem::align_of::<ArtSyncPacket>() == 1);
    assert!(core::mem::align_of::<ArtAddressPacket>() == 1);
    assert!(core::mem::align_of::<ArtInputPacket>() == 1);
    assert!(core::mem::align_of::<ArtDiagDataPacket>() == 1);
    assert!(core::mem::align_of::<ArtTimeCodePacket>() == 1);
    assert!(core::mem::align_of::<command::ArtCommandHeader>() == 1);
    assert!(core::mem::align_of::<trigger::ArtTriggerPacket>() == 1);
    assert!(core::mem::align_of::<nzs::ArtNzsHeader>() == 1);
    assert!(core::mem::align_of::<ip_prog::ArtIpProgPacket>() == 1);
    assert!(core::mem::align_of::<ip_prog::ArtIpProgReplyPacket>() == 1);
    assert!(core::mem::align_of::<data_request::ArtDataRequestPacket>() == 1);
    assert!(core::mem::align_of::<data_request::ArtDataReplyHeader>() == 1);
    assert!(core::mem::align_of::<time_sync::ArtTimeSyncPacket>() == 1);
};

#[cfg(test)]
mod tests {
    use super::*;

    fn build_dmx_packet(universe: u16, sequence: u8, dmx_data: &[u8]) -> Vec<u8> {
        let len = dmx_data.len() as u16;
        let mut pkt = Vec::with_capacity(18 + dmx_data.len());
        pkt.extend_from_slice(b"Art-Net\0");
        pkt.extend_from_slice(&0x5000u16.to_le_bytes());
        pkt.push(0x00);
        pkt.push(0x0e);
        pkt.push(sequence);
        pkt.push(0x00);
        pkt.extend_from_slice(&universe.to_le_bytes());
        pkt.extend_from_slice(&len.to_be_bytes());
        pkt.extend_from_slice(dmx_data);
        pkt
    }

    #[test]
    fn test_build_art_dmx_roundtrip() {
        use super::build_art_dmx;

        let dmx = [128u8; 512];
        let pkt = build_art_dmx(0x0001, 1, &dmx);
        assert_eq!(pkt.len(), 18 + 512);
        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Dmx { header, dmx_data }) => {
                assert_eq!(header.port_address(), 0x0001);
                assert_eq!(header.sequence, 1);
                assert_eq!(header.dmx_length(), 512);
                assert_eq!(dmx_data.len(), 512);
                assert_eq!(dmx_data[0], 128);
            }
            other => panic!("expected Dmx, got {other:?}"),
        }
    }

    #[test]
    fn test_build_art_dmx_zero_pad() {
        use super::build_art_dmx;

        let dmx = [0xFFu8; 10];
        let pkt = build_art_dmx(0x0042, 5, &dmx);
        assert_eq!(pkt.len(), 18 + 512);
        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Dmx { header, dmx_data }) => {
                assert_eq!(header.port_address(), 0x0042);
                assert_eq!(dmx_data[0], 0xFF);
                assert_eq!(dmx_data[9], 0xFF);
                assert_eq!(dmx_data[10], 0);
                assert_eq!(dmx_data[511], 0);
            }
            other => panic!("expected Dmx, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_dmx_from_spec() {
        let mut d = [0u8; 512];
        d[0] = 0xFF;
        d[255] = 0x80;
        d[511] = 0x42;
        let p = build_dmx_packet(0x0001, 0x01, &d);
        match ArtNetParser::parse(&p) {
            Ok(ArtNetPacket::Dmx { header, dmx_data }) => {
                assert_eq!(u16::from_le_bytes(header.opcode), 0x5000);
                assert_eq!(header.sequence, 0x01);
                assert_eq!(header.port_address(), 0x0001);
                assert_eq!(header.dmx_length(), 512);
                assert_eq!(dmx_data.len(), 512);
                assert_eq!(dmx_data[0], 0xFF);
                assert_eq!(dmx_data[255], 0x80);
                assert_eq!(dmx_data[511], 0x42);
            }
            other => panic!("expected Dmx, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_dmx_too_short() {
        assert!(ArtNetParser::parse(&[0x41, 0x72, 0x74, 0x2d]).is_err());
    }

    #[test]
    fn test_parse_art_dmx_invalid_header() {
        let mut bad = build_dmx_packet(0, 0, &[0u8; 512]);
        bad[0] = 0x00;
        assert!(matches!(
            ArtNetParser::parse(&bad),
            Err(ParseError::InvalidHeader)
        ));
    }

    #[test]
    fn test_parse_art_dmx_odd_length() {
        let p = build_dmx_packet(0, 0, &[0u8; 3]);
        assert!(matches!(
            ArtNetParser::parse(&p),
            Err(ParseError::InvalidDmxLength(3))
        ));
    }

    #[test]
    fn test_parse_art_dmx_minimum_length() {
        assert!(ArtNetParser::parse(&build_dmx_packet(0, 0, &[0u8; 2])).is_ok());
    }

    #[test]
    fn test_parse_art_poll() {
        let p: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x20, 0x00, 0x0e, 0x06, 0x10,
            0x00, 0x00, 0x00, 0x00,
        ];
        match ArtNetParser::parse(p) {
            Ok(ArtNetPacket::Poll(poll)) => {
                assert_eq!(poll.flags, 0x06);
                assert_eq!(poll.diag_priority, 0x10);
            }
            other => panic!("expected Poll, got {other:?}"),
        }
    }

    /// Minimal ArtPoll (14 bytes) per Art-Net 4 spec; used by e.g. Protokoll.
    #[test]
    fn test_parse_art_poll_minimal_14_bytes() {
        let p: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, // "Art-Net\0"
            0x00, 0x20, // OpCode 0x2000 LE
            0x00, 0x0e, // ProtVer 14
            0x06, 0x10, // Flags, DiagPriority
        ];
        assert_eq!(p.len(), 14);
        match ArtNetParser::parse(p) {
            Ok(ArtNetPacket::Poll(poll)) => {
                assert_eq!(poll.flags, 0x06);
                assert_eq!(poll.diag_priority, 0x10);
                assert_eq!(poll.target_port_top, [0, 0]);
                assert_eq!(poll.target_port_bottom, [0, 0]);
            }
            other => panic!("expected Poll (14-byte minimal), got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_sync() {
        let p: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x52, 0x00, 0x0e, 0x00, 0x00,
        ];
        match ArtNetParser::parse(p) {
            Ok(ArtNetPacket::Sync(s)) => {
                assert_eq!(s.aux1, 0x00);
                assert_eq!(s.aux2, 0x00);
            }
            other => panic!("expected Sync, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_unsupported_version() {
        let p: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 0x00, 0x20, 0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ];
        assert!(matches!(
            ArtNetParser::parse(p),
            Err(ParseError::UnsupportedVersion(1))
        ));
    }

    #[test]
    fn test_parse_art_poll_reply_239() {
        let mut p = vec![0u8; 239];
        p[0..8].copy_from_slice(b"Art-Net\0");
        p[8] = 0x00;
        p[9] = 0x21;
        p[10] = 10;
        p[11] = 0;
        p[12] = 0;
        p[13] = 1;
        p[14] = 0x36;
        p[15] = 0x19;
        p[16] = 0x01;
        p[17] = 0x02;
        p[18] = 0x00;
        p[19] = 0x01;
        p[26..34].copy_from_slice(b"TestNode");
        match ArtNetParser::parse(&p) {
            Ok(ArtNetPacket::PollReply(r)) => {
                assert_eq!(r.ip(), std::net::Ipv4Addr::new(10, 0, 0, 1));
                assert_eq!(r.firmware_version(), 0x0102);
                assert_eq!(r.short_name_str(), "TestNode");
            }
            other => panic!("expected PollReply, got {other:?}"),
        }
    }

    #[test]
    fn test_decode_port_address() {
        assert_eq!(decode_port_address(0x10, 0x00), 0x0010);
        assert_eq!(decode_port_address(0x00, 0x01), 0x0100);
        assert_eq!(decode_port_address(0xFF, 0x7F), 0x7FFF);
        assert_eq!(decode_port_address(0x00, 0x00), 0x0000);
    }

    #[test]
    fn test_parse_art_dmx_port_address_decoding() {
        let p = build_dmx_packet(0x0312, 1, &[0u8; 512]);
        match ArtNetParser::parse(&p) {
            Ok(ArtNetPacket::Dmx { header, .. }) => {
                assert_eq!(header.port_address(), 0x0312);
                assert_eq!(
                    decode_port_address(header.port_address[0], header.port_address[1]),
                    0x0312
                );
            }
            other => panic!("expected Dmx, got {other:?}"),
        }
    }

    fn build_art_address_packet(
        ns: u8,
        ss: u8,
        sn: &[u8],
        ln: &[u8],
        si: [u8; 4],
        so: [u8; 4],
        cmd: u8,
    ) -> Vec<u8> {
        let mut p = vec![0u8; 107];
        p[0..8].copy_from_slice(b"Art-Net\0");
        p[8..10].copy_from_slice(&0x6000u16.to_le_bytes());
        p[10] = 0x00;
        p[11] = 0x0e;
        p[12] = ns;
        p[13] = 0x00;
        let sl = sn.len().min(18);
        p[14..14 + sl].copy_from_slice(&sn[..sl]);
        let ll = ln.len().min(64);
        p[32..32 + ll].copy_from_slice(&ln[..ll]);
        p[96..100].copy_from_slice(&si);
        p[100..104].copy_from_slice(&so);
        p[104] = ss;
        p[105] = 0x00;
        p[106] = cmd;
        p
    }

    #[test]
    fn test_parse_art_address() {
        let p = build_art_address_packet(
            0x01,
            0x02,
            b"MyFixture",
            b"My Fixture Long Name",
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            0x00,
        );
        match ArtNetParser::parse(&p) {
            Ok(ArtNetPacket::Address(a)) => {
                assert_eq!(u16::from_le_bytes(a.opcode), 0x6000);
                assert_eq!(a.net_switch, 0x01);
                assert_eq!(a.short_name_str(), "MyFixture");
                assert_eq!(a.long_name_str(), "My Fixture Long Name");
                assert_eq!(a.sub_switch, 0x02);
            }
            other => panic!("expected Address, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_address_too_short() {
        let mut p = vec![0u8; 50];
        p[0..8].copy_from_slice(b"Art-Net\0");
        p[8..10].copy_from_slice(&0x6000u16.to_le_bytes());
        p[10] = 0x00;
        p[11] = 0x0e;
        assert!(matches!(
            ArtNetParser::parse(&p),
            Err(ParseError::TooShort {
                expected: 107,
                actual: 50
            })
        ));
    }

    #[test]
    fn test_parse_art_address_no_change_sentinels() {
        let p = build_art_address_packet(
            ART_ADDRESS_NO_CHANGE,
            ART_ADDRESS_NO_CHANGE,
            b"",
            b"",
            [0x7F; 4],
            [0x7F; 4],
            0x00,
        );
        match ArtNetParser::parse(&p) {
            Ok(ArtNetPacket::Address(a)) => {
                assert_eq!(a.net_switch, ART_ADDRESS_NO_CHANGE);
                assert_eq!(a.sub_switch, ART_ADDRESS_NO_CHANGE);
            }
            other => panic!("expected Address, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_diag_data() {
        #[rustfmt::skip]
        let p: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x23, 0x00, 0x0e, 0x80, 0x03, 0x00, 0x41, 0x42, 0x43,
        ];
        match ArtNetParser::parse(p) {
            Ok(ArtNetPacket::DiagData(pkt, data)) => {
                assert_eq!(u16::from_le_bytes(pkt.opcode), 0x2300);
                assert_eq!(pkt.priority, 0x80);
                assert_eq!(pkt.data_length(), 3);
                assert_eq!(data, b"ABC");
            }
            other => panic!("expected DiagData, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_timecode() {
        #[rustfmt::skip]
        let p: &[u8] = &[
            0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
            0x00, 0x97, 0x00, 0x0e, 0x00, 0x00,
            0x0f, 0x1e, 0x2d, 0x17, 0x02,
        ];
        match ArtNetParser::parse(p) {
            Ok(ArtNetPacket::TimeCode(tc)) => {
                assert_eq!(u16::from_le_bytes(tc.opcode), 0x9700);
                assert_eq!(tc.frames, 0x0f);
                assert_eq!(tc.seconds, 0x1e);
                assert_eq!(tc.minutes, 0x2d);
                assert_eq!(tc.hours, 0x17);
                assert_eq!(tc.timecode_type, 0x02);
            }
            other => panic!("expected TimeCode, got {other:?}"),
        }
    }

    #[test]
    fn test_parse_art_address_hex_encoded() {
        let mut p = vec![0u8; 107];
        p[0..8].copy_from_slice(&[0x41, 0x72, 0x74, 0x2D, 0x4E, 0x65, 0x74, 0x00]);
        p[8] = 0x00;
        p[9] = 0x60;
        p[10] = 0x00;
        p[11] = 0x0E;
        p[12] = 0x02;
        p[13] = 0x01;
        p[14..21].copy_from_slice(b"LED Bar");
        p[32..47].copy_from_slice(b"LED Bar RGBW 1m");
        p[96] = 0;
        p[97] = 1;
        p[98] = 2;
        p[99] = 3;
        p[100] = 4;
        p[101] = 5;
        p[102] = 6;
        p[103] = 7;
        p[104] = 0x03;
        p[105] = 0x00;
        p[106] = 0x04;
        match ArtNetParser::parse(&p) {
            Ok(ArtNetPacket::Address(a)) => {
                assert_eq!(a.net_switch, 0x02);
                assert_eq!(a.bind_index, 0x01);
                assert_eq!(a.short_name_str(), "LED Bar");
                assert_eq!(a.long_name_str(), "LED Bar RGBW 1m");
                assert_eq!(a.sub_switch, 0x03);
                assert_eq!(a.command, 0x04);
            }
            other => panic!("expected Address, got {other:?}"),
        }
    }
}
