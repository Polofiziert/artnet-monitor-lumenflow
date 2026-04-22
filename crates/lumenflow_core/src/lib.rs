#![deny(clippy::unwrap_used)]

pub mod artnet;
pub mod buffer;
pub mod device;
pub mod engine;
pub mod network;

pub use artnet::{
    build_art_address, build_art_address_command_only, build_art_command, build_art_data_request,
    build_art_dmx, build_art_input,
    build_art_ip_prog, build_art_ip_prog_reply, build_art_sync, build_art_tod_data,
    build_art_trigger, build_mock_poll_reply, build_our_poll_reply, build_swisson_bind_poll_reply,
    parse_art_tod_control, parse_art_tod_request,
    try_build_art_rdm_response_get_supported_parameters, ArtAddressCommand, ArtAddressPacket,
    ArtCommandHeader, ArtDmxHeader, ArtInputPacket, ArtIpProgPacket, ArtIpProgReplyPacket,
    ArtNetPacket, ArtNetParser, ArtNzsHeader, ArtPollPacket, ArtPollReplyPacket, ArtSyncPacket,
    ArtTodControlInfo, ArtTodRequestInfo, ArtTriggerKey, ArtTriggerPacket, IpProgConfig,
    MockPollReplyConfig, OpCode, ParseError, SwissonBindPollReplyParams, ART_ADDRESS_NO_CHANGE,
    ART_COMMAND_DATA_MAX, ART_TRIGGER_OEM_UNIVERSAL, DR_URL_PRODUCT, TOD_CMD_FULL, TOD_CTRL_FLUSH,
};
pub use buffer::{epoch_nanos, UniverseBuffer, UniverseStore};
pub use device::{
    decode_port_wire_from_poll, port_protocol_name, split_15bit_port_address, ArtNetProduct,
    DeviceInfo, DeviceRegistry, PortDirection, PortInfo, PortWireSummary, ProductPort,
};
pub use engine::{
    parse_discovery_targets_from_env, spawn_discovery, spawn_discovery_with_config,
    DiscoveryConfig, JitterCollector, SourceTracker, Staleness, SyncDetector, UniverseMetrics,
};
pub use network::{
    build_art_poll, build_art_poll_targeted, default_spec_broadcast_targets,
    get_network_interfaces, resolve_interface_for_cidr, ArtNetSocket, InterfacesError,
    NetworkError, NetworkInterface,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_dmx_packet() {
        let mut pkt = Vec::with_capacity(18 + 512);
        pkt.extend_from_slice(b"Art-Net\0");
        pkt.extend_from_slice(&0x5000u16.to_le_bytes());
        pkt.push(0x00);
        pkt.push(0x0e);
        pkt.push(0x01);
        pkt.push(0x00);
        pkt.extend_from_slice(&0x0001u16.to_le_bytes());
        pkt.extend_from_slice(&512u16.to_be_bytes());
        pkt.extend_from_slice(&[128u8; 512]);

        let parsed = ArtNetParser::parse(&pkt);
        assert!(parsed.is_ok());
    }

    #[test]
    fn test_reject_garbage_input() {
        let garbage = [0xFF, 0x00, 0xDE, 0xAD, 0xBE, 0xEF];
        assert!(ArtNetParser::parse(&garbage).is_err());
    }

    #[test]
    fn test_full_pipeline_parse_and_store() {
        let store = UniverseStore::new();

        let mut pkt = Vec::with_capacity(18 + 512);
        pkt.extend_from_slice(b"Art-Net\0");
        pkt.extend_from_slice(&0x5000u16.to_le_bytes());
        pkt.push(0x00);
        pkt.push(0x0e);
        pkt.push(0x01);
        pkt.push(0x00);
        pkt.extend_from_slice(&0x0005u16.to_le_bytes());
        pkt.extend_from_slice(&512u16.to_be_bytes());
        let mut dmx = [0u8; 512];
        dmx[0] = 0xFF;
        dmx[100] = 0x80;
        pkt.extend_from_slice(&dmx);

        match ArtNetParser::parse(&pkt) {
            Ok(ArtNetPacket::Dmx { header, dmx_data }) => {
                store.update(
                    header.port_address(),
                    dmx_data,
                    header.sequence,
                    0x7F000001,
                    header.physical,
                    false,
                );
            }
            other => panic!("expected Dmx, got {other:?}"),
        }

        let mut out = [0u8; 512];
        assert!(store.snapshot(0x0005, &mut out));
        assert_eq!(out[0], 0xFF);
        assert_eq!(out[100], 0x80);
    }
}
