//! Virtual Art-Net console: sends ArtDmx and responds to ArtPoll with ArtPollReply.
//!
//! Combines send + mock-node behavior for hardware-free LumenFlow testing.
//! A console identifies itself when polled and transmits DMX data.

use std::time::Duration;

use anyhow::Result;
use lumenflow_core::{
    build_art_sync, build_mock_poll_reply, ArtNetPacket, ArtNetParser, MockPollReplyConfig,
};

const ART_NET_PORT: u16 = 6454;
const CHANNEL_COUNT: usize = 512;

type PatternFn = fn(channel: usize, time_ms: f64) -> u8;

fn pattern_sine(ch: usize, t: f64) -> u8 {
    let v = 127.5 + 127.5 * (t * 0.002 + ch as f64 * 0.05).sin();
    v.clamp(0.0, 255.0) as u8
}

fn pattern_chase(ch: usize, t: f64) -> u8 {
    let pos = (t * 0.05) as usize % CHANNEL_COUNT;
    let dist = (ch as i32 - pos as i32).unsigned_abs();
    if dist < 8 {
        (255.0 * (1.0 - dist as f64 / 8.0)).clamp(0.0, 255.0) as u8
    } else {
        0
    }
}

fn pattern_strobe(_ch: usize, t: f64) -> u8 {
    if (t * 0.01).floor() as i64 % 2 == 0 {
        255
    } else {
        0
    }
}

fn pattern_static(ch: usize, _t: f64) -> u8 {
    match ch % 3 {
        0 => 200,
        1 => 100,
        _ => 0,
    }
}

fn pattern_gradient(ch: usize, _t: f64) -> u8 {
    ((ch as f64 / CHANNEL_COUNT as f64) * 255.0).clamp(0.0, 255.0) as u8
}

fn get_pattern(name: &str) -> Result<PatternFn> {
    match name {
        "sine" => Ok(pattern_sine),
        "chase" => Ok(pattern_chase),
        "strobe" => Ok(pattern_strobe),
        "static" => Ok(pattern_static),
        "gradient" => Ok(pattern_gradient),
        _ => anyhow::bail!(
            "unknown pattern '{}'. Choose: sine, chase, strobe, static, gradient",
            name
        ),
    }
}

/// Runs a virtual Art-Net console: sends ArtDmx and responds to ArtPoll.
///
/// Binds to an ephemeral port. Listens for ArtPoll and replies with ArtPollReply
/// (unicast to the poll source). Sends ArtDmx at the configured rate to the target.
#[allow(clippy::too_many_arguments)] // CLI surface: many independent flags
pub async fn run(
    name: &str,
    ip: &str,
    bind_addr: Option<&str>,
    universes: u16,
    rate: u32,
    pattern_name: &str,
    target: &str,
    physical: u8,
    sync_target: Option<&str>,
    verbose: bool,
) -> Result<()> {
    let pattern = get_pattern(pattern_name)?;

    let ip_addr: std::net::Ipv4Addr = ip
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid IP '{}': {}", ip, e))?;

    let target_addr = super::resolve::resolve_target(target, ART_NET_PORT).await?;

    let sync_addr = if let Some(st) = sync_target {
        Some(super::resolve::resolve_target(st, ART_NET_PORT).await?)
    } else {
        None
    };

    let bind = bind_addr.unwrap_or("0.0.0.0:0");
    let socket = tokio::net::UdpSocket::bind(bind).await?;
    socket.set_broadcast(true)?;

    let port_addresses: Vec<u16> = (0..universes).collect();
    let poll_reply_config = MockPollReplyConfig {
        ip: ip_addr,
        mac: [0x02, 0x00, 0x00, 0x00, 0x01, 0x01],
        short_name: name.to_string(),
        long_name: format!("Virtual Console ({})", name),
        port_addresses,
    };

    eprintln!(
        "Virtual console '{}' @ {} → {} ({} uni, {} Hz, pattern '{}')",
        name, ip_addr, target_addr, universes, rate, pattern_name
    );
    eprintln!("Press Ctrl+C to stop.\n");

    let period = Duration::from_secs_f64(1.0 / rate as f64);
    let mut tick = tokio::time::interval(period);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    let mut poll_reply_tick = tokio::time::interval(Duration::from_secs_f64(2.5));
    poll_reply_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    let mut dmx_buf = [0u8; CHANNEL_COUNT];
    let mut recv_buf = [0u8; 2048];
    let start = std::time::Instant::now();
    let mut sequence: u8 = 0;

    loop {
        let recv_fut = tokio::time::timeout(period, socket.recv_from(&mut recv_buf));

        tokio::select! {
            // Periodic ArtPollReply to target (for discovery when broadcast doesn't reach us)
            _ = poll_reply_tick.tick() => {
                let pkt = build_mock_poll_reply(&poll_reply_config);
                if let Err(e) = socket.send_to(&pkt, target_addr).await {
                    eprintln!("[WARN] failed to send periodic ArtPollReply: {e}");
                } else if verbose {
                    eprintln!("[TX ArtPollReply] → {} (periodic)", target_addr);
                }
            }

            // ArtPoll listener: reply to whoever polls us (with timeout so DMX can send)
            result = recv_fut => {
                match result {
                    Ok(Ok((len, from_addr))) => {
                        let data = &recv_buf[..len];
                        if let Ok(ArtNetPacket::Poll(_)) = ArtNetParser::parse(data) {
                            let pkt = build_mock_poll_reply(&poll_reply_config);
                            if let Err(e) = socket.send_to(&pkt, from_addr).await {
                                eprintln!("[WARN] failed to send ArtPollReply: {e}");
                            } else if verbose {
                                eprintln!(
                                    "[RX ArtPoll] {} → [TX ArtPollReply] as '{}'",
                                    from_addr, name
                                );
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        eprintln!("[WARN] recv error: {e}");
                    }
                    Err(_) => {
                        // Timeout - no ArtPoll received, will send DMX on next tick
                    }
                }
            }

            // ArtDmx sender
            _ = tick.tick() => {
                let time_ms = start.elapsed().as_secs_f64() * 1000.0;

                for uni in 0..universes {
                    for (ch, slot) in dmx_buf.iter_mut().enumerate().take(CHANNEL_COUNT) {
                        *slot = pattern(ch, time_ms);
                    }
                    sequence = sequence.wrapping_add(1);
                    let pkt = build_art_dmx_with_physical(uni, sequence, physical, &dmx_buf);
                    if let Err(e) = socket.send_to(&pkt, target_addr).await {
                        eprintln!("[WARN] failed to send ArtDmx: {e}");
                    } else if verbose {
                        let preview: Vec<String> =
                            dmx_buf.iter().take(8).map(|v| format!("{v}")).collect();
                        eprintln!(
                            "[TX ArtDmx] uni {} seq {} → {} | [{preview}...]",
                            uni,
                            sequence,
                            target_addr,
                            preview = preview.join(" ")
                        );
                    }
                }
                if let Some(ref sa) = sync_addr {
                    let sync_pkt = build_art_sync();
                    if let Err(e) = socket.send_to(&sync_pkt, sa).await {
                        eprintln!("[WARN] failed to send ArtSync: {e}");
                    } else if verbose {
                        eprintln!("[TX ArtSync] → {}", sa);
                    }
                }
            }
        }
    }
}

/// Builds ArtDmx with configurable physical port (for merge testing).
fn build_art_dmx_with_physical(
    universe: u16,
    sequence: u8,
    physical: u8,
    dmx_data: &[u8],
) -> Vec<u8> {
    let mut pkt = lumenflow_core::build_art_dmx(universe, sequence, dmx_data);
    // build_art_dmx sets physical at offset 13 to 0; we need to override
    if pkt.len() >= 14 {
        pkt[13] = physical & 0x03; // physical is 0-3
    }
    pkt
}
