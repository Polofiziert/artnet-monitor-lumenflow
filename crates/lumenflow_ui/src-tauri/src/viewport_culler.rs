use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use dashmap::DashSet;
use lumenflow_core::artnet::{build_art_data_request, build_art_ip_prog, build_our_poll_reply, ArtNetParser, IpProgConfig, ART_NET_PORT};
use lumenflow_core::build_art_poll;
use lumenflow_core::buffer::UniverseStore;
use lumenflow_core::device::{DeviceInfo, DeviceRegistry};
use lumenflow_core::engine::{DiscoveryConfig, DiagBuffer, DiagPriority, JitterCollector, SyncDetector, Staleness};
use lumenflow_core::network::{derive_cidr_24_from_ip, resolve_interface_for_cidr, ArtNetSocket};
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
    pub sync_detector: Arc<SyncDetector>,
    pub diag_buffer: Arc<DiagBuffer>,
    pub jitter_collector: Arc<JitterCollector>,
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

/// Event payload for frontend device updates (D5 push path).
#[derive(Clone, serde::Serialize)]
pub struct DevicesUpdatedDto {
    pub version: u64,
    pub timestamp_nanos: u64,
    pub devices: Vec<DeviceInfoDto>,
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

/// Tauri command: sends ArtIpProg UNICAST to target device and waits for ArtIpProgReply.
///
/// For read-only query: set enable_programming=false. Returns current device config.
/// For programming: set enable_programming=true and provide new_ip, subnet_mask, etc.
/// Requires explicit user confirmation before programming (enforced in UI).
///
/// # Errors
/// Returns error if target_ip is invalid, socket fails, send fails, or no reply within 2s.
#[tauri::command]
pub async fn send_ip_prog(params: IpProgParams) -> Result<IpProgReplyDto, String> {
    let target_ip: std::net::Ipv4Addr = params
        .target_ip
        .parse()
        .map_err(|e| format!("Invalid target IP: {e}"))?;

    let target = SocketAddr::from((target_ip, ART_NET_PORT));

    let config = IpProgConfig {
        enable_programming: params.enable_programming,
        enable_dhcp: params.enable_dhcp,
        program_gateway: params.gateway.is_some(),
        reset: false,
        program_ip: params.new_ip.is_some(),
        program_subnet: params.subnet_mask.is_some(),
        program_port: params.port.is_some(),
        ip: params
            .new_ip
            .as_ref()
            .and_then(|s| s.parse().ok()),
        subnet_mask: params
            .subnet_mask
            .as_ref()
            .and_then(|s| s.parse().ok()),
        port: params.port,
        gateway: params.gateway.as_ref().and_then(|s| s.parse().ok()),
    };

    let packet = build_art_ip_prog(&config);

    let socket = ArtNetSocket::bind(SocketAddr::from(([0, 0, 0, 0], 0)))
        .await
        .map_err(|e| format!("Failed to create socket: {e}"))?;

    socket
        .send_to(&packet, target)
        .await
        .map_err(|e| format!("Failed to send ArtIpProg: {e}"))?;

    let mut recv_buf = [0u8; 256];
    let timeout = Duration::from_secs(2);

    let (len, _from) = tokio::time::timeout(
        timeout,
        socket.inner().recv_from(&mut recv_buf),
    )
    .await
    .map_err(|_| "Timeout: no ArtIpProgReply received within 2 seconds")?
    .map_err(|e| format!("Recv error: {e}"))?;

    let payload = &recv_buf[..len];
    match ArtNetParser::parse(payload) {
        Ok(lumenflow_core::ArtNetPacket::IpProgReply(reply)) => Ok(IpProgReplyDto {
            ip: reply.ip().to_string(),
            subnet_mask: reply.subnet_mask().to_string(),
            gateway: reply.gateway().to_string(),
            port: reply.port(),
            dhcp_enabled: reply.dhcp_enabled(),
        }),
        Ok(other) => Err(format!(
            "Unexpected packet type (expected IpProgReply): {other:?}"
        )),
        Err(e) => Err(format!("Failed to parse reply: {e}")),
    }
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

/// Tauri command: returns all discovered Art-Net devices.
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

            if active_ids.is_empty() {
                continue;
            }

            let now_nanos = epoch_nanos();
            let count = active_ids.len();
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
                    let devices = device_registry
                        .list_devices()
                        .into_iter()
                        .map(|d| map_device_to_dto(d, cutoff))
                        .collect();
                    let payload = DevicesUpdatedDto {
                        version: current_version,
                        timestamp_nanos: epoch_nanos(),
                        devices,
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
    cancel: CancellationToken,
) {
    let universe_store = state.universe_store.clone();
    let device_registry = state.device_registry.clone();
    let device_version = state.device_version.clone();
    let sync_detector = state.sync_detector.clone();
    let diag_buffer = state.diag_buffer.clone();
    let jitter_collector = state.jitter_collector.clone();

    let broadcast_targets = discovery_config.broadcast_targets(ART_NET_PORT);
    let unicast_targets = discovery_config.unicast_targets.clone();
    let poll_packet = build_art_poll();

    let mut socket = match lumenflow_core::ArtNetSocket::bind(bind_addr).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("Failed to bind Art-Net socket to {bind_addr}: {e}");
            return;
        }
    };

    let mut poll_interval = time::interval(Duration::from_millis(DISCOVERY_POLL_INTERVAL_MS));
    poll_interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

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
        };
        device_registry.upsert(self_device);
        device_version.fetch_add(1, Ordering::Relaxed);
    }

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                tracing::info!("UDP listener cancelled");
                return;
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
                    Ok(lumenflow_core::ArtNetPacket::Poll(_)) => {
                        let sender_ip = match addr {
                            std::net::SocketAddr::V4(v4) => *v4.ip(),
                            std::net::SocketAddr::V6(_) => {
                                tracing::trace!(from = %addr, "Ignoring ArtPoll from IPv6");
                                continue;
                            }
                        };
                        let is_self = our_ip.map(|ip| sender_ip == ip).unwrap_or(false);
                        if is_self {
                            tracing::trace!(from = %addr, "Ignoring ArtPoll from self");
                        } else {
                            tracing::info!(from = %addr, "Received ArtPoll from external controller");
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
                            let device = DeviceInfo {
                                mac_address: reply.mac,
                                ip_address: device_ip,
                                bind_ip: std::net::Ipv4Addr::new(
                                    reply.bind_ip[0],
                                    reply.bind_ip[1],
                                    reply.bind_ip[2],
                                    reply.bind_ip[3],
                                ),
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
                            };
                            tracing::info!(
                                ip = %device.ip_address,
                                name = %device.short_name,
                                "Discovered Art-Net device"
                            );
                            device_registry.upsert(device);
                            device_version.fetch_add(1, Ordering::Relaxed);
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
                    | Ok(lumenflow_core::ArtNetPacket::IpProgReply(_))
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

/// Spawns the UDP listener loop that receives Art-Net packets and writes
/// them into the shared `UniverseStore` and `DeviceRegistry`.
#[allow(dead_code)] // Replaced by start_network_listeners; kept for tests
pub fn start_udp_listener(app_handle: tauri::AppHandle, state: &AppState) {
    let bind_addr = std::net::SocketAddr::from(([0, 0, 0, 0], lumenflow_core::artnet::ART_NET_PORT));
    let cancel = CancellationToken::new();
    let state_clone = state.clone();
    tauri::async_runtime::spawn(async move {
        run_udp_listener(
            app_handle,
            &state_clone,
            bind_addr,
            None,
            DiscoveryConfig::default(),
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
            let listener_handle = tauri::async_runtime::spawn(async move {
                run_udp_listener(
                    app_handle_clone,
                    &state_clone,
                    bind_target.bind_addr,
                    bind_target.our_ip,
                    discovery_config,
                    cancel_for_listener,
                )
                .await;
            });

            if config_rx.changed().await.is_err() {
                break;
            }
            cancel.cancel();
            let _ = listener_handle.await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
