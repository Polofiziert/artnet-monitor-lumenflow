//! Send ArtDmx packets for hardware-free testing of LumenFlow.

use std::time::Duration;

use anyhow::Result;
use lumenflow_core::build_art_dmx;

const ART_NET_PORT: u16 = 6454;
use tokio::net::UdpSocket;
use tokio::time::interval;

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

/// Sends ArtDmx packets at the given rate for hardware-free LumenFlow testing.
///
/// Binds to an ephemeral port and sends to the target (e.g. 127.0.0.1:6454 for
/// loopback, or 255.255.255.255:6454 for broadcast).
pub async fn run(universes: u16, rate: u32, target: &str, pattern_name: &str) -> Result<()> {
    let pattern = get_pattern(pattern_name)?;

    let target_addr = super::resolve::resolve_target(target, ART_NET_PORT).await?;

    let socket = UdpSocket::bind("0.0.0.0:0").await?;
    socket.set_broadcast(true)?;

    eprintln!(
        "Sending ArtDmx: {} universe(s), {} Hz, target {}, pattern '{}'",
        universes, rate, target_addr, pattern_name
    );
    eprintln!("Press Ctrl+C to stop.\n");

    let period = Duration::from_secs_f64(1.0 / rate as f64);
    let mut tick = interval(period);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    let mut sequence: u8 = 0;
    let mut dmx_buf = [0u8; CHANNEL_COUNT];
    let start = std::time::Instant::now();

    loop {
        tick.tick().await;
        let time_ms = start.elapsed().as_secs_f64() * 1000.0;

        for uni in 0..universes {
            for (ch, slot) in dmx_buf.iter_mut().enumerate().take(CHANNEL_COUNT) {
                *slot = pattern(ch, time_ms);
            }
            sequence = sequence.wrapping_add(1);
            let pkt = build_art_dmx(uni, sequence, &dmx_buf);
            socket.send_to(&pkt, target_addr).await?;
        }
    }
}
