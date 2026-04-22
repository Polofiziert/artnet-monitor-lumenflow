//! Send all buildable Art-Net packet types once to a target (e.g. 127.0.0.1).
//!
//! Used for Wireshark compliance validation: capture with tcpdump/Wireshark and
//! verify that the Art-Net dissector parses all packets without "Malformed" errors.

use std::time::Duration;

use anyhow::Result;
use lumenflow_core::{
    build_art_address, build_art_command, build_art_data_request, build_art_dmx, build_art_input,
    build_art_ip_prog, build_art_poll, build_art_sync, build_art_trigger, build_mock_poll_reply,
    ArtAddressCommand, ArtTriggerKey, IpProgConfig, MockPollReplyConfig, ART_TRIGGER_OEM_UNIVERSAL,
    DR_URL_PRODUCT,
};

const ART_NET_PORT: u16 = 6454;
const PACKET_DELAY_MS: u64 = 50;

/// Sends each buildable Art-Net packet type once to the target.
///
/// Packets are sent with a small delay between them so capture tools can
/// separate them. Target defaults to 127.0.0.1 for loopback Wireshark capture.
pub async fn run(target: &str) -> Result<()> {
    let target_addr = super::resolve::resolve_target(target, ART_NET_PORT).await?;

    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await?;

    let mut count: u32 = 0;

    // 1. ArtPoll
    let pkt = build_art_poll();
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 2. ArtPollReply
    let config = MockPollReplyConfig {
        ip: std::net::Ipv4Addr::new(192, 168, 1, 100),
        mac: [0x02, 0x00, 0x00, 0x00, 0x01, 0x01],
        short_name: "WiresharkTest".to_string(),
        long_name: "Wireshark Compliance Test Node".to_string(),
        port_addresses: vec![0, 1],
    };
    let pkt = build_mock_poll_reply(&config);
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 3. ArtDmx
    let dmx_data = [0u8; 512];
    let pkt = build_art_dmx(0, 1, &dmx_data);
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 4. ArtSync
    let pkt = build_art_sync();
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 5. ArtAddress
    let pkt = build_art_address(
        0,
        0,
        "Test",
        "Test Node",
        [0; 4],
        [0; 4],
        0,
        ArtAddressCommand::AcNone as u8,
    );
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 6. ArtCommand
    let pkt = build_art_command("SwoutText=Test&")?;
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 7. ArtInput
    let pkt = build_art_input(0, [false; 4]);
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 8. ArtTrigger
    let pkt = build_art_trigger(ART_TRIGGER_OEM_UNIVERSAL, ArtTriggerKey::KeyAscii, 0);
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 9. ArtIpProg (read-only query)
    let pkt = build_art_ip_prog(&IpProgConfig::default());
    socket.send_to(&pkt, target_addr).await?;
    count += 1;
    tokio::time::sleep(Duration::from_millis(PACKET_DELAY_MS)).await;

    // 10. ArtDataRequest
    let pkt = build_art_data_request(0, 0, DR_URL_PRODUCT);
    socket.send_to(&pkt, target_addr).await?;
    count += 1;

    eprintln!("Sent {} Art-Net packets to {}", count, target_addr);
    Ok(())
}
