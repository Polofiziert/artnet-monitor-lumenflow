use std::net::SocketAddr;

use anyhow::Result;
use lumenflow_core::{ArtNetPacket, ArtNetParser, ArtNetSocket};

/// Binds to the Art-Net UDP port and prints incoming packets to stdout.
///
/// Runs an infinite receive loop until the process is killed (Ctrl+C).
///
/// # Errors
/// Returns an error if the socket cannot be bound or a recv call fails.
pub async fn run(universe_filter: Option<u16>, json: bool) -> Result<()> {
    let mut socket = ArtNetSocket::bind_default().await?;

    eprintln!("Listening for Art-Net packets on 0.0.0.0:6454 …");
    if let Some(uni) = universe_filter {
        eprintln!("Filtering: universe {uni}");
    }
    eprintln!("Press Ctrl+C to stop.\n");

    loop {
        let (data, addr) = socket.recv().await?;

        let packet = match ArtNetParser::parse(data) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[WARN] unparseable packet from {addr}: {e}");
                continue;
            }
        };

        if let Some(filter_uni) = universe_filter {
            if let ArtNetPacket::Dmx { header, .. } = &packet {
                if header.port_address() != filter_uni {
                    continue;
                }
            }
        }

        if json {
            print_json(&packet, addr);
        } else {
            print_readable(&packet, addr);
        }
    }
}

fn print_readable(packet: &ArtNetPacket<'_>, addr: SocketAddr) {
    match packet {
        ArtNetPacket::Dmx { header, dmx_data } => {
            let preview: Vec<String> =
                dmx_data.iter().take(16).map(|v| format!("{v:3}")).collect();
            println!(
                "[DMX]      {addr:<21} | uni {uni:>5} | {ch:>3} ch | [{preview}]",
                uni = header.port_address(),
                ch = header.dmx_length(),
                preview = preview.join(" "),
            );
        }
        ArtNetPacket::Poll(_) => {
            println!("[POLL]     {addr}");
        }
        ArtNetPacket::PollReply(reply) => {
            let mac = reply.mac;
            println!(
                "[REPLY]    {addr:<21} | {name:<18} | ip {ip} | mac {mac_str} | {ports} port(s)",
                name = reply.short_name_str(),
                ip = reply.ip(),
                mac_str = format_mac(&mac),
                ports = reply.num_ports(),
            );
        }
        ArtNetPacket::Sync(_) => {
            println!("[SYNC]     {addr}");
        }
        other => {
            println!("[OTHER]    {addr} | {other:?}");
        }
    }
}

fn print_json(packet: &ArtNetPacket<'_>, addr: SocketAddr) {
    let value = match packet {
        ArtNetPacket::Dmx { header, dmx_data } => {
            let preview: Vec<u8> = dmx_data.iter().take(16).copied().collect();
            serde_json::json!({
                "type": "ArtDmx",
                "source": addr.to_string(),
                "universe": header.port_address(),
                "channels": header.dmx_length(),
                "sequence": header.sequence,
                "preview": preview,
            })
        }
        ArtNetPacket::Poll(_) => {
            serde_json::json!({
                "type": "ArtPoll",
                "source": addr.to_string(),
            })
        }
        ArtNetPacket::PollReply(reply) => {
            let mac = reply.mac;
            serde_json::json!({
                "type": "ArtPollReply",
                "source": addr.to_string(),
                "short_name": reply.short_name_str(),
                "long_name": reply.long_name_str(),
                "ip": reply.ip().to_string(),
                "mac": format_mac(&mac),
                "firmware": reply.firmware_version(),
                "ports": reply.num_ports(),
            })
        }
        ArtNetPacket::Sync(_) => {
            serde_json::json!({
                "type": "ArtSync",
                "source": addr.to_string(),
            })
        }
        _ => {
            serde_json::json!({
                "type": "Unknown",
                "source": addr.to_string(),
            })
        }
    };

    if let Ok(s) = serde_json::to_string(&value) {
        println!("{s}");
    }
}

fn format_mac(mac: &[u8; 6]) -> String {
    format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]
    )
}
