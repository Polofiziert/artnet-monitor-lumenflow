use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;

use anyhow::Result;
use lumenflow_core::{build_art_poll, ArtNetPacket, ArtNetParser, ArtNetSocket};

const ARTNET_BROADCAST: SocketAddr = SocketAddr::new(
    std::net::IpAddr::V4(Ipv4Addr::new(255, 255, 255, 255)),
    6454,
);

/// Sends an ArtPoll broadcast and collects ArtPollReply responses.
///
/// Binds to UDP port 6454 with `SO_BROADCAST`, sends a spec-compliant
/// ArtPoll packet, then listens for replies until `timeout_secs` elapses.
///
/// # Errors
/// Returns an error if socket binding, broadcast, or recv fails.
pub async fn run(timeout_secs: u64) -> Result<()> {
    let bind_addr = SocketAddr::from(([0, 0, 0, 0], 6454));
    let mut socket = ArtNetSocket::bind(bind_addr).await?;
    socket.inner().set_broadcast(true)?;

    socket.send_to(&build_art_poll(), ARTNET_BROADCAST).await?;
    eprintln!("ArtPoll broadcast sent. Waiting {timeout_secs}s for replies …\n");

    let mut devices: Vec<DiscoveredDevice> = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(timeout_secs);

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        match tokio::time::timeout(remaining, socket.recv()).await {
            Ok(Ok((data, addr))) => {
                if let Ok(ArtNetPacket::PollReply(reply)) = ArtNetParser::parse(data) {
                    let mac = reply.mac;
                    devices.push(DiscoveredDevice {
                        name: reply.short_name_str().to_string(),
                        long_name: reply.long_name_str().to_string(),
                        ip: reply.ip().to_string(),
                        _source: addr.to_string(),
                        mac: format_mac(&mac),
                        firmware: reply.firmware_version(),
                        ports: reply.num_ports(),
                        universes: reply.output_port_addresses(),
                    });
                }
            }
            Ok(Err(e)) => {
                eprintln!("[WARN] recv error: {e}");
            }
            Err(_) => break,
        }
    }

    if devices.is_empty() {
        println!("No Art-Net devices discovered.");
    } else {
        print_table(&devices);
    }

    Ok(())
}

struct DiscoveredDevice {
    name: String,
    long_name: String,
    ip: String,
    _source: String,
    mac: String,
    firmware: u16,
    ports: u16,
    universes: Vec<u16>,
}

fn print_table(devices: &[DiscoveredDevice]) {
    println!("Discovered {} Art-Net device(s):\n", devices.len());

    let hdr_name = "NAME";
    let hdr_ip = "IP";
    let hdr_mac = "MAC";
    let hdr_fw = "FW";
    let hdr_ports = "PORTS";
    let hdr_uni = "UNIVERSES";
    let hdr_long = "LONG NAME";

    println!(
        "{hdr_name:<18} {hdr_ip:<16} {hdr_mac:<18} {hdr_fw:>6} {hdr_ports:>5}   {hdr_uni:<20} {hdr_long}",
    );
    println!("{}", "─".repeat(100));

    for d in devices {
        let uni_str: Vec<String> = d.universes.iter().map(|u| u.to_string()).collect();
        println!(
            "{:<18} {:<16} {:<18} 0x{:04X} {:>5}   [{:<18}] {}",
            d.name,
            d.ip,
            d.mac,
            d.firmware,
            d.ports,
            uni_str.join(", "),
            d.long_name,
        );
    }
}

fn format_mac(mac: &[u8; 6]) -> String {
    format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]
    )
}
