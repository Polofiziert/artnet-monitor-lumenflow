//! Tauri commands for network interface selection and settings persistence.
//!
//! Implements `get_network_interfaces`, `get_network_settings`, and
//! `set_network_settings` per the NIC Selection plan.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use lumenflow_core::artnet::ART_NET_PORT;
use lumenflow_core::engine::DiscoveryConfig;
use lumenflow_core::network::{get_network_interfaces, resolve_interface_for_cidr};
use lumenflow_core::parse_discovery_targets_from_env;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::sync::watch;

const NETWORK_CONFIG_FILENAME: &str = "network.json";
const CONFIG_VERSION: u32 = 1;

/// DTO for a single network interface (frontend).
#[derive(Debug, Clone, Serialize)]
pub struct NetworkInterfaceDto {
    pub name: String,
    pub ip: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subnet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broadcast: Option<String>,
}

/// DTO for persisted network settings (frontend + file).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSettingsDto {
    pub version: u32,
    pub interface_mode: String,
    pub preferred_ip_cidr: String,
    pub secondary_preferred_cidr: Option<String>,
    pub primary_nic: Option<String>,
    pub secondary_nic: Option<String>,
    pub spec_targets: bool,
    pub subnet_broadcast: bool,
    pub custom_broadcast_targets: Vec<String>,
    pub unicast_targets: Vec<String>,
}

impl Default for NetworkSettingsDto {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            interface_mode: "auto".to_string(),
            preferred_ip_cidr: "0.0.0.0/0".to_string(),
            secondary_preferred_cidr: None,
            primary_nic: None,
            secondary_nic: None,
            spec_targets: true,
            subnet_broadcast: false,
            custom_broadcast_targets: Vec::new(),
            unicast_targets: Vec::new(),
        }
    }
}

/// Resolved bind target for a listener (primary or secondary).
#[derive(Debug, Clone)]
pub struct BindTarget {
    pub bind_addr: SocketAddr,
    pub our_ip: Option<std::net::Ipv4Addr>,
    #[allow(dead_code)] // Phase 2: per-NIC status display
    pub subnet_broadcast: Option<std::net::Ipv4Addr>,
}

/// Network configuration derived from settings for listener orchestration.
#[derive(Debug, Clone)]
pub struct NetworkConfig {
    pub bind_targets: Vec<BindTarget>,
    pub discovery_config: DiscoveryConfig,
}

/// State for network config and restart signaling.
pub struct NetworkState {
    pub config: Arc<RwLock<NetworkSettingsDto>>,
    pub restart_tx: watch::Sender<NetworkSettingsDto>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    Ok(dir.join(NETWORK_CONFIG_FILENAME))
}

fn load_settings(app: &AppHandle) -> NetworkSettingsDto {
    let path = match config_path(app) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("Network config path error: {e}");
            return NetworkSettingsDto::default();
        }
    };
    let Ok(data) = std::fs::read_to_string(&path) else {
        return NetworkSettingsDto::default();
    };
    match serde_json::from_str::<NetworkSettingsDto>(&data) {
        Ok(mut s) => {
            if s.version != CONFIG_VERSION {
                s.version = CONFIG_VERSION;
            }
            s
        }
        Err(e) => {
            tracing::warn!("Failed to parse network config: {e}");
            NetworkSettingsDto::default()
        }
    }
}

fn save_settings(app: &AppHandle, settings: &NetworkSettingsDto) -> Result<(), String> {
    let path = config_path(app)?;
    let data =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Serialize error: {e}"))?;
    std::fs::write(&path, data).map_err(|e| format!("Write error: {e}"))?;
    Ok(())
}

/// Derives bind targets and discovery config from settings.
pub fn derive_network_config(settings: &NetworkSettingsDto) -> NetworkConfig {
    let mut bind_targets = Vec::new();
    let mut subnet_targets = Vec::new();
    let mut our_ip: Option<std::net::Ipv4Addr> = None;

    let bind_addr = if settings.interface_mode == "manual" {
        if let Some(ref nic) = settings.primary_nic {
            let interfaces = match get_network_interfaces() {
                Ok(ifaces) => ifaces,
                Err(e) => {
                    tracing::warn!("Failed to get interfaces: {e}");
                    Vec::new()
                }
            };
            let iface = interfaces
                .into_iter()
                .find(|i| i.name == *nic || i.ip.to_string() == *nic);
            if let Some(i) = iface {
                our_ip = Some(i.ip);
                if settings.subnet_broadcast {
                    if let Some(b) = i.broadcast {
                        subnet_targets.push(SocketAddr::from((b, ART_NET_PORT)));
                    }
                }
                // Bind to 0.0.0.0:6454 to receive broadcast on all interfaces (Art-Net 4).
                // Binding to a specific IP can fail to receive subnet broadcast on some systems.
                SocketAddr::from(([0, 0, 0, 0], ART_NET_PORT))
            } else {
                SocketAddr::from(([0, 0, 0, 0], ART_NET_PORT))
            }
        } else {
            SocketAddr::from(([0, 0, 0, 0], ART_NET_PORT))
        }
    } else {
        let cidr = settings.preferred_ip_cidr.as_str();
        if cidr == "0.0.0.0/0" || cidr.is_empty() {
            SocketAddr::from(([0, 0, 0, 0], ART_NET_PORT))
        } else {
            match resolve_interface_for_cidr(cidr) {
                Ok(Some(iface)) => {
                    our_ip = Some(iface.ip);
                    if settings.subnet_broadcast {
                        if let Some(b) = iface.broadcast {
                            subnet_targets.push(SocketAddr::from((b, ART_NET_PORT)));
                        }
                    }
                    // Bind to 0.0.0.0:6454 to receive broadcast on all interfaces (Art-Net 4).
                    SocketAddr::from(([0, 0, 0, 0], ART_NET_PORT))
                }
                Ok(None) | Err(_) => SocketAddr::from(([0, 0, 0, 0], ART_NET_PORT)),
            }
        }
    };

    // Art-Net 4: when binding to 0.0.0.0 with no our_ip (e.g. "All Interfaces"),
    // derive our_ip from the first non-loopback interface so we can reply to ArtPoll.
    // Always add subnet broadcast when using fallback (maximizes compatibility with
    // controllers on same subnet, e.g. Protokoll).
    if our_ip.is_none() {
        if let Ok(ifaces) = get_network_interfaces() {
            if let Some(iface) = ifaces.into_iter().next() {
                our_ip = Some(iface.ip);
                if let Some(b) = iface.broadcast {
                    subnet_targets.push(SocketAddr::from((b, ART_NET_PORT)));
                }
                tracing::debug!(ip = %iface.ip, "Derived our_ip from first interface for ArtPollReply");
            }
        }
        if our_ip.is_none() {
            tracing::warn!(
                "No our_ip derived; ArtPollReply will not be sent. Select a NIC or enable subnet broadcast."
            );
        }
    }

    let subnet_broadcast_addr = subnet_targets.first().and_then(|a| match a {
        SocketAddr::V4(v) => Some(*v.ip()),
        _ => None,
    });

    bind_targets.push(BindTarget {
        bind_addr,
        our_ip,
        subnet_broadcast: subnet_broadcast_addr,
    });

    let mut custom_targets = Vec::new();
    for s in &settings.custom_broadcast_targets {
        if let Ok(addr) = s.parse::<SocketAddr>() {
            custom_targets.push(addr);
        } else if let Ok(ip) = s.parse::<std::net::Ipv4Addr>() {
            custom_targets.push(SocketAddr::from((ip, ART_NET_PORT)));
        }
    }

    let mut unicast_targets = Vec::new();
    for s in &settings.unicast_targets {
        if let Ok(addr) = s.parse::<SocketAddr>() {
            unicast_targets.push(addr);
        }
    }
    // Docker / virtual lab: `pnpm run dev:docker` sets LUMENFLOW_DISCOVERY_TARGETS; merge with UI
    // settings so ArtPoll reaches port-mapped consoles/node (127.0.0.1:6455–6457).
    for addr in parse_discovery_targets_from_env() {
        if !unicast_targets.contains(&addr) {
            unicast_targets.push(addr);
        }
    }

    let discovery_config = DiscoveryConfig {
        spec_targets: settings.spec_targets,
        subnet_targets,
        custom_targets,
        unicast_targets,
    };

    NetworkConfig {
        bind_targets,
        discovery_config,
    }
}

/// Tauri command: returns all IPv4 network interfaces.
#[tauri::command]
pub fn get_network_interfaces_cmd() -> Result<Vec<NetworkInterfaceDto>, String> {
    let interfaces = get_network_interfaces().map_err(|e| e.to_string())?;
    Ok(interfaces
        .into_iter()
        .map(|i| NetworkInterfaceDto {
            name: i.name,
            ip: i.ip.to_string(),
            subnet: i.subnet,
            broadcast: i.broadcast.map(|b| b.to_string()),
        })
        .collect())
}

/// Tauri command: returns persisted network settings.
#[tauri::command]
pub fn get_network_settings_cmd(
    _app: AppHandle,
    network_state: State<'_, NetworkState>,
) -> NetworkSettingsDto {
    network_state.config.read().clone()
}

/// Tauri command: persists settings and triggers listener restart.
#[tauri::command]
pub async fn set_network_settings_cmd(
    app: AppHandle,
    settings: NetworkSettingsDto,
    network_state: State<'_, NetworkState>,
) -> Result<(), String> {
    let mut s = settings;
    s.version = CONFIG_VERSION;
    save_settings(&app, &s)?;
    {
        let mut config = network_state.config.write();
        *config = s.clone();
    }
    network_state
        .restart_tx
        .send(s)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Creates initial network state and loads persisted config.
/// Returns (NetworkState for Tauri manage, Receiver for listener restart loop).
pub fn init_network_state(app: &AppHandle) -> (NetworkState, watch::Receiver<NetworkSettingsDto>) {
    let settings = load_settings(app);
    let (tx, rx) = watch::channel(settings.clone());
    let state = NetworkState {
        config: Arc::new(RwLock::new(settings)),
        restart_tx: tx,
    };
    (state, rx)
}
