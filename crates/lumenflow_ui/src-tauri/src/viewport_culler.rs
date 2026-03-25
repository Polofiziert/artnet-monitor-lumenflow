use std::net::SocketAddr;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use dashmap::DashSet;
use lumenflow_core::artnet::{
    build_art_address, build_art_data_request, build_art_ip_prog, build_our_poll_reply,
    ArtAddressCommand, ArtNetParser, IpProgConfig, ART_ADDRESS_NO_CHANGE, ART_NET_PORT,
};
use lumenflow_core::build_art_poll;
use lumenflow_core::buffer::UniverseStore;
use lumenflow_core::device::{ArtNetProduct, DeviceInfo, DeviceRegistry};
use lumenflow_core::engine::{DiscoveryConfig, DiagBuffer, DiagPriority, JitterCollector, SyncDetector, Staleness};
use lumenflow_core::network::{derive_cidr_24_from_ip, resolve_interface_for_cidr, ArtNetSocket};
use parking_lot::RwLock;
use tauri::State;
use tokio::sync::{mpsc, oneshot};

use crate::network_commands::NetworkState;
use lumenflow_core::{epoch_nanos, parse_discovery_targets_from_env, spawn_discovery};
use tokio_util::sync::CancellationToken;
use tauri::Emitter;
use tokio::time;

/// Shared application state managed by Tauri.
///
/// Holds the universe data store (fed by the UDP listener), the set
/// of universe IDs currently visible in the frontend viewport, the
/// device registry for discovered Art-Net nodes, the sync detector,
/// and the diagnostic log buffer.
#[derive(Clone)]
pub struct AppState {
    pub universe_store: Arc<UniverseStore>,
    pub active_ids: Arc<DashSet<u16>>,
    pub device_registry: Arc<DeviceRegistry>,
    pub device_version: Arc<AtomicU64>,
    pub controllers_seen: Arc<dashmap::DashMap<std::net::Ipv4Addr, ControllerSeen>>,
    pub listener_tx: Arc<RwLock<Option<mpsc::Sender<ListenerCommand>>>>,
    pub sync_detector: Arc<SyncDetector>,
    pub diag_buffer: Arc<DiagBuffer>,
    pub jitter_collector: Arc<JitterCollector>,
}

#[derive(Clone, Debug)]
pub struct ControllerSeen {
    pub last_seen_at: Instant,
    pub talk_to_me: u8,
    pub diag_priority: u8,
    pub target_port_bottom: u16,
    pub target_port_top: u16,
    pub esta_man: u16,
    pub oem: u16,
}

#[derive(Clone, serde::Serialize)]
pub struct ControllerSeenDto {
    pub ip: String,
    pub last_seen_at_ms: u64,
    pub talk_to_me: u8,
    pub diag_priority: u8,
    pub target_port_bottom: u16,
    pub target_port_top: u16,
    pub esta_man: u16,
    pub oem: u16,
}

/// Tauri command: the frontend calls this whenever the visible universe set changes.
#[tauri::command]
pub fn set_active_universes(ids: Vec<u16>, state: tauri::State<'_, AppState>) {
    state.active_ids.clear();
    for id in ids {
        state.active_ids.insert(id);
    }
}

/// Tauri command: returns the sorted list of all universes that have received data.
#[tauri::command]
pub fn get_available_universes(state: tauri::State<'_, AppState>) -> Vec<u16> {
    state.universe_store.active_universes()
}

/// Serializable device info for the frontend.
#[derive(Clone, serde::Serialize)]
pub struct DeviceInfoDto {
    pub ip_address: String,
    pub bind_ip: String,
    pub bind_index: u8,
    pub port: u16,
    pub mac_address: String,
    pub short_name: String,
    pub long_name: String,
    pub node_report: String,
    pub firmware_version: u16,
    pub ubea_version: u8,
    pub esta_man: u16,
    pub oem_code: u16,
    pub net_switch: u8,
    pub sub_switch: u8,
    pub num_ports: u16,
    pub port_types: Vec<u8>,
    pub good_input: Vec<u8>,
    pub good_output: Vec<u8>,
    pub good_output_b: Vec<u8>,
    pub sw_in: Vec<u8>,
    pub sw_out: Vec<u8>,
    pub status1: u8,
    pub status2: u8,
    pub status3: u8,
    pub acn_priority: u8,
    pub sw_macro: u8,
    pub sw_remote: u8,
    pub style: u8,
    pub def_resp: String,
    pub user: String,
    pub refresh_rate: u16,
    pub port_addresses: Vec<u16>,
    pub input_port_addresses: Vec<u16>,
    /// True if device sent ArtPollReply within the last 3 seconds.
    pub online: bool,
}

/// One flattened DMX port on an Art-Net product (see `DeviceRegistry::aggregate_products`).
#[derive(Clone, serde::Serialize)]
pub struct ProductPortDto {
    pub bind_index: u8,
    pub slot: u8,
    pub output_universe: u16,
    pub input_universe: Option<u16>,
    pub label: String,
}

/// One physical Art-Net node, merged from all BindIndex replies for the same bind IP + MAC.
#[derive(Clone, serde::Serialize)]
pub struct ArtNetProductDto {
    pub product_id: String,
    pub bind_ip: String,
    pub ip_address: String,
    pub mac_address: String,
    pub short_name: String,
    pub long_name: String,
    pub esta_man: u16,
    pub oem_code: u16,
    pub firmware_version: u16,
    pub node_report: String,
    pub ports: Vec<ProductPortDto>,
    pub online: bool,
    /// When set, send management packets (e.g. ArtIpProg) here instead of `ip_address:6454`.
    pub transport_addr: Option<String>,
}

/// Event payload for frontend device updates (D5 push path).
#[derive(Clone, serde::Serialize)]
pub struct DevicesUpdatedDto {
    pub version: u64,
    pub timestamp_nanos: u64,
    pub products: Vec<ArtNetProductDto>,
}

/// Activity pulse for ArtPollReply reception (one per deduplicated bind bundle).
#[derive(Clone, serde::Serialize)]
pub struct DevicePollReplyActivityDto {
    pub product_id: String,
    pub ip_address: String,
    pub bind_ip: String,
    pub bind_index: u8,
    pub short_name: String,
    pub received_at_nanos: u64,
    pub bundle_window_ms: u64,
}

const POLL_REPLY_BUNDLE_WINDOW_MS: u64 = 180;
const POLL_REPLY_BUNDLE_STATE_TTL_SECS: u64 = 10;

fn should_emit_poll_reply_bundle(
    now: Instant,
    product_id: &str,
    bundle_state: &mut HashMap<String, Instant>,
) -> bool {
    let window = Duration::from_millis(POLL_REPLY_BUNDLE_WINDOW_MS);
    match bundle_state.get(product_id) {
        Some(last) => now.saturating_duration_since(*last) > window,
        None => true,
    }
}

fn note_emitted_poll_reply_bundle(
    now: Instant,
    product_id: &str,
    bundle_state: &mut HashMap<String, Instant>,
) {
    bundle_state.insert(product_id.to_string(), now);
}

fn prune_bundle_state(now: Instant, bundle_state: &mut HashMap<String, Instant>) {
    let ttl = Duration::from_secs(POLL_REPLY_BUNDLE_STATE_TTL_SECS);
    bundle_state.retain(|_, last| now.saturating_duration_since(*last) <= ttl);
}

fn format_hex_bytes(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn map_device_to_dto(d: DeviceInfo, cutoff: Instant) -> DeviceInfoDto {
    DeviceInfoDto {
        ip_address: d.ip_address.to_string(),
        bind_ip: d.bind_ip.to_string(),
        bind_index: d.bind_index,
        port: d.port,
        mac_address: format!(
            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
            d.mac_address[0], d.mac_address[1], d.mac_address[2], d.mac_address[3], d.mac_address[4], d.mac_address[5]
        ),
        short_name: d.short_name,
        long_name: d.long_name,
        node_report: d.node_report,
        firmware_version: d.firmware_version,
        ubea_version: d.ubea_version,
        esta_man: d.esta_man,
        oem_code: d.oem_code,
        net_switch: d.net_switch,
        sub_switch: d.sub_switch,
        num_ports: d.num_ports,
        port_types: d.port_types.to_vec(),
        good_input: d.good_input.to_vec(),
        good_output: d.good_output.to_vec(),
        good_output_b: d.good_output_b.to_vec(),
        sw_in: d.sw_in.to_vec(),
        sw_out: d.sw_out.to_vec(),
        status1: d.status1,
        status2: d.status2,
        status3: d.status3,
        acn_priority: d.acn_priority,
        sw_macro: d.sw_macro,
        sw_remote: d.sw_remote,
        style: d.style,
        def_resp: format_hex_bytes(&d.def_resp),
        user: format_hex_bytes(&d.user),
        refresh_rate: d.refresh_rate,
        port_addresses: d.port_addresses,
        input_port_addresses: d.input_port_addresses,
        online: d.last_seen >= cutoff,
    }
}

fn artnet_product_id(bind_ip: std::net::Ipv4Addr, mac: &[u8; 6]) -> String {
    let mac_s: String = mac.iter().map(|b| format!("{b:02X}")).collect();
    format!("{bind_ip}|{mac_s}")
}

fn map_artnet_product_to_dto(p: ArtNetProduct, cutoff: Instant) -> ArtNetProductDto {
    ArtNetProductDto {
        product_id: artnet_product_id(p.bind_ip, &p.mac_address),
        bind_ip: p.bind_ip.to_string(),
        ip_address: p.ip_address.to_string(),
        mac_address: format!(
            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
            p.mac_address[0],
            p.mac_address[1],
            p.mac_address[2],
            p.mac_address[3],
            p.mac_address[4],
            p.mac_address[5],
        ),
        short_name: p.short_name,
        long_name: p.long_name,
        esta_man: p.esta_man,
        oem_code: p.oem_code,
        firmware_version: p.firmware_version,
        node_report: p.node_report,
        ports: p
            .ports
            .into_iter()
            .map(|port| ProductPortDto {
                bind_index: port.bind_index,
                slot: port.slot,
                output_universe: port.output_universe,
                input_universe: port.input_universe,
                label: port.label,
            })
            .collect(),
        online: p.last_seen >= cutoff,
        transport_addr: p.last_reply_source.map(|a| a.to_string()),
    }
}

/// Serializable diagnostic entry for the frontend.
#[derive(serde::Serialize)]
pub struct DiagEntryDto {
    pub timestamp_nanos: u64,
    pub priority: u8,
    pub message: String,
    pub source_ip: Option<String>,
}

/// Tauri command: returns the most recent diagnostic entries.
#[tauri::command]
pub fn get_diag_entries(state: tauri::State<'_, AppState>) -> Vec<DiagEntryDto> {
    state
        .diag_buffer
        .snapshot()
        .into_iter()
        .map(|e| DiagEntryDto {
            timestamp_nanos: e.timestamp_nanos,
            priority: e.priority as u8,
            message: e.message,
            source_ip: e.source_ip,
        })
        .collect()
}

/// Tauri command: returns controllers seen via incoming ArtPoll packets.
#[tauri::command]
pub fn get_controllers(state: tauri::State<'_, AppState>) -> Vec<ControllerSeenDto> {
    let now = Instant::now();
    let mut out: Vec<ControllerSeenDto> = state
        .controllers_seen
        .iter()
        .map(|kv| {
            let ip = *kv.key();
            let c = kv.value();
            let age_ms = now
                .duration_since(c.last_seen_at)
                .as_millis()
                .min(u128::from(u64::MAX)) as u64;
            ControllerSeenDto {
                ip: ip.to_string(),
                last_seen_at_ms: age_ms,
                talk_to_me: c.talk_to_me,
                diag_priority: c.diag_priority,
                target_port_bottom: c.target_port_bottom,
                target_port_top: c.target_port_top,
                esta_man: c.esta_man,
                oem: c.oem,
            }
        })
        .collect();
    out.sort_by(|a, b| a.ip.cmp(&b.ip));
    out
}

/// Parameters for the send_ip_prog command.
#[derive(serde::Deserialize)]
pub struct IpProgParams {
    /// Target device IP (string, e.g. "192.168.1.100").
    pub target_ip: String,
    /// New IP address (optional, for programming).
    pub new_ip: Option<String>,
    /// New subnet mask (optional, for programming).
    pub subnet_mask: Option<String>,
    /// New default gateway (optional, for programming).
    pub gateway: Option<String>,
    /// New port (optional, for programming). Default 6454.
    pub port: Option<u16>,
    /// Enable programming (bit 7). If false, read-only query.
    pub enable_programming: bool,
    /// Enable DHCP (bit 6).
    pub enable_dhcp: bool,
    /// When set (e.g. `127.0.0.1:6457`), send ArtIpProg here instead of `target_ip:6454`.
    /// Required for Docker port-mapped nodes whose advertised IP is not host-routable.
    pub transport: Option<String>,
}

/// Reply data from ArtIpProgReply.
#[derive(serde::Serialize)]
pub struct IpProgReplyDto {
    pub ip: String,
    pub subnet_mask: String,
    pub gateway: String,
    pub port: u16,
    pub dhcp_enabled: bool,
}

/// Parameters for remotely programming device names via ArtAddress.
#[derive(serde::Deserialize)]
pub struct ArtAddressParams {
    /// Target device IP (string, e.g. "192.168.1.100").
    pub target_ip: String,
    /// Optional management transport override (e.g. "127.0.0.1:6457").
    pub transport: Option<String>,
    /// Bind index to program (1-based for most nodes).
    pub bind_index: u8,
    /// Optional Port Name (`short_name` field in wire packet; max 17 chars + null).
    pub port_name: Option<String>,
    /// Optional Long Name (max 63 chars + null).
    pub long_name: Option<String>,
    /// Optional: program output universe nibble for a port slot (0..3) in this bind page.
    pub set_output_universe: Option<PortUniverseUpdate>,
    /// Optional: program input universe nibble for a port slot (0..3) in this bind page.
    pub set_input_universe: Option<PortUniverseUpdate>,
}

/// Per-port universe update for ArtAddress (slot 0..3; 15-bit port address 0..32767).
#[derive(serde::Deserialize)]
pub struct PortUniverseUpdate {
    pub slot: u8,
    pub universe: u16,
}

pub(crate) enum ListenerCommand {
    SendArtAddress {
        target: SocketAddr,
        packet: Vec<u8>,
        response: oneshot::Sender<Result<(), String>>,
    },
    SendIpProg {
        target: SocketAddr,
        packet: Vec<u8>,
        response: oneshot::Sender<Result<IpProgReplyDto, String>>,
    },
}

fn parse_optional_ipv4(value: Option<&str>, field_name: &str) -> Result<Option<std::net::Ipv4Addr>, String> {
    match value.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => s
            .parse::<std::net::Ipv4Addr>()
            .map(Some)
            .map_err(|e| format!("Invalid {field_name}: {e}")),
        None => Ok(None),
    }
}

/// Tauri command: sends ArtIpProg UNICAST to target device and waits for ArtIpProgReply.
///
/// For read-only query: set enable_programming=false. Returns current device config.
/// For programming: set enable_programming=true and provide new_ip, subnet_mask, etc.
/// Requires explicit user confirmation before programming (enforced in UI).
///
/// # Errors
/// Returns error if target_ip is invalid, socket fails, send fails, or no reply within 2s.
#[tauri::command]
pub async fn send_ip_prog(
    params: IpProgParams,
    _network_state: State<'_, NetworkState>,
    app_state: State<'_, AppState>,
) -> Result<IpProgReplyDto, String> {
    let target_ip: std::net::Ipv4Addr = params
        .target_ip
        .parse()
        .map_err(|e| format!("Invalid target IP: {e}"))?;

    let target = if let Some(ref t) = params.transport {
        let t = t.trim();
        t.parse::<SocketAddr>()
            .map_err(|e| format!("Invalid transport address {t:?}: {e}"))?
    } else {
        SocketAddr::from((target_ip, ART_NET_PORT))
    };

    let parsed_ip = parse_optional_ipv4(params.new_ip.as_deref(), "new_ip")?;
    let parsed_subnet = parse_optional_ipv4(params.subnet_mask.as_deref(), "subnet_mask")?;
    let parsed_gateway = parse_optional_ipv4(params.gateway.as_deref(), "gateway")?;

    let config = IpProgConfig {
        enable_programming: params.enable_programming,
        enable_dhcp: params.enable_dhcp,
        program_gateway: parsed_gateway.is_some(),
        reset: false,
        program_ip: parsed_ip.is_some(),
        program_subnet: parsed_subnet.is_some(),
        program_port: params.port.is_some(),
        ip: parsed_ip,
        subnet_mask: parsed_subnet,
        port: params.port,
        gateway: parsed_gateway,
    };

    let timeout = Duration::from_secs(2);
    let packet = build_art_ip_prog(&config).to_vec();
    let (tx, rx) = oneshot::channel::<Result<IpProgReplyDto, String>>();

    let listener_tx = app_state
        .listener_tx
        .read()
        .clone()
        .ok_or("Network listener is not ready yet. Please retry.")?;
    listener_tx
        .send(ListenerCommand::SendIpProg {
            target,
            packet,
            response: tx,
        })
        .await
        .map_err(|_| "Network listener command channel is closed".to_string())?;

    tokio::time::timeout(timeout, rx)
        .await
        .map_err(|_| "Timeout: no ArtIpProgReply received within 2 seconds".to_string())?
        .map_err(|_| "Listener dropped pending ArtIpProg request".to_string())?
}

fn sanitize_artnet_text(value: Option<&str>, max: usize) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            let mut out = String::new();
            for b in s.bytes() {
                if out.len() >= max {
                    break;
                }
                // Keep ASCII printable range expected by most Art-Net nodes and tools.
                if (0x20..=0x7E).contains(&b) {
                    out.push(char::from(b));
                }
            }
            out
        })
        .filter(|s| !s.is_empty())
}

/// Tauri command: sends ArtAddress UNICAST to target device for name updates.
///
/// This command is fire-and-observe: Art-Net has no ACK for ArtAddress writes.
/// Frontend verifies by comparing subsequent ArtPollReply data.
///
/// # Errors
/// Returns error if target/transport is invalid, no mutable fields were provided,
/// socket creation fails, or UDP send fails.
#[tauri::command]
pub async fn send_art_address(
    params: ArtAddressParams,
    _network_state: State<'_, NetworkState>,
    app_state: State<'_, AppState>,
) -> Result<(), String> {
    if params.bind_index == 0 {
        return Err("Invalid bind_index: expected 1..=255".to_string());
    }
    let target_ip: std::net::Ipv4Addr = params
        .target_ip
        .parse()
        .map_err(|e| format!("Invalid target IP: {e}"))?;
    let target = if let Some(ref t) = params.transport {
        let t = t.trim();
        t.parse::<SocketAddr>()
            .map_err(|e| format!("Invalid transport address {t:?}: {e}"))?
    } else {
        SocketAddr::from((target_ip, ART_NET_PORT))
    };

    let short_name = sanitize_artnet_text(params.port_name.as_deref(), 17).unwrap_or_default();
    let long_name = sanitize_artnet_text(params.long_name.as_deref(), 63).unwrap_or_default();

    let mut sw_in = [ART_ADDRESS_NO_CHANGE; 4];
    let mut sw_out = [ART_ADDRESS_NO_CHANGE; 4];

    if let Some(ref up) = params.set_output_universe {
        if up.slot >= 4 {
            return Err("Invalid output slot: expected 0..=3".to_string());
        }
        if up.universe > 0x7fff {
            return Err("Invalid output universe: expected 0..=32767".to_string());
        }
        let uni_nibble = (up.universe & 0x0f) as u8;
        // Spec: SwOut is ignored unless bit7 is high. We set bit7 and program only the nibble.
        // NetSwitch/SubSwitch remain no-change (bit7 low) to avoid touching global Net/SubNet.
        sw_out[up.slot as usize] = 0x80 | uni_nibble;
    }
    if let Some(ref up) = params.set_input_universe {
        if up.slot >= 4 {
            return Err("Invalid input slot: expected 0..=3".to_string());
        }
        if up.universe > 0x7fff {
            return Err("Invalid input universe: expected 0..=32767".to_string());
        }
        let uni_nibble = (up.universe & 0x0f) as u8;
        sw_in[up.slot as usize] = 0x80 | uni_nibble;
    }

    if short_name.is_empty()
        && long_name.is_empty()
        && params.set_output_universe.is_none()
        && params.set_input_universe.is_none()
    {
        return Err("No ArtAddress update requested".to_string());
    }

    let packet = build_art_address(
        ART_ADDRESS_NO_CHANGE,
        params.bind_index,
        &short_name,
        &long_name,
        sw_in,
        sw_out,
        ART_ADDRESS_NO_CHANGE,
        ArtAddressCommand::AcNone,
    );

    let (tx, rx) = oneshot::channel::<Result<(), String>>();
    let listener_tx = app_state
        .listener_tx
        .read()
        .clone()
        .ok_or("Network listener is not ready yet. Please retry.")?;
    listener_tx
        .send(ListenerCommand::SendArtAddress {
            target,
            packet: packet.to_vec(),
            response: tx,
        })
        .await
        .map_err(|_| "Network listener command channel is closed".to_string())?;
    tokio::time::timeout(Duration::from_secs(2), rx)
        .await
        .map_err(|_| "Timeout sending ArtAddress via listener".to_string())?
        .map_err(|_| "Listener dropped pending ArtAddress request".to_string())??;
    Ok(())
}

/// Tauri command: sends ArtDataRequest UNICAST to target device and waits for ArtDataReply.
///
/// Fetches product URLs, user guides, support links, etc. from Art-Net 4 devices.
/// Request types: 0x0001 = Product URL, 0x0002 = User Guide, 0x0003 = Support.
///
/// # Errors
/// Returns error if target_ip is invalid, socket fails, send fails, or no reply within 2s.
#[tauri::command]
pub async fn request_device_url(
    target_ip: String,
    esta_man: u16,
    oem: u16,
    request_type: u16,
) -> Result<String, String> {
    let target: SocketAddr = target_ip
        .parse()
        .map_err(|e| format!("Invalid target IP: {e}"))?;

    let target_addr = match target {
        SocketAddr::V4(v4) => SocketAddr::from((*v4.ip(), ART_NET_PORT)),
        SocketAddr::V6(_) => return Err("IPv6 not supported for ArtDataRequest".to_string()),
    };

    let packet = build_art_data_request(esta_man, oem, request_type);

    let socket = ArtNetSocket::bind(SocketAddr::from(([0, 0, 0, 0], 0)))
        .await
        .map_err(|e| format!("Failed to create socket: {e}"))?;

    socket
        .send_to(&packet, target_addr)
        .await
        .map_err(|e| format!("Failed to send ArtDataRequest: {e}"))?;

    let mut recv_buf = [0u8; 512];
    let timeout = Duration::from_secs(2);

    let (len, _from) = tokio::time::timeout(
        timeout,
        socket.inner().recv_from(&mut recv_buf),
    )
    .await
    .map_err(|_| "Timeout: no ArtDataReply received within 2 seconds")?
    .map_err(|e| format!("Recv error: {e}"))?;

    let payload = &recv_buf[..len];
    match ArtNetParser::parse(payload) {
        Ok(lumenflow_core::ArtNetPacket::DataReply { data, .. }) => {
            let url = String::from_utf8(data.to_vec())
                .map_err(|e| format!("URL payload is not valid UTF-8: {e}"))?;
            Ok(url.trim_end_matches('\0').to_string())
        }
        Ok(other) => Err(format!(
            "Unexpected packet type (expected DataReply): {other:?}"
        )),
        Err(e) => Err(format!("Failed to parse reply: {e}")),
    }
}

const DEVICE_ONLINE_THRESHOLD_SECS: u64 = 3;

/// Tauri command: returns all discovered Art-Net devices (flat per-bind view).
#[tauri::command]
pub fn get_devices(state: tauri::State<'_, AppState>) -> Vec<DeviceInfoDto> {
    let cutoff = Instant::now() - Duration::from_secs(DEVICE_ONLINE_THRESHOLD_SECS);
    state
        .device_registry
        .list_devices()
        .into_iter()
        .map(|d| map_device_to_dto(d, cutoff))
        .collect()
}

/// Tauri command: returns merged Art-Net products (one row per physical node).
#[tauri::command]
pub fn get_artnet_products(state: tauri::State<'_, AppState>) -> Vec<ArtNetProductDto> {
    let cutoff = Instant::now() - Duration::from_secs(DEVICE_ONLINE_THRESHOLD_SECS);
    state
        .device_registry
        .aggregate_products()
        .into_iter()
        .map(|p| map_artnet_product_to_dto(p, cutoff))
        .collect()
}

/// Spawns the 60Hz emit loop that sends binary DMX frames and universe
/// metrics to the frontend.
///
/// Emits:
/// - `dmx-frame`: `[u16 LE universe_id, u16 LE length, N bytes data]` repeated
/// - `universe-metrics`: `[u8 sync_active][u32 LE sync_source_ip]` then per universe
///   `[u16 LE id, u8 staleness, u8 source_count, u32 LE seq_errors, u8 has_nzs]`
/// - `route-info`: at 10 Hz, `[u16 LE id, u32 LE src_a_ip, u32 LE src_b_ip, u32 LE pkt_per_sec, u64 LE last_nanos]` per active universe
pub fn start_emit_loop(app_handle: tauri::AppHandle, state: &AppState) {
    let universe_store = state.universe_store.clone();
    let active_ids = state.active_ids.clone();
    let device_registry = state.device_registry.clone();
    let device_version = state.device_version.clone();
    let sync_detector = state.sync_detector.clone();
    let jitter_collector = state.jitter_collector.clone();

    tauri::async_runtime::spawn(async move {
        let mut interval = time::interval(Duration::from_micros(16_667)); // ~60 Hz
        interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

        let mut snapshot_buf = [0u8; 512];
        let silence_buf = [0u8; 512];
        let mut route_tick = 0u32;
        let mut last_emitted_device_version = 0u64;

        loop {
            interval.tick().await;
            let count = active_ids.len();
            if count > 0 {
                let now_nanos = epoch_nanos();
                let mut dmx_payload = Vec::with_capacity(count * 516);
                let mut metrics_payload = Vec::with_capacity(5 + count * 9);

                let sync_active = if sync_detector.is_active(now_nanos) {
                    1u8
                } else {
                    0u8
                };
                let sync_source_ip = sync_detector
                    .source_ip()
                    .filter(|_| sync_active != 0)
                    .unwrap_or(0);
                metrics_payload.push(sync_active);
                metrics_payload.extend_from_slice(&sync_source_ip.to_le_bytes());

                for id_ref in active_ids.iter() {
                    let id = *id_ref;
                    if let Some((staleness, source_count, seq_errors, has_nzs)) =
                        universe_store.slot_metrics(id)
                    {
                        let dmx_data: &[u8; 512] = if staleness == Staleness::Active
                            && universe_store.snapshot(id, &mut snapshot_buf)
                        {
                            &snapshot_buf
                        } else {
                            &silence_buf
                        };
                        dmx_payload.extend_from_slice(&id.to_le_bytes());
                        dmx_payload.extend_from_slice(&512u16.to_le_bytes());
                        dmx_payload.extend_from_slice(dmx_data);
                        let staleness_byte = match staleness {
                            Staleness::Active => 0,
                            Staleness::Stale => 1,
                            Staleness::Disconnected => 2,
                        };
                        metrics_payload.extend_from_slice(&id.to_le_bytes());
                        metrics_payload.push(staleness_byte);
                        metrics_payload.push(source_count);
                        metrics_payload.extend_from_slice(&(seq_errors as u32).to_le_bytes());
                        metrics_payload.push(if has_nzs { 1 } else { 0 });
                    }
                }

                if !dmx_payload.is_empty() {
                    let _ = app_handle.emit("dmx-frame", &dmx_payload);
                }
                if metrics_payload.len() > 5 {
                    let _ = app_handle.emit("universe-metrics", &metrics_payload);
                }
            }

            // Emit route-info and jitter-samples at ~10 Hz (every 6th tick)
            route_tick = route_tick.wrapping_add(1);
            if route_tick % 6 == 0 {
                let mut route_payload = Vec::with_capacity(count * 22);
                for id_ref in active_ids.iter() {
                    let id = *id_ref;
                    if let Some((src_a, src_b, pkt_per_sec, last_nanos)) =
                        universe_store.slot_route_info(id)
                    {
                        route_payload.extend_from_slice(&id.to_le_bytes());
                        route_payload.extend_from_slice(&src_a.to_le_bytes());
                        route_payload.extend_from_slice(&src_b.to_le_bytes());
                        route_payload.extend_from_slice(&pkt_per_sec.to_le_bytes());
                        route_payload.extend_from_slice(&last_nanos.to_le_bytes());
                    }
                }
                // Always emit route-info (including empty) so frontend can clear when no traffic (B4).
                let _ = app_handle.emit("route-info", &route_payload);

                let jitter_ns = jitter_collector.snapshot();
                let jitter_ms: Vec<f64> = jitter_ns
                    .into_iter()
                    .map(|ns| ns as f64 / 1_000_000.0)
                    .collect();
                if !jitter_ms.is_empty() {
                    let _ = app_handle.emit("jitter-samples", &jitter_ms);
                }

                // D5: push device updates when registry changed.
                let current_version = device_version.load(Ordering::Relaxed);
                if current_version != last_emitted_device_version {
                    let cutoff = Instant::now() - Duration::from_secs(DEVICE_ONLINE_THRESHOLD_SECS);
                    let products = device_registry
                        .aggregate_products()
                        .into_iter()
                        .map(|p| map_artnet_product_to_dto(p, cutoff))
                        .collect();
                    let payload = DevicesUpdatedDto {
                        version: current_version,
                        timestamp_nanos: epoch_nanos(),
                        products,
                    };
                    let _ = app_handle.emit("devices-updated", payload);
                    last_emitted_device_version = current_version;
                }
            }
        }
    });
}

/// Starts the DiscoveryEngine: ArtPoll broadcast and self-reply.
///
/// Must be called from a context where a Tokio runtime is running (e.g. from within
/// `tauri::async_runtime::spawn`). Spawns the discovery task on the current runtime.
///
/// Pass `our_ip` to include LumenFlow in its own device list (spec requirement).
/// Use `None` if the local IP cannot be determined.
#[allow(dead_code)] // Kept for tests / fallback; replaced by start_network_listeners
pub fn start_discovery(state: &AppState, our_ip: Option<std::net::Ipv4Addr>) {
    let device_registry = state.device_registry.clone();
    let our_mac = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]; // Placeholder; could read from interface
    let unicast_targets = parse_discovery_targets_from_env();
    tauri::async_runtime::spawn(async move {
        spawn_discovery(device_registry, our_ip, our_mac, unicast_targets);
    });
}

const DISCOVERY_POLL_INTERVAL_MS: u64 = 2500;

/// Runs the UDP listener loop with optional cancellation.
///
/// Per Art-Net 4, controllers must send and receive on port 6454. Discovery
/// broadcast is integrated here (not a separate socket) so ArtPoll is sent from
/// port 6454; nodes reply to that port and we receive their ArtPollReply.
async fn run_udp_listener(
    app_handle: tauri::AppHandle,
    state: &AppState,
    bind_addr: std::net::SocketAddr,
    our_ip: Option<std::net::Ipv4Addr>,
    discovery_config: DiscoveryConfig,
    mut command_rx: mpsc::Receiver<ListenerCommand>,
    cancel: CancellationToken,
) {
    let universe_store = state.universe_store.clone();
    let device_registry = state.device_registry.clone();
    let device_version = state.device_version.clone();
    let controllers_seen = state.controllers_seen.clone();
    let sync_detector = state.sync_detector.clone();
    let diag_buffer = state.diag_buffer.clone();
    let jitter_collector = state.jitter_collector.clone();

    let broadcast_targets = discovery_config.broadcast_targets(ART_NET_PORT);
    let unicast_targets = discovery_config.unicast_targets.clone();
    let poll_packet = build_art_poll();
    let mut last_unicast_poll_at: HashMap<std::net::Ipv4Addr, Instant> = HashMap::new();

    let mut socket = match lumenflow_core::ArtNetSocket::bind(bind_addr).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("Failed to bind Art-Net socket to {bind_addr}: {e}");
            return;
        }
    };

    let mut poll_interval = time::interval(Duration::from_millis(DISCOVERY_POLL_INTERVAL_MS));
    poll_interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);
    let mut pending_ip_prog: HashMap<std::net::IpAddr, oneshot::Sender<Result<IpProgReplyDto, String>>> =
        HashMap::new();

    tracing::info!(
        addr = %bind_addr,
        our_ip = ?our_ip,
        broadcast_targets = broadcast_targets.len(),
        unicast_targets = unicast_targets.len(),
        "Art-Net UDP listener started (discovery from port 6454)"
    );

    // Add ourselves to the device registry. Sending ArtPollReply to our own IP
    // causes "Broken pipe" on macOS, so we register directly instead.
    if let Some(ip) = our_ip {
        let self_device = DeviceInfo {
            mac_address: [0u8; 6],
            ip_address: ip,
            bind_ip: ip,
            bind_index: 1,
            port: ART_NET_PORT,
            short_name: "LumenFlow".to_string(),
            long_name: "LumenFlow Art-Net Monitor".to_string(),
            node_report: "LumenFlow controller".to_string(),
            firmware_version: 0x0001,
            ubea_version: 0,
            esta_man: 0,
            oem_code: 0,
            net_switch: 0,
            sub_switch: 0,
            num_ports: 0,
            port_types: [0; 4],
            good_input: [0; 4],
            good_output: [0; 4],
            good_output_b: [0; 4],
            sw_in: [0; 4],
            sw_out: [0; 4],
            status1: 0,
            status2: 0x08,
            status3: 0,
            acn_priority: 100,
            sw_macro: 0,
            sw_remote: 0,
            style: 0,
            def_resp: [0; 6],
            user: [0; 2],
            refresh_rate: 44,
            port_addresses: Vec::new(),
            input_port_addresses: Vec::new(),
            last_seen: std::time::Instant::now(),
            last_reply_source: None,
        };
        device_registry.upsert(self_device);
        device_version.fetch_add(1, Ordering::Relaxed);
    }

    let mut poll_reply_bundle_state: HashMap<String, Instant> = HashMap::new();
    let mut poll_reply_packet_counter: u64 = 0;
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                for (_, tx) in pending_ip_prog.drain() {
                    let _ = tx.send(Err("Listener cancelled before ArtIpProgReply".to_string()));
                }
                tracing::info!("UDP listener cancelled");
                return;
            }
            Some(cmd) = command_rx.recv() => {
                match cmd {
                    ListenerCommand::SendArtAddress { target, packet, response } => {
                        tracing::info!(%target, "Listener send ArtAddress");
                        let r = socket
                            .send_to(&packet, target)
                            .await
                            .map_err(|e| format!("Failed to send ArtAddress: {e}"));
                        let _ = response.send(r);
                    }
                    ListenerCommand::SendIpProg { target, packet, response } => {
                        tracing::info!(%target, "Listener send ArtIpProg");
                        match socket.send_to(&packet, target).await {
                            Ok(()) => {
                                if let Some(old) = pending_ip_prog.insert(target.ip(), response) {
                                    let _ = old.send(Err("Superseded by newer ArtIpProg request".to_string()));
                                }
                            }
                            Err(e) => {
                                let _ = response.send(Err(format!("Failed to send ArtIpProg: {e}")));
                            }
                        }
                    }
                }
            }
            result = socket.recv() => {
                let (data, addr) = match result {
                    Ok(r) => r,
                    Err(e) => {
                        tracing::warn!("UDP recv error: {e}");
                        continue;
                    }
                };

                let len = data.len();
                let is_discovery_sized = len == 18 || (207..=239).contains(&len);
                if is_discovery_sized {
                    tracing::info!(from = %addr, len, "Received UDP packet (discovery-sized)");
                } else {
                    tracing::debug!(from = %addr, len, "Received UDP packet");
                }

                match lumenflow_core::ArtNetParser::parse(data) {
                    Ok(lumenflow_core::ArtNetPacket::Dmx { header, dmx_data }) => {
                        let source_ip = match addr {
                            std::net::SocketAddr::V4(v4) => {
                                u32::from_be_bytes(v4.ip().octets())
                            }
                            std::net::SocketAddr::V6(_) => 0,
                        };
                        universe_store.update(
                            header.port_address(),
                            dmx_data,
                            header.sequence,
                            source_ip,
                            header.physical,
                            false,
                        );
                        jitter_collector.record(epoch_nanos());
                    }
                    Ok(lumenflow_core::ArtNetPacket::Poll(poll)) => {
                        let sender_ip = match addr {
                            std::net::SocketAddr::V4(v4) => *v4.ip(),
                            std::net::SocketAddr::V6(_) => {
                                tracing::trace!(from = %addr, "Ignoring ArtPoll from IPv6");
                                continue;
                            }
                        };
                        let top = u16::from_be_bytes(poll.target_port_top);
                        let bottom = u16::from_be_bytes(poll.target_port_bottom);
                        let esta_man = u16::from_be_bytes(poll.esta_man);
                        let oem = u16::from_be_bytes(poll.oem);
                        controllers_seen.insert(
                            sender_ip,
                            ControllerSeen {
                                last_seen_at: Instant::now(),
                                talk_to_me: poll.flags,
                                diag_priority: poll.diag_priority,
                                target_port_bottom: bottom,
                                target_port_top: top,
                                esta_man,
                                oem,
                            },
                        );
                        let is_self = our_ip.map(|ip| sender_ip == ip).unwrap_or(false);
                        if is_self {
                            tracing::trace!(from = %addr, "Ignoring ArtPoll from self");
                        } else {
                            tracing::info!(from = %addr, "Received ArtPoll from external controller");
                            // Some nodes/controllers will poll us (so they see us), but will never reply to our
                            // broadcast discovery if subnet broadcast targets are disabled/missing. Solicit a
                            // PollReply directly via a unicast ArtPoll to the sender. Rate-limited per IP.
                            let now = Instant::now();
                            let should_unicast_poll = match last_unicast_poll_at.get(&sender_ip) {
                                Some(last) => now.duration_since(*last) > Duration::from_secs(3),
                                None => true,
                            };
                            if should_unicast_poll {
                                last_unicast_poll_at.insert(sender_ip, now);
                                let unicast_target = SocketAddr::from((sender_ip, ART_NET_PORT));
                                if let Err(e) = socket.send_to(&poll_packet, unicast_target).await {
                                    tracing::debug!(to = %unicast_target, "Unicast ArtPoll send failed: {e}");
                                } else {
                                    tracing::debug!(to = %unicast_target, "Sent unicast ArtPoll to solicit PollReply");
                                }
                            }
                            // Use configured our_ip, or derive from sender's subnet (sender-subnet fallback).
                            let ip_to_use = our_ip.or_else(|| {
                                let cidr = derive_cidr_24_from_ip(sender_ip);
                                resolve_interface_for_cidr(&cidr)
                                    .ok()
                                    .flatten()
                                    .map(|i| i.ip)
                            });
                            if let Some(ip) = ip_to_use {
                                let reply = build_our_poll_reply(ip, [0u8; 6]);
                                if let Err(e) = socket.send_to(&reply, addr).await {
                                    tracing::warn!(%addr, "ArtPollReply send failed: {e}");
                                } else {
                                    tracing::debug!(to = %addr, "Sent ArtPollReply");
                                }
                            } else {
                                tracing::warn!(
                                    from = %addr,
                                    "Received ArtPoll but could not derive our_ip (no NIC on sender subnet). Select a NIC or enable subnet."
                                );
                            }
                        }
                    }
                    Ok(lumenflow_core::ArtNetPacket::PollReply(reply)) => {
                        let device_ip = reply.ip();
                        // Only treat as controller self-reply when IP matches *and* short name is ours.
                        // Docker nodes may advertise a lab IP (e.g. 10.0.0.20) that matches a host NIC by coincidence.
                        let is_self = our_ip == Some(device_ip)
                            && reply
                                .short_name_str()
                                .trim()
                                .eq_ignore_ascii_case("LumenFlow");
                        if is_self {
                            tracing::trace!(ip = %device_ip, "Ignoring ArtPollReply from self");
                        } else {
                            let bind_ip = std::net::Ipv4Addr::new(
                                reply.bind_ip[0],
                                reply.bind_ip[1],
                                reply.bind_ip[2],
                                reply.bind_ip[3],
                            );
                            let product_id = artnet_product_id(bind_ip, &reply.mac);
                            let now = std::time::Instant::now();
                            let emit_activity = should_emit_poll_reply_bundle(
                                now,
                                &product_id,
                                &mut poll_reply_bundle_state,
                            );
                            poll_reply_packet_counter = poll_reply_packet_counter.wrapping_add(1);
                            if poll_reply_packet_counter % 128 == 0 {
                                prune_bundle_state(now, &mut poll_reply_bundle_state);
                            }
                            let device = DeviceInfo {
                                mac_address: reply.mac,
                                ip_address: device_ip,
                                bind_ip,
                                bind_index: reply.bind_index,
                                port: u16::from_le_bytes(reply.port),
                                short_name: reply.short_name_str().to_string(),
                                long_name: reply.long_name_str().to_string(),
                                node_report: String::from_utf8_lossy(&reply.node_report)
                                    .trim_end_matches('\0')
                                    .to_string(),
                                firmware_version: reply.firmware_version(),
                                ubea_version: reply.ubea_version,
                                esta_man: reply.esta_man(),
                                oem_code: reply.oem_code(),
                                net_switch: reply.net_switch,
                                sub_switch: reply.sub_switch,
                                num_ports: reply.num_ports(),
                                port_types: reply.port_types,
                                good_input: reply.good_input,
                                good_output: reply.good_output,
                                good_output_b: reply.good_output_b,
                                sw_in: reply.sw_in,
                                sw_out: reply.sw_out,
                                status1: reply.status1,
                                status2: reply.status2,
                                status3: reply.status3,
                                acn_priority: reply.acn_priority,
                                sw_macro: reply.sw_macro,
                                sw_remote: reply.sw_remote,
                                style: reply.style,
                                def_resp: reply.def_resp,
                                user: reply.user,
                                refresh_rate: u16::from_be_bytes(reply.refresh_rate),
                                port_addresses: reply.output_port_addresses(),
                                input_port_addresses: reply.input_port_addresses(),
                                last_seen: std::time::Instant::now(),
                                last_reply_source: Some(addr),
                            };
                            tracing::info!(
                                ip = %device.ip_address,
                                name = %device.short_name,
                                "Discovered Art-Net device"
                            );
                            device_registry.upsert(device);
                            device_version.fetch_add(1, Ordering::Relaxed);
                            if emit_activity {
                                note_emitted_poll_reply_bundle(
                                    now,
                                    &product_id,
                                    &mut poll_reply_bundle_state,
                                );
                                let payload = DevicePollReplyActivityDto {
                                    product_id,
                                    ip_address: device_ip.to_string(),
                                    bind_ip: bind_ip.to_string(),
                                    bind_index: reply.bind_index,
                                    short_name: reply.short_name_str().to_string(),
                                    received_at_nanos: epoch_nanos(),
                                    bundle_window_ms: POLL_REPLY_BUNDLE_WINDOW_MS,
                                };
                                let _ = app_handle.emit("device-poll-reply-activity", payload);
                            }
                        }
                    }
                    Ok(lumenflow_core::ArtNetPacket::IpProgReply(reply)) => {
                        if let Some(tx) = pending_ip_prog.remove(&addr.ip()) {
                            let _ = tx.send(Ok(IpProgReplyDto {
                                ip: reply.ip().to_string(),
                                subnet_mask: reply.subnet_mask().to_string(),
                                gateway: reply.gateway().to_string(),
                                port: reply.port(),
                                dhcp_enabled: reply.dhcp_enabled(),
                            }));
                        } else {
                            tracing::debug!(from = %addr, "Received ArtIpProgReply without pending request");
                        }
                    }
                    Ok(lumenflow_core::ArtNetPacket::Sync(_)) => {
                        let source_ip = match addr {
                            std::net::SocketAddr::V4(v4) => {
                                u32::from_be_bytes(v4.ip().octets())
                            }
                            std::net::SocketAddr::V6(_) => 0,
                        };
                        if source_ip != 0 {
                            sync_detector.on_sync(source_ip, epoch_nanos());
                        }
                        tracing::debug!(from = %addr, "Received ArtSync");
                    }
                    Ok(lumenflow_core::ArtNetPacket::Address(address)) => {
                        tracing::debug!(
                            from = %addr,
                            net_switch = address.net_switch,
                            sub_switch = address.sub_switch,
                            command = address.command,
                            "Received ArtAddress"
                        );
                    }
                    Ok(lumenflow_core::ArtNetPacket::Input(_)) => {
                        tracing::debug!(from = %addr, "Received ArtInput");
                    }
                    Ok(lumenflow_core::ArtNetPacket::DiagData(pkt, data)) => {
                        let priority = DiagPriority::from_u8(pkt.priority);
                        let source_ip = match addr {
                            std::net::SocketAddr::V4(v4) => Some(v4.ip().to_string()),
                            std::net::SocketAddr::V6(_) => None,
                        };
                        diag_buffer.push(priority, data, source_ip.as_deref());
                        let payload = serde_json::json!({
                            "priority": pkt.priority,
                            "message": String::from_utf8_lossy(data),
                            "sourceIp": source_ip,
                            "timestampNanos": epoch_nanos(),
                        });
                        let _ = app_handle.emit("diag-entry", payload);
                        tracing::debug!(from = %addr, "Received ArtDiagData");
                    }
                    Ok(lumenflow_core::ArtNetPacket::TimeCode(pkt)) => {
                        let payload = serde_json::json!({
                            "hours": pkt.hours,
                            "minutes": pkt.minutes,
                            "seconds": pkt.seconds,
                            "frames": pkt.frames,
                            "timecodeType": pkt.timecode_type,
                        });
                        let _ = app_handle.emit("timecode", payload);
                        tracing::debug!(from = %addr, "Received ArtTimeCode");
                    }
                    Ok(lumenflow_core::ArtNetPacket::Nzs { header, dmx_data }) => {
                        let source_ip = match addr {
                            std::net::SocketAddr::V4(v4) => {
                                u32::from_be_bytes(v4.ip().octets())
                            }
                            std::net::SocketAddr::V6(_) => 0,
                        };
                        let mark_nzs = header.start_code != 0;
                        universe_store.update(
                            header.port_address(),
                            dmx_data,
                            header.sequence,
                            source_ip,
                            header.start_code,
                            mark_nzs,
                        );
                        jitter_collector.record(epoch_nanos());
                    }
                    Ok(lumenflow_core::ArtNetPacket::TimeSync(_)) => {
                        let payload = serde_json::json!({
                            "timestampNanos": epoch_nanos(),
                        });
                        let _ = app_handle.emit("time-sync", payload);
                        tracing::debug!(from = %addr, "Received ArtTimeSync");
                    }
                    Ok(lumenflow_core::ArtNetPacket::Command { .. })
                    | Ok(lumenflow_core::ArtNetPacket::Trigger(_))
                    | Ok(lumenflow_core::ArtNetPacket::IpProg(_))
                    | Ok(lumenflow_core::ArtNetPacket::DataRequest(_))
                    | Ok(lumenflow_core::ArtNetPacket::DataReply { .. }) => {
                        tracing::trace!(from = %addr, "Received unimplemented packet type");
                    }
                    Err(e) => {
                        let len = data.len();
                        let looks_like_poll_reply = len >= 10
                            && len <= 239
                            && data.starts_with(lumenflow_core::artnet::ART_NET_HEADER)
                            && data.get(8..10).map(|s| u16::from_le_bytes([s[0], s[1]])) == Some(0x2100);
                        if looks_like_poll_reply {
                            tracing::warn!(
                                from = %addr,
                                len,
                                error = %e,
                                "Ignoring packet (looks like ArtPollReply): parse failed — check wire format"
                            );
                        } else {
                            tracing::warn!(from = %addr, "Ignoring packet: {e}");
                        }
                    }
                }
            }
            _ = poll_interval.tick() => {
                if !broadcast_targets.is_empty() {
                    if let Err(e) = socket.send_to_targets(&poll_packet, &broadcast_targets).await {
                        tracing::warn!("Discovery: ArtPoll broadcast failed: {e}");
                    } else {
                        tracing::debug!("Discovery: sent ArtPoll to broadcast targets");
                    }
                }
                for addr in &unicast_targets {
                    if let Err(e) = socket.send_to(&poll_packet, *addr).await {
                        tracing::warn!("Discovery: ArtPoll unicast to {addr} failed: {e}");
                    }
                }
                // Per Art-Net 4, controllers identify themselves. Sending UDP to our own
                // IP causes "Broken pipe" on macOS, so we add ourselves at startup instead.
            }
        }
    }
}

#[cfg(test)]
mod unicast_poll_tests {
    use super::*;

    #[test]
    fn unicast_poll_rate_limit_is_three_seconds() {
        let ip = std::net::Ipv4Addr::new(192, 168, 0, 103);
        let mut map: HashMap<std::net::Ipv4Addr, Instant> = HashMap::new();
        let t0 = Instant::now();
        map.insert(ip, t0);
        let t1 = t0 + Duration::from_secs(2);
        let should_send_early = match map.get(&ip) {
            Some(last) => t1.duration_since(*last) > Duration::from_secs(3),
            None => true,
        };
        assert!(!should_send_early);

        let t2 = t0 + Duration::from_secs(4);
        let should_send_late = match map.get(&ip) {
            Some(last) => t2.duration_since(*last) > Duration::from_secs(3),
            None => true,
        };
        assert!(should_send_late);
    }
}

/// Spawns the UDP listener loop that receives Art-Net packets and writes
/// them into the shared `UniverseStore` and `DeviceRegistry`.
#[allow(dead_code)] // Replaced by start_network_listeners; kept for tests
pub fn start_udp_listener(app_handle: tauri::AppHandle, state: &AppState) {
    let bind_addr = std::net::SocketAddr::from(([0, 0, 0, 0], lumenflow_core::artnet::ART_NET_PORT));
    let cancel = CancellationToken::new();
    let state_clone = state.clone();
    let (_tx, rx) = mpsc::channel(8);
    tauri::async_runtime::spawn(async move {
        run_udp_listener(
            app_handle,
            &state_clone,
            bind_addr,
            None,
            DiscoveryConfig::default(),
            rx,
            cancel,
        )
        .await;
    });
}

/// Starts the network listeners (UDP + discovery) with configurable NIC and targets.
/// Watches for config changes and restarts listeners when settings change.
pub fn start_network_listeners(
    app_handle: tauri::AppHandle,
    state: AppState,
    mut config_rx: tokio::sync::watch::Receiver<crate::network_commands::NetworkSettingsDto>,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            let settings = config_rx.borrow().clone();
            let network_config = crate::network_commands::derive_network_config(&settings);

            let cancel = CancellationToken::new();
            let cancel_for_listener = cancel.clone();
            let bind_target = network_config
                .bind_targets
                .first()
                .cloned()
                .unwrap_or_else(|| crate::network_commands::BindTarget {
                    bind_addr: std::net::SocketAddr::from(([0, 0, 0, 0], lumenflow_core::artnet::ART_NET_PORT)),
                    our_ip: None,
                    subnet_broadcast: None,
                });

            let app_handle_clone = app_handle.clone();
            let state_clone = state.clone();
            let discovery_config = network_config.discovery_config.clone();
            let (listener_tx, listener_rx) = mpsc::channel::<ListenerCommand>(32);
            {
                let mut tx_slot = state.listener_tx.write();
                *tx_slot = Some(listener_tx);
            }
            let listener_handle = tauri::async_runtime::spawn(async move {
                run_udp_listener(
                    app_handle_clone,
                    &state_clone,
                    bind_target.bind_addr,
                    bind_target.our_ip,
                    discovery_config,
                    listener_rx,
                    cancel_for_listener,
                )
                .await;
            });

            if config_rx.changed().await.is_err() {
                let mut tx_slot = state.listener_tx.write();
                *tx_slot = None;
                break;
            }
            cancel.cancel();
            let _ = listener_handle.await;
            {
                let mut tx_slot = state.listener_tx.write();
                *tx_slot = None;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use lumenflow_core::device::ProductPort;
    use std::net::Ipv4Addr;

    fn sample_device() -> DeviceInfo {
        DeviceInfo {
            mac_address: [0x00, 0x11, 0x22, 0x33, 0x44, 0x55],
            ip_address: Ipv4Addr::new(10, 0, 0, 10),
            bind_ip: Ipv4Addr::new(10, 0, 0, 10),
            bind_index: 1,
            port: ART_NET_PORT,
            short_name: "Node".to_string(),
            long_name: "Test Art-Net Node".to_string(),
            node_report: "OK".to_string(),
            firmware_version: 0x0102,
            ubea_version: 0,
            esta_man: 0x7A70,
            oem_code: 0x1234,
            net_switch: 0,
            sub_switch: 0,
            num_ports: 2,
            port_types: [0x80, 0x80, 0x00, 0x00],
            good_input: [0x00, 0x00, 0x00, 0x00],
            good_output: [0x80, 0x80, 0x00, 0x00],
            good_output_b: [0x00, 0x00, 0x00, 0x00],
            sw_in: [0x01, 0x00, 0x00, 0x00],
            sw_out: [0x01, 0x02, 0x00, 0x00],
            status1: 0x01,
            status2: 0x08,
            status3: 0x00,
            acn_priority: 100,
            sw_macro: 0,
            sw_remote: 0,
            style: 0,
            def_resp: [0xAA; 6],
            user: [0xBB; 2],
            refresh_rate: 44,
            port_addresses: vec![0x0001, 0x0002],
            input_port_addresses: vec![0x0001],
            last_seen: Instant::now(),
            last_reply_source: None,
        }
    }

    #[test]
    fn maps_device_info_to_frontend_dto() {
        let cutoff = Instant::now() - Duration::from_secs(3);
        let dto = map_device_to_dto(sample_device(), cutoff);
        assert_eq!(dto.ip_address, "10.0.0.10");
        assert_eq!(dto.bind_index, 1);
        assert_eq!(dto.status2, 0x08);
        assert_eq!(dto.port_addresses.len(), 2);
        assert!(dto.online);
        assert!(!dto.def_resp.is_empty());
    }

    #[test]
    fn maps_artnet_product_to_frontend_dto() {
        let cutoff = Instant::now() - Duration::from_secs(3);
        let p = ArtNetProduct {
            bind_ip: Ipv4Addr::new(10, 0, 0, 10),
            ip_address: Ipv4Addr::new(10, 0, 0, 10),
            last_reply_source: None,
            mac_address: [0x00, 0x11, 0x22, 0x33, 0x44, 0x55],
            short_name: "Root".to_string(),
            long_name: "Long Node".to_string(),
            esta_man: 0x7a70,
            oem_code: 0x1234,
            firmware_version: 0x0100,
            node_report: "OK".to_string(),
            ports: vec![ProductPort {
                bind_index: 1,
                slot: 0,
                output_universe: 0x0005,
                input_universe: None,
                label: "Port 1".to_string(),
            }],
            last_seen: Instant::now(),
        };
        let dto = map_artnet_product_to_dto(p, cutoff);
        assert_eq!(dto.ports.len(), 1);
        assert_eq!(dto.ports[0].output_universe, 0x0005);
        assert!(dto.online);
        assert!(dto.product_id.contains("10.0.0.10"));
        assert!(dto.product_id.contains("001122334455"));
        assert_eq!(dto.transport_addr, None);
    }

    #[test]
    fn maps_transport_addr_from_last_reply_source() {
        use std::net::SocketAddr;
        let cutoff = Instant::now() - Duration::from_secs(3);
        let p = ArtNetProduct {
            bind_ip: Ipv4Addr::new(10, 0, 0, 10),
            ip_address: Ipv4Addr::new(10, 0, 0, 10),
            last_reply_source: Some(SocketAddr::from(([127, 0, 0, 1], 6457))),
            mac_address: [0x00; 6],
            short_name: "N".into(),
            long_name: "L".into(),
            esta_man: 0,
            oem_code: 0,
            firmware_version: 0,
            node_report: "".into(),
            ports: vec![],
            last_seen: Instant::now(),
        };
        let dto = map_artnet_product_to_dto(p, cutoff);
        assert_eq!(dto.transport_addr.as_deref(), Some("127.0.0.1:6457"));
    }

    #[test]
    fn parse_optional_ipv4_empty_is_none() {
        assert_eq!(
            parse_optional_ipv4(Some("   "), "new_ip")
                .expect("whitespace should be treated as empty"),
            None
        );
    }

    #[test]
    fn parse_optional_ipv4_valid_is_some() {
        assert_eq!(
            parse_optional_ipv4(Some(" 192.168.1.10 "), "new_ip")
                .expect("valid IPv4 should parse"),
            Some(std::net::Ipv4Addr::new(192, 168, 1, 10))
        );
    }

    #[test]
    fn parse_optional_ipv4_invalid_is_error() {
        let err =
            parse_optional_ipv4(Some("999.1.1.1"), "new_ip").expect_err("invalid IPv4 should error");
        assert!(err.contains("Invalid new_ip"));
    }

    #[test]
    fn poll_reply_bundle_dedup_emits_once_within_window() {
        let mut state: HashMap<String, Instant> = HashMap::new();
        let key = "10.0.0.10|001122334455";
        let t0 = Instant::now();
        assert!(should_emit_poll_reply_bundle(t0, key, &mut state));
        note_emitted_poll_reply_bundle(t0, key, &mut state);
        let t1 = t0 + Duration::from_millis(POLL_REPLY_BUNDLE_WINDOW_MS / 2);
        assert!(!should_emit_poll_reply_bundle(t1, key, &mut state));
        let t2 = t0 + Duration::from_millis(POLL_REPLY_BUNDLE_WINDOW_MS + 5);
        assert!(should_emit_poll_reply_bundle(t2, key, &mut state));
    }

    #[tokio::test]
    async fn listener_command_channel_delivers_ip_prog_result() {
        let (tx, mut rx) = mpsc::channel::<ListenerCommand>(4);
        let (resp_tx, resp_rx) = oneshot::channel();
        let target = SocketAddr::from(([192, 168, 0, 103], ART_NET_PORT));
        let dto = IpProgReplyDto {
            ip: "192.168.0.103".to_string(),
            subnet_mask: "255.255.255.0".to_string(),
            gateway: "192.168.0.1".to_string(),
            port: 6454,
            dhcp_enabled: false,
        };

        let expected_ip = dto.ip.clone();
        tx.send(ListenerCommand::SendIpProg {
            target,
            packet: vec![1, 2, 3],
            response: resp_tx,
        })
        .await
        .expect("send command");

        if let Some(ListenerCommand::SendIpProg {
            target: got_target,
            packet,
            response,
        }) = rx.recv().await
        {
            assert_eq!(got_target, target);
            assert_eq!(packet, vec![1, 2, 3]);
            let _ = response.send(Ok(dto));
        } else {
            panic!("expected SendIpProg command");
        }

        let result = resp_rx.await.expect("oneshot receive").expect("ip prog result");
        assert_eq!(result.ip, expected_ip);
    }

    #[tokio::test]
    async fn listener_command_channel_delivers_art_address_result() {
        let (tx, mut rx) = mpsc::channel::<ListenerCommand>(4);
        let (resp_tx, resp_rx) = oneshot::channel();
        let target = SocketAddr::from(([192, 168, 0, 103], ART_NET_PORT));

        tx.send(ListenerCommand::SendArtAddress {
            target,
            packet: vec![9, 9],
            response: resp_tx,
        })
        .await
        .expect("send command");

        if let Some(ListenerCommand::SendArtAddress {
            target: got_target,
            packet,
            response,
        }) = rx.recv().await
        {
            assert_eq!(got_target, target);
            assert_eq!(packet, vec![9, 9]);
            let _ = response.send(Ok(()));
        } else {
            panic!("expected SendArtAddress command");
        }

        resp_rx.await.expect("oneshot receive").expect("art address result");
    }
}
