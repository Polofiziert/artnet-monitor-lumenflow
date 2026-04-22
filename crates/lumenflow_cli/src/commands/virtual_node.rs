//! Virtual Art-Net node: receives ArtDmx and responds to ArtPoll with ArtPollReply.
//!
//! Profiles:
//! - **generic** — single `ArtPollReply` (legacy testing).
//! - **swisson-xnd8** — eight bind-index replies per `ArtPoll`, capture-aligned identity,
//!   `ArtAddress` name overlay, `ArtTod*` + `ArtRdm` (narrow) + `ArtIpProgReply`.

use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::time::{Duration, Instant};

use anyhow::Result;
use lumenflow_core::{
    build_art_ip_prog_reply, build_art_tod_data, build_mock_poll_reply,
    build_swisson_bind_poll_reply, parse_art_tod_control, parse_art_tod_request,
    try_build_art_rdm_response_get_supported_parameters, ArtAddressCommand, ArtNetPacket,
    ArtNetParser, MockPollReplyConfig, OpCode, SwissonBindPollReplyParams, TOD_CMD_FULL,
    TOD_CTRL_FLUSH,
};

use lumenflow_core::ArtNetSocket;

const ART_NET_PORT: u16 = 6454;

/// Swisson XND-8 reference identity (`DMXW_03` capture).
const SWISSON_MAC: [u8; 6] = [0x28, 0x36, 0x38, 0xc0, 0x64, 0xc5];
const SWISSON_OEM: u16 = 0x28c1;
const SWISSON_VERS: u16 = 0x0103;
const SWISSON_ESTA: u16 = 0x5377;
const SWISSON_LONG: &str = "SWISSON XND-8";
/// Fixture UID from DMXW_03 **ArtRdm** request (5347:e41bf39f).
const DEFAULT_RDM_UID: [u8; 6] = [0x53, 0x47, 0xe4, 0x1b, 0xf3, 0x9f];

const RC_POWER_OK: u16 = 0x0001;
const RC_SH_NAME_OK: u16 = 0x0006;
const RC_LO_NAME_OK: u16 = 0x0007;
const RC_WARN: u16 = 0x0004;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VirtualLedState {
    Identify,
    Mute,
    Normal,
}

impl VirtualLedState {
    fn from_art_address_command(cmd: u8) -> Option<Self> {
        match cmd {
            x if x == ArtAddressCommand::AcLedLocate as u8 => Some(Self::Identify),
            x if x == ArtAddressCommand::AcLedMute as u8 => Some(Self::Mute),
            x if x == ArtAddressCommand::AcLedNormal as u8 => Some(Self::Normal),
            _ => None,
        }
    }

    /// Status1 bits 7-6: 01=Locate, 10=Mute, 11=Normal.
    fn status1_bits(self) -> u8 {
        match self {
            Self::Identify => 0x40,
            Self::Mute => 0x80,
            Self::Normal => 0xC0,
        }
    }

    fn report_text(self) -> &'static str {
        match self {
            Self::Identify => "LED indicators set to locate mode via ArtAddress",
            Self::Mute => "LED indicators muted via ArtAddress",
            Self::Normal => "LED indicators restored to normal via ArtAddress",
        }
    }
}

#[derive(Debug, Clone)]
struct VirtualNodeState {
    long_name: String,
    bind_short_names: HashMap<u8, String>,
    led_state: VirtualLedState,
    address_programmed_via_network: bool,
    node_report_code: u16,
    node_report_counter: u16,
    node_report_text: String,
    ports: Vec<VirtualPortState>,
}

impl VirtualNodeState {
    fn swisson_default() -> Self {
        Self {
            long_name: SWISSON_LONG.to_string(),
            bind_short_names: HashMap::new(),
            led_state: VirtualLedState::Normal,
            address_programmed_via_network: false,
            node_report_code: RC_POWER_OK,
            node_report_counter: 120,
            node_report_text: "Power on tests successful".to_string(),
            ports: (0..8).map(VirtualPortState::default_for_index).collect(),
        }
    }

    fn short_name_for_bind(&self, bind: u8) -> String {
        self.bind_short_names
            .get(&bind)
            .cloned()
            .unwrap_or_else(|| format!("Port {}", bind))
    }

    fn status1(&self) -> u8 {
        let authority_bits = if self.address_programmed_via_network {
            0x20u8
        } else {
            0x00u8
        };
        let low_bits = 0x02u8 | authority_bits;
        self.led_state.status1_bits() | low_bits
    }

    fn node_report_string(&self) -> String {
        format!(
            "#{:04x} [{:04}] {}",
            self.node_report_code, self.node_report_counter, self.node_report_text
        )
    }

    fn set_node_report(&mut self, code: u16, text: impl Into<String>) {
        self.node_report_code = code;
        self.node_report_text = text.into();
    }

    fn report_for_next_poll_reply(&mut self) -> String {
        let text = self.node_report_string();
        self.node_report_counter = (self.node_report_counter + 1) % 10_000;
        if self.node_report_counter == 0 {
            self.node_report_counter = 1;
        }
        text
    }

    fn apply_address_authority(&mut self, address: &lumenflow_core::ArtAddressPacket) {
        let net_or_sub_program = address.net_switch != 0x7f || address.sub_switch != 0x7f;
        let sw_program = address
            .sw_in
            .iter()
            .chain(address.sw_out.iter())
            .any(|v| *v != 0x7f);
        if net_or_sub_program || sw_program {
            self.address_programmed_via_network = true;
        }
    }

    fn apply_art_address(&mut self, address: &lumenflow_core::ArtAddressPacket) -> bool {
        let mut changed = false;
        let bind = address.bind_index.max(1);
        self.apply_address_authority(address);
        let mut name_changed = false;

        let short_name = address.short_name_str().trim();
        if !short_name.is_empty() {
            self.bind_short_names.insert(bind, short_name.to_string());
            self.set_node_report(
                RC_SH_NAME_OK,
                format!(
                    "Port name programmed via ArtAddress (bind {}): {}",
                    bind, short_name
                ),
            );
            changed = true;
            name_changed = true;
        }

        let long_name = address.long_name_str().trim();
        if !long_name.is_empty() {
            self.long_name = long_name.to_string();
            self.set_node_report(
                RC_LO_NAME_OK,
                format!("Long name programmed via ArtAddress: {}", long_name),
            );
            changed = true;
            name_changed = true;
        }

        if let Some(led_state) = VirtualLedState::from_art_address_command(address.command) {
            self.led_state = led_state;
            if !name_changed {
                self.set_node_report(RC_POWER_OK, led_state.report_text());
            }
            changed = true;
        }

        if self.apply_port_command(bind, address.command) {
            changed = true;
        }

        changed
    }

    fn port_index_from_bind(bind: u8) -> usize {
        bind.saturating_sub(1).min(7) as usize
    }

    fn apply_port_command(&mut self, bind: u8, command: u8) -> bool {
        let (family, slot_override) = decode_port_command(command);
        let target_idx = slot_override
            .map(|slot| slot.min(7) as usize)
            .unwrap_or_else(|| Self::port_index_from_bind(bind));
        let Some(port) = self.ports.get_mut(target_idx) else {
            return false;
        };
        let changed = match family {
            PortCommandFamily::None => false,
            PortCommandFamily::CancelMerge => {
                port.merge_active = false;
                port.merge_sources.clear();
                true
            }
            PortCommandFamily::MergeLtp => {
                port.merge_ltp = true;
                true
            }
            PortCommandFamily::MergeHtp => {
                port.merge_ltp = false;
                true
            }
            PortCommandFamily::DirectionTx => {
                port.direction = VirtualPortDirection::Output;
                true
            }
            PortCommandFamily::DirectionRx => {
                port.direction = VirtualPortDirection::Input;
                true
            }
            PortCommandFamily::ArtNetSelect => {
                port.output_sacn = false;
                port.input_sacn = false;
                true
            }
            PortCommandFamily::SacnSelect => {
                if port.direction != VirtualPortDirection::Input {
                    port.output_sacn = true;
                }
                if port.direction != VirtualPortDirection::Output {
                    port.input_sacn = true;
                }
                true
            }
            PortCommandFamily::ClearOutput => {
                port.output_data_active = false;
                true
            }
            PortCommandFamily::StyleDelta => {
                port.output_style_delta = true;
                true
            }
            PortCommandFamily::StyleContinuous => {
                port.output_style_delta = false;
                true
            }
            PortCommandFamily::RdmEnable => {
                port.rdm_enabled = true;
                true
            }
            PortCommandFamily::RdmDisable => {
                port.rdm_enabled = false;
                true
            }
            PortCommandFamily::ResetRxFlags => {
                port.input_errors = false;
                true
            }
            PortCommandFamily::Other => false,
        };
        if changed {
            self.set_node_report(
                RC_POWER_OK,
                format!(
                    "Port {} updated via ArtAddress command 0x{command:02x}",
                    target_idx + 1
                ),
            );
        }
        changed
    }

    fn mark_dmx_source(&mut self, port_index: usize, source_key: String) {
        let Some(port) = self.ports.get_mut(port_index) else {
            return;
        };
        if port.direction != VirtualPortDirection::Input {
            port.output_data_active = true;
        }
        if port.direction != VirtualPortDirection::Output {
            port.input_data_received = true;
        }
        port.merge_sources.insert(source_key);
        port.merge_active = port.merge_sources.len() > 1;
        if port.merge_active {
            self.set_node_report(
                RC_WARN,
                format!("Port {} merge active (multiple DMX sources)", port_index + 1),
            );
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VirtualPortDirection {
    Output,
    Input,
    Bidirectional,
}

#[derive(Debug, Clone)]
pub struct VirtualPortConfig {
    pub label: String,
    pub protocol_code: u8,
    pub direction: VirtualPortDirection,
    pub output_sacn: bool,
    pub input_sacn: bool,
    pub merge_ltp: bool,
    pub rdm_enabled: bool,
    pub output_style_delta: bool,
    pub output_short: bool,
    pub input_errors: bool,
    pub input_data_received: bool,
    pub output_data_active: bool,
    pub universe: u16,
}

#[derive(Debug, Clone)]
struct VirtualPortState {
    label: String,
    protocol_code: u8,
    direction: VirtualPortDirection,
    output_sacn: bool,
    input_sacn: bool,
    merge_ltp: bool,
    rdm_enabled: bool,
    output_style_delta: bool,
    output_short: bool,
    input_errors: bool,
    input_data_received: bool,
    output_data_active: bool,
    merge_active: bool,
    merge_sources: HashSet<String>,
    universe: u16,
}

impl VirtualPortState {
    fn default_for_index(index: u8) -> Self {
        Self {
            label: format!("Port {}", index + 1),
            protocol_code: 0,
            direction: VirtualPortDirection::Output,
            output_sacn: false,
            input_sacn: false,
            merge_ltp: false,
            rdm_enabled: true,
            output_style_delta: false,
            output_short: false,
            input_errors: false,
            input_data_received: false,
            output_data_active: false,
            merge_active: false,
            merge_sources: HashSet::new(),
            universe: index as u16,
        }
    }

    fn from_config(index: u8, config: &VirtualPortConfig) -> Self {
        let mut state = Self::default_for_index(index);
        state.label = config.label.clone();
        state.protocol_code = config.protocol_code & 0x3f;
        state.direction = config.direction;
        state.output_sacn = config.output_sacn;
        state.input_sacn = config.input_sacn;
        state.merge_ltp = config.merge_ltp;
        state.rdm_enabled = config.rdm_enabled;
        state.output_style_delta = config.output_style_delta;
        state.output_short = config.output_short;
        state.input_errors = config.input_errors;
        state.input_data_received = config.input_data_received;
        state.output_data_active = config.output_data_active;
        state.universe = config.universe.min(0x7fff);
        state
    }

    fn port_type(&self) -> u8 {
        let dir_bits = match self.direction {
            VirtualPortDirection::Output => 0x80,
            VirtualPortDirection::Input => 0x40,
            VirtualPortDirection::Bidirectional => 0xC0,
        };
        dir_bits | (self.protocol_code & 0x3f)
    }

    fn good_output(&self) -> u8 {
        let mut out = 0u8;
        if self.output_sacn {
            out |= 0x01;
        }
        if self.merge_ltp {
            out |= 0x02;
        }
        if self.output_short {
            out |= 0x04;
        }
        if self.merge_active {
            out |= 0x08;
        }
        if self.output_data_active {
            out |= 0x80;
        }
        out
    }

    fn good_input(&self) -> u8 {
        let mut input = 0u8;
        if self.input_sacn {
            input |= 0x01;
        }
        if self.input_errors {
            input |= 0x04;
        }
        if self.input_data_received {
            input |= 0x80;
        }
        input
    }

    fn good_output_b(&self) -> u8 {
        if self.rdm_enabled {
            0x00
        } else {
            0x80
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PortCommandFamily {
    None,
    CancelMerge,
    ResetRxFlags,
    MergeLtp,
    DirectionTx,
    DirectionRx,
    MergeHtp,
    ArtNetSelect,
    SacnSelect,
    ClearOutput,
    StyleDelta,
    StyleContinuous,
    RdmEnable,
    RdmDisable,
    Other,
}

fn decode_port_command(command: u8) -> (PortCommandFamily, Option<u8>) {
    if command == ArtAddressCommand::AcCancelMerge as u8 {
        return (PortCommandFamily::CancelMerge, None);
    }
    if command == ArtAddressCommand::AcResetRxFlags as u8 {
        return (PortCommandFamily::ResetRxFlags, None);
    }
    let family = command & 0xF0;
    let slot = command & 0x0F;
    let slot_override = (slot <= 3).then_some(slot);
    let mapped = match family {
        0x10 => PortCommandFamily::MergeLtp,
        0x20 => PortCommandFamily::DirectionTx,
        0x30 => PortCommandFamily::DirectionRx,
        0x50 => PortCommandFamily::MergeHtp,
        0x60 => PortCommandFamily::ArtNetSelect,
        0x70 => PortCommandFamily::SacnSelect,
        0x90 => PortCommandFamily::ClearOutput,
        0xA0 => PortCommandFamily::StyleDelta,
        0xB0 => PortCommandFamily::StyleContinuous,
        0xC0 => PortCommandFamily::RdmEnable,
        0xD0 => PortCommandFamily::RdmDisable,
        _ => {
            if command == 0 {
                PortCommandFamily::None
            } else {
                PortCommandFamily::Other
            }
        }
    };
    (mapped, slot_override)
}

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

pub fn parse_protocol_code(s: &str) -> Result<u8> {
    let key = s.trim().to_ascii_lowercase();
    let code = match key.as_str() {
        "dmx" | "dmx512" => 0,
        "midi" => 1,
        "avab" => 2,
        "colortran" | "cmx" => 3,
        "adb" | "adb62.5" => 4,
        "artnet" => 5,
        "dali" => 6,
        other => {
            return Err(anyhow::anyhow!(
                "unknown protocol '{}'. Use: dmx512, midi, avab, colortran, adb, artnet, dali",
                other
            ))
        }
    };
    Ok(code)
}

pub fn parse_port_direction(s: &str) -> Result<VirtualPortDirection> {
    let key = s.trim().to_ascii_lowercase();
    let direction = match key.as_str() {
        "output" | "out" | "tx" => VirtualPortDirection::Output,
        "input" | "in" | "rx" => VirtualPortDirection::Input,
        "bidir" | "bidirectional" | "both" => VirtualPortDirection::Bidirectional,
        other => {
            return Err(anyhow::anyhow!(
                "unknown direction '{}'. Use: output, input, bidirectional",
                other
            ))
        }
    };
    Ok(direction)
}

fn directed_broadcast(ip: std::net::Ipv4Addr) -> std::net::Ipv4Addr {
    let o = ip.octets();
    std::net::Ipv4Addr::new(o[0], 255, 255, 255)
}

fn default_gateway(ip: std::net::Ipv4Addr) -> std::net::Ipv4Addr {
    let o = ip.octets();
    std::net::Ipv4Addr::new(o[0], o[1], o[2], 1)
}

/// Runs a virtual Art-Net node that receives ArtDmx and responds to ArtPoll.
///
/// In `swisson-xnd8` profile, this also applies inbound ArtAddress name/LED updates
/// and reflects them in subsequent ArtPollReply packets.
///
/// # Errors
/// Returns an error when:
/// - the advertised IP cannot be parsed,
/// - the optional target host cannot be resolved (periodic mode),
/// - UDP bind fails,
/// - packet receive fails,
/// - packet send fails on operations that are treated as fatal.
pub async fn run(
    profile: VirtualNodeProfile,
    name: &str,
    ip: &str,
    port: u16,
    target: &str,
    periodic_poll_reply: bool,
    verbose: bool,
    configured_ports: Option<Vec<VirtualPortConfig>>,
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
    let mut virtual_state = VirtualNodeState::swisson_default();
    if let Some(port_cfgs) = configured_ports {
        for (index, cfg) in port_cfgs.iter().take(8).enumerate() {
            virtual_state.ports[index] = VirtualPortState::from_config(index as u8, cfg);
            virtual_state.bind_short_names.insert((index + 1) as u8, cfg.label.clone());
        }
    }

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
                                    let node_report = virtual_state.report_for_next_poll_reply();
                            let pkt = swisson_reply(SwissonReplyInput {
                                ip: ip_addr,
                                bind,
                                short_name: &virtual_state.ports[VirtualNodeState::port_index_from_bind(bind)].label,
                                long_name: &virtual_state.long_name,
                                node_report: &node_report,
                                port_state: &virtual_state.ports[VirtualNodeState::port_index_from_bind(bind)],
                                status1: virtual_state.status1(),
                            });
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
                                    let node_report = virtual_state.report_for_next_poll_reply();
                                    let pkt = swisson_reply(SwissonReplyInput {
                                        ip: ip_addr,
                                        bind,
                                        short_name: &virtual_state.ports[VirtualNodeState::port_index_from_bind(bind)].label,
                                        long_name: &virtual_state.long_name,
                                        node_report: &node_report,
                                        port_state: &virtual_state.ports[VirtualNodeState::port_index_from_bind(bind)],
                                        status1: virtual_state.status1(),
                                    });
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
                        if let Some(port_index) =
                            virtual_state.ports.iter().position(|p| p.universe == uni)
                        {
                            virtual_state.mark_dmx_source(
                                port_index,
                                format!("{}:{}", addr.ip(), header.physical),
                            );
                        }
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
                            let bind = a.bind_index.max(1);
                            let cmd = a.command;
                            let short = a.short_name_str().to_string();
                            let long = a.long_name_str().to_string();
                            let changed = virtual_state.apply_art_address(a);
                            // Art-Net 4: Node replies to ArtAddress with unicast ArtPollReply.
                            for bind in 1u8..=8 {
                                let uni = universe_for_bind(bind);
                                let node_report = virtual_state.report_for_next_poll_reply();
                                let pkt = swisson_reply(SwissonReplyInput {
                                    ip: ip_addr,
                                    bind,
                                    short_name: &virtual_state.ports[VirtualNodeState::port_index_from_bind(bind)].label,
                                    long_name: &virtual_state.long_name,
                                    node_report: &node_report,
                                    port_state: &virtual_state.ports[VirtualNodeState::port_index_from_bind(bind)],
                                    status1: virtual_state.status1(),
                                });
                                if let Err(e) = socket.send_to(&pkt, addr).await {
                                    eprintln!("[WARN] ArtAddress->ArtPollReply bind {bind}: {e}");
                                    break;
                                }
                            }
                            if changed {
                                eprintln!(
                                    "[RX ArtAddress] bind {} -> led={:?}, short='{}', long='{}', report='{}'",
                                    bind,
                                    virtual_state.led_state,
                                    virtual_state.short_name_for_bind(bind),
                                    virtual_state.long_name,
                                    virtual_state.node_report_string(),
                                );
                            }
                            if verbose {
                                eprintln!(
                                    "[RX ArtAddress details] cmd=0x{:02x} short='{}' long='{}'",
                                    cmd, short, long
                                );
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

struct SwissonReplyInput<'a> {
    ip: std::net::Ipv4Addr,
    bind: u8,
    short_name: &'a str,
    long_name: &'a str,
    node_report: &'a str,
    port_state: &'a VirtualPortState,
    status1: u8,
}

fn swisson_reply(input: SwissonReplyInput<'_>) -> [u8; 239] {
    let p = SwissonBindPollReplyParams {
        ip: input.ip,
        mac: SWISSON_MAC,
        bind_index: input.bind,
        short_name: input.short_name.to_string(),
        long_name: input.long_name.to_string(),
        node_report: input.node_report.to_string(),
        port_address: input.port_state.universe,
        oem: SWISSON_OEM,
        vers_info: SWISSON_VERS,
        esta_man: SWISSON_ESTA,
        status1: input.status1,
        port_type: input.port_state.port_type(),
        good_input: input.port_state.good_input(),
        good_output: input.port_state.good_output(),
        good_output_b: input.port_state.good_output_b(),
        status2: 0x98,
    };
    build_swisson_bind_poll_reply(&p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lumenflow_core::{build_art_address, ArtAddressCommand, ArtNetPacket, ArtNetParser};

    fn parse_address_packet(packet: &[u8; 107]) -> lumenflow_core::ArtAddressPacket {
        match ArtNetParser::parse(packet) {
            Ok(ArtNetPacket::Address(address)) => *address,
            other => panic!("expected ArtAddress packet, got {other:?}"),
        }
    }

    #[test]
    fn virtual_state_applies_led_commands_and_status1_bits() {
        let mut state = VirtualNodeState::swisson_default();
        assert_eq!(state.status1(), 0xC2);

        let locate = build_art_address(
            0x7F,
            1,
            "",
            "",
            [0x7F; 4],
            [0x7F; 4],
            0x7F,
            ArtAddressCommand::AcLedLocate as u8,
        );
        let locate_addr = parse_address_packet(&locate);
        assert!(state.apply_art_address(&locate_addr));
        assert_eq!(state.led_state, VirtualLedState::Identify);
        assert_eq!(state.status1(), 0x42);

        let mute = build_art_address(
            0x7F,
            1,
            "",
            "",
            [0x7F; 4],
            [0x7F; 4],
            0x7F,
            ArtAddressCommand::AcLedMute as u8,
        );
        let mute_addr = parse_address_packet(&mute);
        assert!(state.apply_art_address(&mute_addr));
        assert_eq!(state.led_state, VirtualLedState::Mute);
        assert_eq!(state.status1(), 0x82);
    }

    #[test]
    fn node_report_counter_rolls_per_poll_reply() {
        let mut state = VirtualNodeState::swisson_default();
        state.node_report_counter = 9999;
        let r1 = state.report_for_next_poll_reply();
        let r2 = state.report_for_next_poll_reply();
        assert!(r1.contains("[9999]"));
        assert!(r2.contains("[0001]"));
    }

    #[test]
    fn virtual_state_applies_port_name_per_bind() {
        let mut state = VirtualNodeState::swisson_default();

        let address = build_art_address(
            0x7F,
            3,
            "Back Truss",
            "",
            [0x7F; 4],
            [0x7F; 4],
            0x7F,
            ArtAddressCommand::AcNone as u8,
        );
        let parsed = parse_address_packet(&address);
        assert!(state.apply_art_address(&parsed));

        assert_eq!(state.short_name_for_bind(1), "Port 1");
        assert_eq!(state.short_name_for_bind(3), "Back Truss");
        assert_eq!(state.node_report_code, RC_SH_NAME_OK);
        assert!(state.node_report_string().contains("Port name programmed"));
    }

    #[test]
    fn virtual_state_applies_long_name_overlay() {
        let mut state = VirtualNodeState::swisson_default();
        let address = build_art_address(
            0x7F,
            1,
            "",
            "Node Rack A",
            [0x7F; 4],
            [0x7F; 4],
            0x7F,
            ArtAddressCommand::AcNone as u8,
        );
        let parsed = parse_address_packet(&address);
        assert!(state.apply_art_address(&parsed));
        assert_eq!(state.long_name, "Node Rack A");
        assert_eq!(state.node_report_code, RC_LO_NAME_OK);
        assert!(state.node_report_string().contains("Long name programmed"));
    }
}
