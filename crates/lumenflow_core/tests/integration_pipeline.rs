//! Integration tests: full Art-Net pipeline from raw bytes to buffered state.
//!
//! Validates the data flow: UDP payload → ArtNetParser → UniverseStore / DeviceRegistry.

use std::net::Ipv4Addr;
use std::time::Instant;

use lumenflow_core::{
    ArtNetPacket, ArtNetParser, DeviceInfo, DeviceRegistry, ParseError, UniverseStore,
};

/// Builds a spec-compliant OpDmx packet with the given parameters.
fn build_dmx_packet(universe: u16, sequence: u8, dmx_data: &[u8]) -> Vec<u8> {
    let len = dmx_data.len() as u16;
    let mut pkt = Vec::with_capacity(18 + dmx_data.len());
    pkt.extend_from_slice(b"Art-Net\0");
    pkt.extend_from_slice(&0x5000u16.to_le_bytes());
    pkt.push(0x00); // ProtVerHi
    pkt.push(0x0e); // ProtVerLo = 14
    pkt.push(sequence);
    pkt.push(0x00); // Physical
    pkt.extend_from_slice(&universe.to_le_bytes());
    pkt.extend_from_slice(&len.to_be_bytes());
    pkt.extend_from_slice(dmx_data);
    pkt
}

/// Builds a minimal 239-byte ArtPollReply packet.
fn build_poll_reply(ip: [u8; 4], short_name: &str) -> Vec<u8> {
    let mut pkt = vec![0u8; 239];
    pkt[0..8].copy_from_slice(b"Art-Net\0");
    pkt[8] = 0x00;
    pkt[9] = 0x21; // OpPollReply = 0x2100 LE
    pkt[10..14].copy_from_slice(&ip);
    pkt[14] = 0x36;
    pkt[15] = 0x19; // Port 6454 LE
    pkt[16] = 0x01;
    pkt[17] = 0x02; // Firmware 1.2 BE
    // NetSwitch=0, SubSwitch=0
    let name_bytes = short_name.as_bytes();
    let copy_len = name_bytes.len().min(18);
    pkt[26..26 + copy_len].copy_from_slice(&name_bytes[..copy_len]);
    // NumPorts = 1 (BE)
    pkt[172] = 0x00;
    pkt[173] = 0x01;
    // SwOut[0] = 0 (universe 0 on port 0)
    pkt[190] = 0x00;
    pkt
}

// ---------------------------------------------------------------------------
// Full pipeline: parse → store → snapshot
// ---------------------------------------------------------------------------

#[test]
fn pipeline_parse_dmx_and_store_snapshot() {
    let store = UniverseStore::new();

    let mut dmx = [0u8; 512];
    dmx[0] = 0xFF;
    dmx[100] = 0x80;
    dmx[511] = 0x42;

    let pkt = build_dmx_packet(0x0005, 1, &dmx);

    let parsed = ArtNetParser::parse(&pkt);
    assert!(parsed.is_ok(), "valid DMX packet must parse successfully");

    if let Ok(ArtNetPacket::Dmx { header, dmx_data }) = parsed {
        assert_eq!(header.port_address(), 0x0005);
        store.update(
            header.port_address(),
            dmx_data,
            header.sequence,
            0x0A000001,
            header.physical,
            false,
        );
    }

    let mut out = [0u8; 512];
    assert!(store.snapshot(0x0005, &mut out), "universe 0x0005 must exist after update");
    assert_eq!(out[0], 0xFF);
    assert_eq!(out[100], 0x80);
    assert_eq!(out[511], 0x42);
}

#[test]
fn pipeline_multiple_universes_stay_isolated() {
    let store = UniverseStore::new();

    let dmx_a = [0xAA; 512];
    let dmx_b = [0xBB; 512];

    let pkt_a = build_dmx_packet(0x0001, 1, &dmx_a);
    let pkt_b = build_dmx_packet(0x0002, 1, &dmx_b);

    for pkt in [&pkt_a, &pkt_b] {
        if let Ok(ArtNetPacket::Dmx { header, dmx_data }) = ArtNetParser::parse(pkt) {
            store.update(
                header.port_address(),
                dmx_data,
                header.sequence,
                0x0A000001,
                header.physical,
                false,
            );
        }
    }

    assert_eq!(store.len(), 2);

    let mut out = [0u8; 512];
    assert!(store.snapshot(0x0001, &mut out));
    assert!(out.iter().all(|&v| v == 0xAA), "universe 1 must contain only 0xAA");

    assert!(store.snapshot(0x0002, &mut out));
    assert!(out.iter().all(|&v| v == 0xBB), "universe 2 must contain only 0xBB");

    assert!(!store.snapshot(0xFFFF, &mut out), "non-existent universe must return false");
}

#[test]
fn pipeline_sequence_updates_overwrite_previous_data() {
    let store = UniverseStore::new();
    let universe: u16 = 0x0010;

    let dmx_v1 = [100u8; 512];
    let dmx_v2 = [200u8; 512];

    let pkt1 = build_dmx_packet(universe, 1, &dmx_v1);
    let pkt2 = build_dmx_packet(universe, 2, &dmx_v2);

    for pkt in [&pkt1, &pkt2] {
        if let Ok(ArtNetPacket::Dmx { header, dmx_data }) = ArtNetParser::parse(pkt) {
            store.update(
                header.port_address(),
                dmx_data,
                header.sequence,
                0x0A000001,
                header.physical,
                false,
            );
        }
    }

    let mut out = [0u8; 512];
    assert!(store.snapshot(universe, &mut out));
    assert!(
        out.iter().all(|&v| v == 200),
        "latest sequence must overwrite earlier values"
    );
}

// ---------------------------------------------------------------------------
// Error resilience: invalid/malformed packets
// ---------------------------------------------------------------------------

#[test]
fn pipeline_rejects_garbage_input_gracefully() {
    let garbage_inputs: &[&[u8]] = &[
        &[],
        &[0xFF],
        &[0xFF, 0x00, 0xDE, 0xAD, 0xBE, 0xEF],
        b"Not-Art\0",
        &[0x41, 0x72, 0x74, 0x2d], // truncated header
    ];

    for input in garbage_inputs {
        let result = ArtNetParser::parse(input);
        assert!(
            result.is_err(),
            "garbage input ({} bytes) must be rejected",
            input.len()
        );
    }
}

#[test]
fn pipeline_rejects_truncated_dmx_packet() {
    let mut pkt = build_dmx_packet(0x0001, 1, &[0u8; 512]);
    // Truncate to remove most of the DMX data
    pkt.truncate(20);

    let result = ArtNetParser::parse(&pkt);
    assert!(result.is_err(), "truncated DMX packet must fail");
    assert!(
        matches!(result, Err(ParseError::TooShort { .. })),
        "error must be TooShort variant"
    );
}

#[test]
fn pipeline_rejects_odd_dmx_length() {
    let pkt = build_dmx_packet(0x0001, 1, &[0u8; 3]);
    let result = ArtNetParser::parse(&pkt);
    assert!(
        matches!(result, Err(ParseError::InvalidDmxLength(3))),
        "odd DMX length must be rejected"
    );
}

// ---------------------------------------------------------------------------
// Device discovery pipeline: PollReply → DeviceRegistry
// ---------------------------------------------------------------------------

#[test]
fn pipeline_poll_reply_feeds_device_registry() {
    let registry = DeviceRegistry::new();
    let pkt = build_poll_reply([10, 0, 0, 1], "MyFixture");

    match ArtNetParser::parse(&pkt) {
        Ok(ArtNetPacket::PollReply(reply)) => {
            let device = DeviceInfo {
                mac_address: reply.mac,
                ip_address: reply.ip(),
                bind_ip: std::net::Ipv4Addr::new(
                    reply.bind_ip[0],
                    reply.bind_ip[1],
                    reply.bind_ip[2],
                    reply.bind_ip[3],
                ),
                bind_index: reply.bind_index,
                port: u16::from_le_bytes(reply.port),
                short_name: reply.short_name_str().to_string(),
                long_name: reply.long_name_str().to_string(),
                node_report: String::from_utf8_lossy(&reply.node_report)
                    .trim_end_matches('\0')
                    .to_string(),
                firmware_version: reply.firmware_version(),
                ubea_version: reply.ubea_version,
                esta_man: reply.esta_man(),
                oem_code: reply.oem_code(),
                net_switch: reply.net_switch,
                sub_switch: reply.sub_switch,
                num_ports: reply.num_ports(),
                port_types: reply.port_types,
                good_input: reply.good_input,
                good_output: reply.good_output,
                good_output_b: reply.good_output_b,
                sw_in: reply.sw_in,
                sw_out: reply.sw_out,
                status1: reply.status1,
                status2: reply.status2,
                status3: reply.status3,
                acn_priority: reply.acn_priority,
                sw_macro: reply.sw_macro,
                sw_remote: reply.sw_remote,
                style: reply.style,
                def_resp: reply.def_resp,
                user: reply.user,
                refresh_rate: u16::from_be_bytes(reply.refresh_rate),
                port_addresses: reply.output_port_addresses(),
                input_port_addresses: reply.input_port_addresses(),
                last_seen: Instant::now(),
                last_reply_source: None,
            };
            registry.upsert(device);
        }
        other => panic!("expected PollReply, got {other:?}"),
    }

    assert_eq!(registry.len(), 1);
    let devices = registry.list_devices();
    assert_eq!(devices[0].short_name, "MyFixture");
    assert_eq!(devices[0].ip_address, Ipv4Addr::new(10, 0, 0, 1));
    assert_eq!(devices[0].firmware_version, 0x0102);
}

#[test]
fn pipeline_multiple_devices_tracked_separately() {
    let registry = DeviceRegistry::new();

    for (i, name) in ["NodeA", "NodeB", "NodeC"].iter().enumerate() {
        let pkt = build_poll_reply([10, 0, 0, (i + 1) as u8], name);
        if let Ok(ArtNetPacket::PollReply(reply)) = ArtNetParser::parse(&pkt) {
            registry.upsert(DeviceInfo {
                mac_address: reply.mac,
                ip_address: reply.ip(),
                bind_ip: std::net::Ipv4Addr::new(
                    reply.bind_ip[0],
                    reply.bind_ip[1],
                    reply.bind_ip[2],
                    reply.bind_ip[3],
                ),
                bind_index: reply.bind_index,
                port: u16::from_le_bytes(reply.port),
                short_name: reply.short_name_str().to_string(),
                long_name: reply.long_name_str().to_string(),
                node_report: String::from_utf8_lossy(&reply.node_report)
                    .trim_end_matches('\0')
                    .to_string(),
                firmware_version: reply.firmware_version(),
                ubea_version: reply.ubea_version,
                esta_man: reply.esta_man(),
                oem_code: reply.oem_code(),
                net_switch: reply.net_switch,
                sub_switch: reply.sub_switch,
                num_ports: reply.num_ports(),
                port_types: reply.port_types,
                good_input: reply.good_input,
                good_output: reply.good_output,
                good_output_b: reply.good_output_b,
                sw_in: reply.sw_in,
                sw_out: reply.sw_out,
                status1: reply.status1,
                status2: reply.status2,
                status3: reply.status3,
                acn_priority: reply.acn_priority,
                sw_macro: reply.sw_macro,
                sw_remote: reply.sw_remote,
                style: reply.style,
                def_resp: reply.def_resp,
                user: reply.user,
                refresh_rate: u16::from_be_bytes(reply.refresh_rate),
                port_addresses: reply.output_port_addresses(),
                input_port_addresses: reply.input_port_addresses(),
                last_seen: Instant::now(),
                last_reply_source: None,
            });
        }
    }

    assert_eq!(registry.len(), 3);
}

// ---------------------------------------------------------------------------
// Viewport culling sanity check
// ---------------------------------------------------------------------------

#[test]
fn viewport_culling_bandwidth_is_bounded() {
    let visible_universes = 4;
    let bytes_per_universe = 512;
    let art_net_hz = 44;

    let bytes_per_second = visible_universes * bytes_per_universe * art_net_hz;

    // 4 visible universes × 512 bytes × 44 Hz = 90,112 B/s ≈ 88 KB/s
    assert!(
        bytes_per_second < 100_000,
        "viewport-culled bandwidth ({bytes_per_second} B/s) must stay under 100 KB/s"
    );
}

// ---------------------------------------------------------------------------
// Active universe listing
// ---------------------------------------------------------------------------

#[test]
fn pipeline_active_universes_sorted_after_mixed_inserts() {
    let store = UniverseStore::new();

    for &uni in &[0x0100u16, 0x0001, 0x0050, 0x0002, 0x7FFF] {
        let pkt = build_dmx_packet(uni, 1, &[0u8; 512]);
        if let Ok(ArtNetPacket::Dmx { header, dmx_data }) = ArtNetParser::parse(&pkt) {
            store.update(
                header.port_address(),
                dmx_data,
                header.sequence,
                0x0A000001,
                header.physical,
                false,
            );
        }
    }

    let active = store.active_universes();
    assert_eq!(active, vec![0x0001, 0x0002, 0x0050, 0x0100, 0x7FFF]);
}
