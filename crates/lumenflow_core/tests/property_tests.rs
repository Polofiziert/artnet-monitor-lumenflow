//! Property-based tests for the Art-Net parser using proptest.
//!
//! Validates that the parser:
//! 1. Never panics on arbitrary byte sequences
//! 2. Correctly parses any well-formed DMX packet
//! 3. Rejects all packets with invalid headers

use lumenflow_core::{ArtNetPacket, ArtNetParser};
use proptest::prelude::*;

/// Builds a valid OpDmx packet from fuzzed parameters.
fn build_valid_dmx(universe: u16, sequence: u8, channel_count: usize, fill: u8) -> Vec<u8> {
    // Art-Net requires even length in 2..=512
    let len = (channel_count.clamp(2, 512) & !1) as u16;
    let mut pkt = Vec::with_capacity(18 + len as usize);
    pkt.extend_from_slice(b"Art-Net\0");
    pkt.extend_from_slice(&0x5000u16.to_le_bytes());
    pkt.push(0x00); // ProtVerHi
    pkt.push(0x0e); // ProtVerLo = 14
    pkt.push(sequence);
    pkt.push(0x00); // Physical
    pkt.extend_from_slice(&universe.to_le_bytes());
    pkt.extend_from_slice(&len.to_be_bytes());
    pkt.extend(std::iter::repeat(fill).take(len as usize));
    pkt
}

proptest! {
    /// The parser must never panic regardless of input. Any byte sequence
    /// should either produce an `Ok` or `Err`, never a crash.
    #[test]
    fn parser_never_panics_on_arbitrary_input(data in prop::collection::vec(any::<u8>(), 0..2048)) {
        let _ = ArtNetParser::parse(&data);
    }

    /// Packets that start with a valid Art-Net header but contain random
    /// trailing bytes must not cause panics.
    #[test]
    fn parser_handles_valid_header_with_random_tail(
        tail in prop::collection::vec(any::<u8>(), 0..1024)
    ) {
        let mut pkt = b"Art-Net\0".to_vec();
        pkt.extend_from_slice(&0x5000u16.to_le_bytes()); // OpDmx
        pkt.extend(tail);
        let _ = ArtNetParser::parse(&pkt);
    }

    /// Any correctly constructed DMX packet must parse successfully and
    /// return the exact universe and channel data.
    #[test]
    fn valid_dmx_packets_always_parse(
        universe in 0u16..=0x7FFF,
        sequence in any::<u8>(),
        channel_count in (1usize..=256).prop_map(|n| n * 2), // even, 2..=512
        fill in any::<u8>(),
    ) {
        let pkt = build_valid_dmx(universe, sequence, channel_count, fill);
        let result = ArtNetParser::parse(&pkt);

        prop_assert!(result.is_ok(), "valid DMX packet must parse: {result:?}");

        if let Ok(ArtNetPacket::Dmx { header, dmx_data }) = result {
            prop_assert_eq!(header.port_address(), universe);
            prop_assert_eq!(header.sequence, sequence);
            let expected_len = channel_count.clamp(2, 512) & !1;
            prop_assert_eq!(dmx_data.len(), expected_len);
            prop_assert!(dmx_data.iter().all(|&v| v == fill));
        }
    }

    /// Packets without the "Art-Net\0" magic header must always be rejected.
    #[test]
    fn invalid_header_always_rejected(
        data in prop::collection::vec(any::<u8>(), 10..1024)
    ) {
        // Ensure the first 8 bytes are NOT "Art-Net\0"
        let has_valid_header = data.len() >= 8 && &data[0..8] == b"Art-Net\0";

        if !has_valid_header {
            let result = ArtNetParser::parse(&data);
            prop_assert!(result.is_err(), "non-Art-Net data must be rejected");
        }
    }

    /// Packets with a valid header but unsupported protocol version must fail.
    #[test]
    fn old_protocol_version_rejected(version_lo in 0u8..14) {
        let mut pkt = b"Art-Net\0".to_vec();
        pkt.extend_from_slice(&0x5000u16.to_le_bytes()); // OpDmx
        pkt.push(0x00);         // ProtVerHi
        pkt.push(version_lo);   // ProtVerLo < 14
        pkt.push(0x00);         // Sequence
        pkt.push(0x00);         // Physical
        pkt.extend_from_slice(&0x0000u16.to_le_bytes()); // Universe
        pkt.extend_from_slice(&512u16.to_be_bytes());    // Length
        pkt.extend(std::iter::repeat(0u8).take(512));

        let result = ArtNetParser::parse(&pkt);
        prop_assert!(result.is_err(), "protocol version {version_lo} < 14 must be rejected");
    }

    /// The 15-bit port-address round-trips correctly through any valid packet.
    #[test]
    fn port_address_roundtrips(universe in 0u16..=0x7FFF) {
        let pkt = build_valid_dmx(universe, 0, 512, 0);
        if let Ok(ArtNetPacket::Dmx { header, .. }) = ArtNetParser::parse(&pkt) {
            prop_assert_eq!(header.port_address(), universe);
        }
    }
}
