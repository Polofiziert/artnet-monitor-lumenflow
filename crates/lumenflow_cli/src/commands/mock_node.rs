//! Send ArtPollReply packets so LumenFlow discovers a mock node (testing without hardware).

use std::time::Duration;

use anyhow::Result;
use lumenflow_core::{build_mock_poll_reply, MockPollReplyConfig};

const ART_NET_PORT: u16 = 6454;

/// Sends ArtPollReply packets periodically so LumenFlow's Devices view shows a discovered node.
///
/// Binds to an ephemeral port and sends to the target (e.g. 127.0.0.1:6454 for loopback).
/// LumenFlow must be running and listening on 6454.
pub async fn run(target: &str) -> Result<()> {
    let target_addr = super::resolve::resolve_target(target, ART_NET_PORT).await?;

    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await?;

    let config = MockPollReplyConfig {
        ip: std::net::Ipv4Addr::new(192, 168, 1, 101),
        mac: [0x02, 0x00, 0x00, 0x00, 0x01, 0x01],
        short_name: "Swisson XND-8 #1".to_string(),
        long_name: "Mock Art-Net Node (lumenflow_cli)".to_string(),
        port_addresses: vec![0, 1, 2, 3],
    };

    eprintln!(
        "Sending ArtPollReply to {} as '{}' (ports 0-7)",
        target_addr, config.short_name
    );
    eprintln!("Press Ctrl+C to stop.\n");

    let mut tick = tokio::time::interval(Duration::from_secs(2));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tick.tick().await;
        let pkt = build_mock_poll_reply(&config);
        socket.send_to(&pkt, target_addr).await?;
    }
}
