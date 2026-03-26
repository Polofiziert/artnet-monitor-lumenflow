//! Virtual Art-Net node: receives ArtDmx and responds to ArtPoll with ArtPollReply.
//!
//! Profiles:
//! - **generic** — single `ArtPollReply` (legacy testing).
//! - **swisson-xnd8** — eight bind-index replies per `ArtPoll`, capture-aligned identity,
//!   `ArtAddress` name overlay, `ArtTod*` + `ArtRdm` (narrow) + `ArtIpProgReply`.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use anyhow::Result;
use lumenflow_core::{
    build_art_ip_prog_reply, build_art_tod_data, build_mock_poll_reply,
    build_swisson_bind_poll_reply, parse_art_tod_control, parse_art_tod_request,
    try_build_art_rdm_response_get_supported_parameters, ArtNetPacket, ArtNetParser,
    MockPollReplyConfig, OpCode, SwissonBindPollReplyParams, TOD_CMD_FULL, TOD_CTRL_FLUSH,
};

use lumenflow_core::ArtNetSocket;

const ART_NET_PORT: u16 = 6454;

/// Swisson XND-8 reference identity (`DMXW_03` capture).
const SWISSON_MAC: [u8; 6] = [0x28, 0x36, 0x38, 0xc0, 0x64, 0xc5];
const SWISSON_OEM: u16 = 0x28c1;
const SWISSON_VERS: u16 = 0x0103;
const SWISSON_ESTA: u16 = 0x5377;
const SWISSON_LONG: &str = "SWISSON XND-8";
const SWISSON_NODE_REPORT: &str = "#0001 [0120] Power on tests successful";
/// Fixture UID from DMXW_03 **ArtRdm** request (5347:e41bf39f).
const DEFAULT_RDM_UID: [u8; 6] = [0x53, 0x47, 0xe4, 0x1b, 0xf3, 0x9f];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VirtualNodeProfile {
    Generic,
    SwissonXnd8,
}

impl VirtualNodeProfile {
    pub fn parse(s: &str) -> Result<Self> {
        match s {
            "generic" => Ok(Self::Generic),
            "swisson-xnd8" => Ok(Self::SwissonXnd8),
            _ => anyhow::bail!("unknown profile '{s}'. Use: generic, swisson-xnd8"),
        }
    }
}

fn directed_broadcast(ip: std::net::Ipv4Addr) -> std::net::Ipv4Addr {
    let o = ip.octets();
    std::net::Ipv4Addr::new(o[0], 255, 255, 255)
}

fn default_gateway(ip: std::net::Ipv4Addr) -> std::net::Ipv4Addr {
    let o = ip.octets();
    std::net::Ipv4Addr::new(o[0], o[1], o[2], 1)
}

/// Runs a virtual Art-Net node: receives ArtDmx and responds to ArtPoll.
pub async fn run(
    profile: VirtualNodeProfile,
    name: &str,
    ip: &str,
    port: u16,
    target: &str,
    periodic_poll_reply: bool,
    verbose: bool,
) -> Result<()> {
    let ip_addr: std::net::Ipv4Addr = ip
        .parse()
        .map_err(|e| anyhow::anyhow!("invalid IP '{}': {}", ip, e))?;

    let target_addr = if periodic_poll_reply {
        Some(super::resolve::resolve_target(target, ART_NET_PORT).await?)
    } else {
        None
    };

    let bind_addr = SocketAddr::from(([0, 0, 0, 0], port));
    let mut socket = ArtNetSocket::bind(bind_addr)
        .await
        .map_err(|e| anyhow::anyhow!("bind to {}: {}", bind_addr, e))?;

    let generic_config = MockPollReplyConfig {
        ip: ip_addr,
        mac: [0x02, 0x00, 0x00, 0x00, 0x02, 0x02],
        short_name: name.to_string(),
        long_name: format!("Virtual Node ({})", name),
        port_addresses: vec![0, 1, 2, 3],
    };

    let bcast = SocketAddr::from((directed_broadcast(ip_addr), ART_NET_PORT));

    let mut dmx_recent: HashMap<u16, Instant> = HashMap::new();
    let mut tod_uids: Vec<[u8; 6]> = vec![DEFAULT_RDM_UID];
    let mut long_overlay: Option<String> = None;

    eprintln!(
        "Virtual node profile={:?} '{}' @ {} listening on 0.0.0.0:{}{}",
        profile,
        name,
        ip_addr,
        port,
        if periodic_poll_reply {
            format!("; periodic ArtPollReply → {target}")
        } else {
            String::new()
        }
    );
    if port == 6454 {
        eprintln!("Note: Port 6454 conflicts with LumenFlow. Use --port 6455 if both run on same machine.");
    }
    eprintln!("Press Ctrl+C to stop.\n");

    let mut poll_reply_tick = periodic_poll_reply.then(|| {
        let mut i = tokio::time::interval(Duration::from_secs_f64(2.5));
        i.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        i
    });

    loop {
        let recv_fut = tokio::time::timeout(Duration::from_millis(500), socket.recv());

        tokio::select! {
            _ = async {
                match poll_reply_tick.as_mut() {
                    Some(t) => {
                        t.tick().await;
                    }
                    None => {
                        std::future::pending::<()>().await;
                    }
                }
            }, if periodic_poll_reply => {
                let Some(ta) = target_addr else { continue };
                match profile {
                    VirtualNodeProfile::Generic => {
                        let pkt = build_mock_poll_reply(&generic_config);
                        if let Err(e) = socket.send_to(&pkt, ta).await {
                            eprintln!("[WARN] failed to send periodic ArtPollReply: {e}");
                        } else if verbose {
                            eprintln!("[TX ArtPollReply] → {} (periodic)", ta);
                        }
                    }
                    VirtualNodeProfile::SwissonXnd8 => {
                        for bind in 1u8..=8 {
                            let pkt = swisson_reply(
                                ip_addr,
                                bind,
                                long_overlay.as_deref(),
                                universe_for_bind(bind),
                                dmx_recent.contains_key(&universe_for_bind(bind)),
                            );
                            if let Err(e) = socket.send_to(&pkt, ta).await {
                                eprintln!("[WARN] failed to send periodic ArtPollReply: {e}");
                                break;
                            }
                        }
                        if verbose {
                            eprintln!("[TX ArtPollReply ×8] → {} (periodic)", ta);
                        }
                    }
                }
            }
            result = recv_fut => {
                let (data, addr) = match result {
                    Ok(Ok(r)) => r,
                    Ok(Err(e)) => return Err(anyhow::anyhow!("recv: {}", e)),
                    Err(_) => continue,
                };

                dmx_recent.retain(|_, t| t.elapsed() < Duration::from_secs(2));

                if data.len() >= 10 {
                    let oc = u16::from_le_bytes([data[8], data[9]]);
                    if oc == OpCode::TodRequest as u16 {
                        if profile == VirtualNodeProfile::SwissonXnd8 {
                            if let Ok(req) = parse_art_tod_request(data) {
                                for u in &req.addresses {
                                    let bind_idx = u.saturating_add(1).max(1);
                                    let pkt = build_art_tod_data(
                                        bind_idx,
                                        req.net,
                                        *u,
                                        TOD_CMD_FULL,
                                        &tod_uids,
                                    );
                                    if let Err(e) = socket.send_to(&pkt, bcast).await {
                                        eprintln!("[WARN] ArtTodData broadcast: {e}");
                                    } else if verbose {
                                        eprintln!(
                                            "[TX ArtTodData] → {} (bind {} universe {})",
                                            bcast, bind_idx, u
                                        );
                                    }
                                }
                            }
                        }
                        continue;
                    }
                    if oc == OpCode::TodControl as u16 {
                        if profile == VirtualNodeProfile::SwissonXnd8 {
                            if let Ok(ctrl) = parse_art_tod_control(data) {
                                if ctrl.command == TOD_CTRL_FLUSH {
                                    tod_uids.clear();
                                    tod_uids.push(DEFAULT_RDM_UID);
                                }
                                if verbose {
                                    eprintln!("[RX ArtTodControl] cmd={:02x} flush? {}", ctrl.command, ctrl.command == TOD_CTRL_FLUSH);
                                }
                            }
                        }
                        continue;
                    }
                    if oc == OpCode::Rdm as u16 {
                        if profile == VirtualNodeProfile::SwissonXnd8 {
                            if let Some(resp) = try_build_art_rdm_response_get_supported_parameters(data) {
                                if let Err(e) = socket.send_to(&resp, addr).await {
                                    eprintln!("[WARN] ArtRdm response: {e}");
                                } else if verbose {
                                    eprintln!("[TX ArtRdm] → {} (GET_SUPPORTED_PARAMS stub)", addr);
                                }
                            }
                        }
                        continue;
                    }
                    if oc == OpCode::IpProg as u16 {
                        let ip_out = match ArtNetParser::parse(data) {
                            Ok(ArtNetPacket::IpProg(p)) => {
                                let gw = default_gateway(ip_addr);
                                let sm = std::net::Ipv4Addr::new(255, 255, 255, 0);
                                (
                                    p.is_programming_enabled(),
                                    build_art_ip_prog_reply(ip_addr, sm, ART_NET_PORT, gw, false),
                                )
                            }
                            _ => {
                                continue;
                            }
                        };
                        if let Err(e) = socket.send_to(&ip_out.1, addr).await {
                            eprintln!("[WARN] ArtIpProgReply: {e}");
                        } else if verbose {
                            eprintln!(
                                "[TX ArtIpProgReply] → {} (prog? {})",
                                addr, ip_out.0
                            );
                        }
                        continue;
                    }
                }

                let packet = match ArtNetParser::parse(data) {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("[WARN] unparseable packet from {addr}: {e}");
                        continue;
                    }
                };

                match &packet {
                    ArtNetPacket::Poll(_) => {
                        match profile {
                            VirtualNodeProfile::Generic => {
                                let pkt = build_mock_poll_reply(&generic_config);
                                if let Err(e) = socket.send_to(&pkt, addr).await {
                                    eprintln!("[WARN] failed to send ArtPollReply: {e}");
                                } else if verbose {
                                    eprintln!("[RX ArtPoll] {} → [TX ArtPollReply]", addr);
                                }
                            }
                            VirtualNodeProfile::SwissonXnd8 => {
                                for bind in 1u8..=8 {
                                    let uni = universe_for_bind(bind);
                                    let pkt = swisson_reply(
                                        ip_addr,
                                        bind,
                                        long_overlay.as_deref(),
                                        uni,
                                        dmx_recent.contains_key(&uni),
                                    );
                                    if let Err(e) = socket.send_to(&pkt, addr).await {
                                        eprintln!("[WARN] ArtPollReply bind {bind}: {e}");
                                        break;
                                    }
                                }
                                if verbose {
                                    eprintln!("[RX ArtPoll] {} → [TX ArtPollReply ×8]", addr);
                                }
                            }
                        }
                    }
                    ArtNetPacket::Dmx { header, .. } => {
                        let uni = header.port_address();
                        dmx_recent.insert(uni, Instant::now());
                        if verbose {
                            eprintln!("[RX ArtDmx] {} | uni {}", addr, uni);
                        }
                    }
                    ArtNetPacket::Sync(_) => {
                        if verbose {
                            eprintln!("[RX ArtSync] {} (passive; spec pairs Sync source with last ArtDmx source IP)", addr);
                        }
                    }
                    ArtNetPacket::Address(a) => {
                        if profile == VirtualNodeProfile::SwissonXnd8 {
                            let ln = a.long_name_str();
                            if !ln.is_empty() {
                                long_overlay = Some(ln.to_string());
                            }
                            if verbose {
                                eprintln!("[RX ArtAddress] bind {} long='{}'", a.bind_index, ln);
                            }
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

fn universe_for_bind(bind: u8) -> u16 {
    (bind as u16).saturating_sub(1).min(0x7FFF)
}

fn swisson_reply(
    ip: std::net::Ipv4Addr,
    bind: u8,
    long_override: Option<&str>,
    port_address: u16,
    data_on: bool,
) -> [u8; 239] {
    let long = long_override.unwrap_or(SWISSON_LONG);
    let short = format!("Port {}", bind);
    let p = SwissonBindPollReplyParams {
        ip,
        mac: SWISSON_MAC,
        bind_index: bind,
        short_name: short,
        long_name: long.to_string(),
        node_report: SWISSON_NODE_REPORT.to_string(),
        port_address,
        oem: SWISSON_OEM,
        vers_info: SWISSON_VERS,
        esta_man: SWISSON_ESTA,
        status1: 0x02,
        data_on_port: data_on,
    };
    build_swisson_bind_poll_reply(&p)
}
