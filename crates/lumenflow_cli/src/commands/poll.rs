use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;

use anyhow::Result;
use lumenflow_core::{
    build_art_poll, decode_port_wire_from_poll, port_protocol_name, split_15bit_port_address,
    ArtNetPacket, ArtNetParser, ArtNetSocket, ArtPollReplyPacket, PortWireSummary,
};
use serde::Serialize;

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
pub async fn run(timeout_secs: u64, show_ports: bool, json: bool) -> Result<()> {
    let bind_addr = SocketAddr::from(([0, 0, 0, 0], 6454));
    let mut socket = ArtNetSocket::bind(bind_addr).await?;
    socket.inner().set_broadcast(true)?;

    socket.send_to(&build_art_poll(), ARTNET_BROADCAST).await?;
    eprintln!("ArtPoll broadcast sent. Waiting {timeout_secs}s for replies …\n");

    let mut replies: Vec<ArtPollReplyPacket> = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(timeout_secs);

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        match tokio::time::timeout(remaining, socket.recv()).await {
            Ok(Ok((data, _addr))) => {
                if let Ok(ArtNetPacket::PollReply(reply)) = ArtNetParser::parse(data) {
                    replies.push(*reply);
                }
            }
            Ok(Err(e)) => {
                eprintln!("[WARN] recv error: {e}");
            }
            Err(_) => break,
        }
    }

    if replies.is_empty() {
        println!("No Art-Net devices discovered.");
        return Ok(());
    }

    if json {
        if show_ports {
            let rows = port_rows_from_replies(&replies);
            for row in rows {
                println!("{}", serde_json::to_string(&row)?);
            }
        } else {
            let devices: Vec<PollDeviceJson> =
                replies.iter().map(PollDeviceJson::from_reply).collect();
            println!("{}", serde_json::to_string(&devices)?);
        }
    } else if show_ports {
        print_port_table(&replies);
    } else {
        let devices: Vec<DiscoveredDevice> = replies.iter().map(DiscoveredDevice::from_reply).collect();
        print_table(&devices);
    }

    Ok(())
}

#[derive(Serialize)]
struct PollDeviceJson {
    name: String,
    long_name: String,
    ip: String,
    mac: String,
    firmware: u16,
    ports: u16,
    universes: Vec<u16>,
}

impl PollDeviceJson {
    fn from_reply(reply: &ArtPollReplyPacket) -> Self {
        let mac = reply.mac;
        Self {
            name: reply.short_name_str().to_string(),
            long_name: reply.long_name_str().to_string(),
            ip: reply.ip().to_string(),
            mac: format_mac(&mac),
            firmware: reply.firmware_version(),
            ports: reply.num_ports(),
            universes: reply.output_port_addresses(),
        }
    }
}

#[derive(Serialize)]
struct PollPortJson {
    short_name: String,
    ip: String,
    bind_index: u8,
    slot: u8,
    port_type: u8,
    good_output: u8,
    good_input: u8,
    good_output_b: u8,
    status2: u8,
    output_universe: u16,
    input_universe: Option<u16>,
    dir: String,
    conv: String,
    proto: String,
    activity: String,
    merge_policy: String,
    merge_glyph: String,
    rdm_active: bool,
    out_nsu: String,
    in_nsu: String,
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

impl DiscoveredDevice {
    fn from_reply(reply: &ArtPollReplyPacket) -> Self {
        let mac = reply.mac;
        Self {
            name: reply.short_name_str().to_string(),
            long_name: reply.long_name_str().to_string(),
            ip: reply.ip().to_string(),
            _source: String::new(),
            mac: format_mac(&mac),
            firmware: reply.firmware_version(),
            ports: reply.num_ports(),
            universes: reply.output_port_addresses(),
        }
    }
}

fn format_mac(mac: &[u8; 6]) -> String {
    format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]
    )
}

fn format_nsu(addr: u16) -> String {
    let (n, s, u) = split_15bit_port_address(addr);
    format!("{n}:{s}:{u}")
}

fn dir_label(w: &PortWireSummary) -> String {
    let o = w.artnet_output_capable;
    let i = w.artnet_input_capable;
    if o && i {
        "I/O".to_string()
    } else if o {
        "OUT".to_string()
    } else if i {
        "IN".to_string()
    } else {
        "—".to_string()
    }
}

fn conv_label(w: &PortWireSummary) -> String {
    if w.artnet_output_capable {
        if w.output_sacn_selected {
            "sACN".to_string()
        } else {
            "Art-Net".to_string()
        }
    } else if w.input_sacn_selected {
        "sACN".to_string()
    } else {
        "Art-Net".to_string()
    }
}

fn activity_label(w: &PortWireSummary) -> String {
    if w.output_short_detected {
        return "SHORT".to_string();
    }
    if w.input_receive_errors {
        return "ERR".to_string();
    }
    if w.artnet_input_capable && w.input_data_received {
        return "RX".to_string();
    }
    if w.artnet_output_capable && w.output_data_active {
        return "OK".to_string();
    }
    "IDLE".to_string()
}

fn merge_policy_label(w: &PortWireSummary) -> String {
    if !w.artnet_output_capable {
        return "—".to_string();
    }
    if w.merge_ltp {
        "LTP".to_string()
    } else {
        "HTP".to_string()
    }
}

fn merge_glyph_label(w: &PortWireSummary) -> String {
    let in_only = w.artnet_input_capable && !w.artnet_output_capable;
    if in_only {
        return if w.merge_glyph_input_lone_filled {
            "in-rx".to_string()
        } else {
            "in-idle".to_string()
        };
    }
    match w.merge_glyph_output_filled_stack {
        2 => "out-2src".to_string(),
        1 => "out-1src".to_string(),
        _ => "out-idle".to_string(),
    }
}

fn port_rows_from_replies(replies: &[ArtPollReplyPacket]) -> Vec<PollPortJson> {
    let mut out = Vec::new();
    for reply in replies {
        let outs = reply.output_port_addresses();
        let ins = reply.input_port_addresses();
        let n = reply.num_ports().min(4) as usize;
        for slot in 0..n {
            let pt = reply.port_types[slot];
            let go = reply.good_output[slot];
            let gi = reply.good_input[slot];
            let gob = reply.good_output_b[slot];
            let st2 = reply.status2;
            let w = decode_port_wire_from_poll(pt, go, gi, gob, st2);
            let output_universe = outs.get(slot).copied().unwrap_or(0);
            let input_universe = ins.get(slot).copied();
            out.push(PollPortJson {
                short_name: reply.short_name_str().to_string(),
                ip: reply.ip().to_string(),
                bind_index: reply.bind_index,
                slot: slot as u8,
                port_type: pt,
                good_output: go,
                good_input: gi,
                good_output_b: gob,
                status2: st2,
                output_universe,
                input_universe,
                dir: dir_label(&w),
                conv: conv_label(&w),
                proto: port_protocol_name(w.protocol_code).to_string(),
                activity: activity_label(&w),
                merge_policy: merge_policy_label(&w),
                merge_glyph: merge_glyph_label(&w),
                rdm_active: w.rdm_active_on_port,
                out_nsu: format_nsu(output_universe),
                in_nsu: input_universe
                    .map(format_nsu)
                    .unwrap_or_else(|| "—".to_string()),
            });
        }
    }
    out
}

fn print_port_table(replies: &[ArtPollReplyPacket]) {
    let rows = port_rows_from_replies(replies);
    println!(
        "{} port row(s) from {} PollReply packet(s):\n",
        rows.len(),
        replies.len()
    );
    println!(
        "{:<12} {:<15} {:>4} {:>4} {:>4} {:>7} {:<7} {:<7} {:<7} {:<7} {:<8} {:>5} {:<7} {:<7}",
        "NAME",
        "IP",
        "BIND",
        "SLOT",
        "DIR",
        "CONV",
        "PROTO",
        "ACT",
        "M_POL",
        "M_GLY",
        "RDM",
        "U15",
        "OUT",
        "IN",
    );
    println!("{}", "─".repeat(110));
    for r in rows {
        let rdm = if r.rdm_active { "on" } else { "off" };
        println!(
            "{:<12} {:<15} {:>4} {:>4} {:>4} {:>7} {:<7} {:<7} {:<7} {:<7} {:<8} {:>5} {:<7} {:<7}",
            truncate(&r.short_name, 12),
            truncate(&r.ip, 15),
            r.bind_index,
            r.slot,
            r.dir,
            r.conv,
            truncate(&r.proto, 7),
            truncate(&r.activity, 7),
            truncate(&r.merge_policy, 7),
            truncate(&r.merge_glyph, 7),
            rdm,
            r.output_universe,
            truncate(&r.out_nsu, 7),
            truncate(&r.in_nsu, 7),
        );
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut t = String::new();
    for ch in s.chars().take(max.saturating_sub(1)) {
        t.push(ch);
    }
    t.push('…');
    t
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_row_activity_matches_short_bit() {
        let w = decode_port_wire_from_poll(0x80, 0x04, 0, 0, 0);
        assert_eq!(activity_label(&w), "SHORT");
    }
}
