//! ArtAddress (OpCode 0x6000) wire-format struct, command enum, parser and builder.

use zerocopy::{FromBytes, FromZeroes};

use super::{ArtNetPacket, ParseError, ART_NET_HEADER, ART_ADDRESS_NO_CHANGE};

/// Art-Net `OpAddress` packet (107 bytes on wire).
#[repr(C, packed)]
#[derive(Debug, Clone, Copy, FromZeroes, FromBytes)]
pub struct ArtAddressPacket {
    pub id: [u8; 8],
    pub opcode: [u8; 2],
    pub proto_ver_hi: u8,
    pub proto_ver_lo: u8,
    pub net_switch: u8,
    pub bind_index: u8,
    pub short_name: [u8; 18],
    pub long_name: [u8; 64],
    pub sw_in: [u8; 4],
    pub sw_out: [u8; 4],
    pub sub_switch: u8,
    pub sw_video: u8,
    pub command: u8,
}

impl ArtAddressPacket {
    /// Returns the short name as a trimmed UTF-8 string (max 18 chars).
    pub fn short_name_str(&self) -> &str {
        let end = self
            .short_name
            .iter()
            .position(|&b| b == 0)
            .unwrap_or(self.short_name.len());
        core::str::from_utf8(&self.short_name[..end]).unwrap_or("")
    }

    /// Returns the long name as a trimmed UTF-8 string (max 64 chars).
    pub fn long_name_str(&self) -> &str {
        let end = self
            .long_name
            .iter()
            .position(|&b| b == 0)
            .unwrap_or(self.long_name.len());
        core::str::from_utf8(&self.long_name[..end]).unwrap_or("")
    }
}

/// Parses a raw UDP payload as an ArtAddress (OpCode 0x6000) packet.
///
/// # Errors
/// Returns `ParseError::TooShort` if the payload is smaller than the struct.
pub(super) fn parse_address(payload: &[u8]) -> Result<ArtNetPacket<'_>, ParseError> {
    let size = core::mem::size_of::<ArtAddressPacket>();
    let packet = ArtAddressPacket::ref_from_prefix(payload).ok_or(ParseError::TooShort {
        expected: size,
        actual: payload.len(),
    })?;
    Ok(ArtNetPacket::Address(packet))
}

/// Command codes for the ArtAddress packet's `Command` field.
///
/// Only port-0 variants are defined here. Port 1–3 equivalents are
/// **deprecated** in Art-Net 4 — use `BindIndex` to select the target
/// port/page instead.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtAddressCommand {
    AcNone = 0x00,
    AcCancelMerge = 0x01,
    AcLedNormal = 0x02,
    AcLedMute = 0x03,
    AcLedLocate = 0x04,
    AcResetRxFlags = 0x05,
    AcAnalysisOn = 0x06,
    AcAnalysisOff = 0x07,
    AcFailHold = 0x08,
    AcFailZero = 0x09,
    AcFailFull = 0x0A,
    AcFailScene = 0x0B,
    AcFailRecord = 0x0C,
    AcMergeLtp0 = 0x10,
    AcDirectionTx0 = 0x20,
    AcDirectionRx0 = 0x30,
    AcMergeHtp0 = 0x50,
    AcArtNetSel0 = 0x60,
    AcAcnSel0 = 0x70,
    AcClearOp0 = 0x90,
    AcStyleDelta0 = 0xA0,
    AcStyleConst0 = 0xB0,
    AcRdmEnable0 = 0xC0,
    AcRdmDisable0 = 0xD0,
}

/// Builds a 107-byte ArtAddress packet for remotely programming a node.
///
/// # Errors
/// This function is infallible.
#[allow(clippy::too_many_arguments)]
pub fn build_art_address(
    net_switch: u8,
    bind_index: u8,
    short_name: &str,
    long_name: &str,
    sw_in: [u8; 4],
    sw_out: [u8; 4],
    sub_switch: u8,
    command: u8,
) -> [u8; 107] {
    let mut pkt = [0u8; 107];

    pkt[0..8].copy_from_slice(ART_NET_HEADER);
    pkt[8..10].copy_from_slice(&0x6000u16.to_le_bytes());
    pkt[10] = 0x00;
    pkt[11] = 0x0E;
    pkt[12] = net_switch;
    pkt[13] = bind_index;

    let sn = short_name.as_bytes();
    let sn_len = sn.len().min(17);
    pkt[14..14 + sn_len].copy_from_slice(&sn[..sn_len]);

    let ln = long_name.as_bytes();
    let ln_len = ln.len().min(63);
    pkt[32..32 + ln_len].copy_from_slice(&ln[..ln_len]);

    pkt[96..100].copy_from_slice(&sw_in);
    pkt[100..104].copy_from_slice(&sw_out);
    pkt[104] = sub_switch;
    pkt[106] = command;

    pkt
}

/// Builds an ArtAddress packet that only sets the `Command` byte (no name / SwIn / SwOut changes).
///
/// Use with `BindIndex` to target the correct port page; port-specific opcodes use `0x10 + slot`,
/// `0x50 + slot`, etc. (Art-Net 4 table).
#[must_use]
pub fn build_art_address_command_only(bind_index: u8, command: u8) -> [u8; 107] {
    build_art_address(
        ART_ADDRESS_NO_CHANGE,
        bind_index,
        "",
        "",
        [ART_ADDRESS_NO_CHANGE; 4],
        [ART_ADDRESS_NO_CHANGE; 4],
        ART_ADDRESS_NO_CHANGE,
        command,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::artnet::ArtNetParser;

    #[test]
    fn build_art_address_programs_single_swout_nibble_with_bit7() {
        let mut sw_out = [ART_ADDRESS_NO_CHANGE; 4];
        sw_out[1] = 0x80 | 0x04;

        let pkt = build_art_address(
            ART_ADDRESS_NO_CHANGE,
            2,
            "",
            "",
            [ART_ADDRESS_NO_CHANGE; 4],
            sw_out,
            ART_ADDRESS_NO_CHANGE,
            ArtAddressCommand::AcNone as u8,
        );

        // SwOut starts at offset 100 (4 bytes).
        assert_eq!(pkt[101], 0x84);
        assert_eq!(pkt[100], ART_ADDRESS_NO_CHANGE);
        assert_eq!(pkt[102], ART_ADDRESS_NO_CHANGE);
        assert_eq!(pkt[103], ART_ADDRESS_NO_CHANGE);
        // Ensure we didn't accidentally touch Net/Sub (remain no-change sentinel).
        assert_eq!(pkt[12], ART_ADDRESS_NO_CHANGE);
        assert_eq!(pkt[104], ART_ADDRESS_NO_CHANGE);
    }

    #[test]
    fn test_build_art_address_round_trip() {
        let pkt = build_art_address(
            0x80 | 0x03,
            1,
            "MyFixture",
            "My Fixture Long Name",
            [0x80 | 1, 0x80 | 2, 0x7F, 0x7F],
            [0x80 | 5, 0x80 | 6, 0x7F, 0x7F],
            0x80 | 0x02,
            ArtAddressCommand::AcCancelMerge as u8,
        );

        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Address(a)) => {
                assert_eq!(a.net_switch, 0x83);
                assert_eq!(a.bind_index, 1);
                assert_eq!(a.short_name_str(), "MyFixture");
                assert_eq!(a.long_name_str(), "My Fixture Long Name");
                assert_eq!(a.sw_in, [0x81, 0x82, 0x7F, 0x7F]);
                assert_eq!(a.sw_out, [0x85, 0x86, 0x7F, 0x7F]);
                assert_eq!(a.sub_switch, 0x82);
                assert_eq!(a.sw_video, 0);
                assert_eq!(a.command, ArtAddressCommand::AcCancelMerge as u8);
            }
            other => panic!("expected Address, got {other:?}"),
        }
    }

    #[test]
    fn test_build_art_address_no_change() {
        let pkt = build_art_address(
            ART_ADDRESS_NO_CHANGE,
            0,
            "",
            "",
            [0x7F; 4],
            [0x7F; 4],
            ART_ADDRESS_NO_CHANGE,
            ArtAddressCommand::AcNone as u8,
        );

        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Address(a)) => {
                assert_eq!(a.net_switch, 0x7F);
                assert_eq!(a.sub_switch, 0x7F);
                assert_eq!(a.short_name_str(), "");
                assert_eq!(a.long_name_str(), "");
                assert_eq!(a.command, 0x00);
            }
            other => panic!("expected Address, got {other:?}"),
        }
    }

    #[test]
    fn test_build_art_address_truncation() {
        let long_short = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let long_long = "A".repeat(200);
        let pkt = build_art_address(
            0,
            0,
            long_short,
            &long_long,
            [0; 4],
            [0; 4],
            0,
            ArtAddressCommand::AcNone as u8,
        );

        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Address(a)) => {
                assert_eq!(a.short_name_str().len(), 17);
                assert_eq!(a.long_name_str().len(), 63);
            }
            other => panic!("expected Address, got {other:?}"),
        }
    }

    #[test]
    fn test_build_art_address_wire_offsets() {
        let pkt = build_art_address(
            0x42,
            3,
            "Hi",
            "Hello",
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            0x0A,
            ArtAddressCommand::AcLedLocate as u8,
        );

        assert_eq!(&pkt[0..8], b"Art-Net\0");
        assert_eq!(u16::from_le_bytes([pkt[8], pkt[9]]), 0x6000);
        assert_eq!(pkt[10], 0x00);
        assert_eq!(pkt[11], 0x0E);
        assert_eq!(pkt[12], 0x42);
        assert_eq!(pkt[13], 3);
        assert_eq!(&pkt[14..16], b"Hi");
        assert_eq!(pkt[16], 0);
        assert_eq!(&pkt[32..37], b"Hello");
        assert_eq!(pkt[37], 0);
        assert_eq!(&pkt[96..100], &[1, 2, 3, 4]);
        assert_eq!(&pkt[100..104], &[5, 6, 7, 8]);
        assert_eq!(pkt[104], 0x0A);
        assert_eq!(pkt[105], 0x00);
        assert_eq!(pkt[106], ArtAddressCommand::AcLedLocate as u8);
    }

    #[test]
    fn build_art_address_command_only_sets_bind_and_command_byte() {
        let pkt = build_art_address_command_only(2, 0x11);
        assert_eq!(pkt[13], 2);
        assert_eq!(pkt[106], 0x11);
    }

    #[test]
    fn test_art_address_command_values() {
        assert_eq!(ArtAddressCommand::AcNone as u8, 0x00);
        assert_eq!(ArtAddressCommand::AcCancelMerge as u8, 0x01);
        assert_eq!(ArtAddressCommand::AcLedNormal as u8, 0x02);
        assert_eq!(ArtAddressCommand::AcLedMute as u8, 0x03);
        assert_eq!(ArtAddressCommand::AcLedLocate as u8, 0x04);
        assert_eq!(ArtAddressCommand::AcResetRxFlags as u8, 0x05);
        assert_eq!(ArtAddressCommand::AcFailHold as u8, 0x08);
        assert_eq!(ArtAddressCommand::AcFailZero as u8, 0x09);
        assert_eq!(ArtAddressCommand::AcFailFull as u8, 0x0A);
        assert_eq!(ArtAddressCommand::AcFailScene as u8, 0x0B);
        assert_eq!(ArtAddressCommand::AcFailRecord as u8, 0x0C);
        assert_eq!(ArtAddressCommand::AcMergeLtp0 as u8, 0x10);
        assert_eq!(ArtAddressCommand::AcDirectionTx0 as u8, 0x20);
        assert_eq!(ArtAddressCommand::AcDirectionRx0 as u8, 0x30);
        assert_eq!(ArtAddressCommand::AcMergeHtp0 as u8, 0x50);
        assert_eq!(ArtAddressCommand::AcArtNetSel0 as u8, 0x60);
        assert_eq!(ArtAddressCommand::AcAcnSel0 as u8, 0x70);
        assert_eq!(ArtAddressCommand::AcClearOp0 as u8, 0x90);
        assert_eq!(ArtAddressCommand::AcStyleDelta0 as u8, 0xA0);
        assert_eq!(ArtAddressCommand::AcStyleConst0 as u8, 0xB0);
        assert_eq!(ArtAddressCommand::AcRdmEnable0 as u8, 0xC0);
        assert_eq!(ArtAddressCommand::AcRdmDisable0 as u8, 0xD0);
    }
}
