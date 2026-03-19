//! Virtual Art-Net node: receives ArtDmx and responds to ArtPoll with ArtPollReply.
//!
//! Combines listen + mock-node behavior for hardware-free LumenFlow testing.
//! A node receives DMX data and identifies itself when polled.
//!
//! Note: Default port 6454 conflicts with LumenFlow. Use `--port 6455` when
//! running both on the same machine, or run the node in Docker.

use std::net::SocketAddr;
use std::time::Duration;

use anyhow::Result;
use lumenflow_core::{
    build_mock_poll_reply, ArtNetPacket, ArtNetParser, MockPollReplyConfig,
};
use lumenflow_core::ArtNetSocket;

const ART_NET_PORT: u16 = 6454;

/// Runs a virtual Art-Net node: receives ArtDmx and responds to ArtPoll.
///
/// Binds to the configured port. On ArtPoll, replies with ArtPollReply (unicast
/// to the poll source). Also sends ArtPollReply periodically to target (needed
/// when the node is on port 6455 and LumenFlow's ArtPoll broadcast never reaches it).
/// On ArtDmx, logs the received data.
pub async fn run(
    name: &str,
    ip: &str,
    port: u16,
    target: &str,
    verbose: bool,
) -> Result<()> {
    let ip_addr: std::net::Ipv4Addr = ip
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid IP '{}': {}", ip, e))?;

    let target_addr = super::resolve::resolve_target(target, ART_NET_PORT).await?;

    let bind_addr = SocketAddr::from(([0, 0, 0, 0], port));
    let mut socket = ArtNetSocket::bind(bind_addr)
        .await
        .map_err(|e| anyhow::anyhow!("bind to {}: {}", bind_addr, e))?;

    let poll_reply_config = MockPollReplyConfig {
        ip: ip_addr,
        mac: [0x02, 0x00, 0x00, 0x00, 0x02, 0x02],
        short_name: name.to_string(),
        long_name: format!("Virtual Node ({})", name),
        port_addresses: vec![0, 1, 2, 3],
    };

    eprintln!(
        "Virtual node '{}' @ {} listening on 0.0.0.0:{}, sending ArtPollReply to {}",
        name, ip_addr, port, target_addr
    );
    if port == 6454 {
        eprintln!("Note: Port 6454 conflicts with LumenFlow. Use --port 6455 if both run on same machine.");
    }
    eprintln!("Press Ctrl+C to stop.\n");

    let mut poll_reply_tick = tokio::time::interval(Duration::from_secs_f64(2.5));
    poll_reply_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        let recv_fut = tokio::time::timeout(
            Duration::from_millis(500),
            socket.recv(),
        );

        tokio::select! {
            _ = poll_reply_tick.tick() => {
                let pkt = build_mock_poll_reply(&poll_reply_config);
                if let Err(e) = socket.send_to(&pkt, target_addr).await {
                    eprintln!("[WARN] failed to send periodic ArtPollReply: {e}");
                } else if verbose {
                    eprintln!("[TX ArtPollReply] → {} (periodic)", target_addr);
                }
            }
            result = recv_fut => {
                let (data, addr) = match result {
                    Ok(Ok(r)) => r,
                    Ok(Err(e)) => return Err(anyhow::anyhow!("recv: {}", e)),
                    Err(_) => continue,
                };

        let packet = match ArtNetParser::parse(data) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[WARN] unparseable packet from {addr}: {e}");
                continue;
            }
        };

        match &packet {
            ArtNetPacket::Poll(_) => {
                let pkt = build_mock_poll_reply(&poll_reply_config);
                if let Err(e) = socket.send_to(&pkt, addr).await {
                    eprintln!("[WARN] failed to send ArtPollReply: {e}");
                } else if verbose {
                    eprintln!("[RX ArtPoll] {} → [TX ArtPollReply] as '{}'", addr, name);
                }
            }
            ArtNetPacket::Dmx { header, dmx_data } => {
                let preview: Vec<String> =
                    dmx_data.iter().take(8).map(|v| format!("{v}")).collect();
                eprintln!(
                    "[RX ArtDmx] {} | uni {} seq {} | [{preview}...]",
                    addr,
                    header.port_address(),
                    header.sequence,
                    preview = preview.join(" ")
                );
            }
            ArtNetPacket::Sync(_) => {
                if verbose {
                    eprintln!("[RX ArtSync] {}", addr);
                }
            }
            other => {
                if verbose {
                    eprintln!("[RX Other] {} | {:?}", addr, other);
                }
            }
        }
            }
        }
    }
}
