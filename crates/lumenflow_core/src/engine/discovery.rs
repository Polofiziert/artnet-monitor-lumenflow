//! Discovery engine: ArtPoll broadcast and self-reply.
//!
//! Per Art-Net 4 spec, controllers run a 2.5-second poll loop and reply to
//! their own ArtPoll with ArtPollReply (identifying as a controller).
//! Disconnected devices are kept in the registry and shown as offline in the UI.

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use tokio::time;
use tokio_util::sync::CancellationToken;

use crate::artnet::{build_our_poll_reply, ART_NET_PORT};
use crate::device::DeviceRegistry;
use crate::network::{build_art_poll, default_spec_broadcast_targets, ArtNetSocket};

const POLL_INTERVAL_MS: u64 = 2500;

const ENV_DISCOVERY_TARGETS: &str = "LUMENFLOW_DISCOVERY_TARGETS";

/// Configuration for ArtPoll discovery broadcast and unicast targets.
///
/// Merges spec-compliant (2.x, 10.x, loopback), subnet-derived, and custom
/// broadcast targets into a single list for each poll.
#[derive(Debug, Clone, Default)]
pub struct DiscoveryConfig {
    /// Include spec-compliant targets: 2.255.255.255, 10.255.255.255, 127.255.255.255.
    pub spec_targets: bool,
    /// Subnet-derived broadcast addresses (e.g. 192.168.1.255 from selected NIC).
    pub subnet_targets: Vec<SocketAddr>,
    /// User-defined broadcast targets for non-spec subnets.
    pub custom_targets: Vec<SocketAddr>,
    /// Unicast targets (e.g. Docker-mapped ports, virtual networks).
    pub unicast_targets: Vec<SocketAddr>,
}

impl DiscoveryConfig {
    /// Merges all enabled targets into a single list for broadcast sends.
    ///
    /// Order: spec (if enabled), subnet, custom. Unicast targets are sent
    /// separately (they are not broadcast addresses).
    pub fn broadcast_targets(&self, port: u16) -> Vec<SocketAddr> {
        let mut targets = Vec::new();
        if self.spec_targets {
            targets.extend(default_spec_broadcast_targets(port));
        }
        targets.extend(self.subnet_targets.iter().copied());
        targets.extend(self.custom_targets.iter().copied());
        targets
    }
}

/// Parses `LUMENFLOW_DISCOVERY_TARGETS` env var into a list of socket addresses.
///
/// Format: comma-separated `host:port` (e.g. `127.0.0.1:6455,127.0.0.1:6456`).
/// Invalid entries are skipped with a warning. Returns empty vec if unset.
pub fn parse_discovery_targets_from_env() -> Vec<SocketAddr> {
    let Ok(value) = std::env::var(ENV_DISCOVERY_TARGETS) else {
        return vec![];
    };
    let mut addrs = Vec::new();
    for s in value.split(',') {
        let s = s.trim();
        if s.is_empty() {
            continue;
        }
        match s.parse::<SocketAddr>() {
            Ok(addr) => addrs.push(addr),
            Err(e) => {
                tracing::warn!(
                    "DiscoveryEngine: invalid target in {ENV_DISCOVERY_TARGETS}: {s:?} ({e})"
                );
            }
        }
    }
    addrs
}

/// Spawns the discovery engine with configurable broadcast and unicast targets.
///
/// - **Broadcast targets**: Merged from `config.spec_targets`, `config.subnet_targets`,
///   and `config.custom_targets` via `DiscoveryConfig::broadcast_targets()`.
/// - **Unicast targets**: Sends ArtPoll to each address in `config.unicast_targets`.
/// - **Self-reply**: When `our_ip` is `Some`, sends our ArtPollReply after each poll.
/// - **cancel**: When provided, the loop exits when the token is cancelled (for listener restart).
///
/// # Panics
/// **Must be called from within a Tokio runtime.**
pub fn spawn_discovery_with_config(
    _device_registry: Arc<DeviceRegistry>,
    our_ip: Option<Ipv4Addr>,
    our_mac: [u8; 6],
    config: DiscoveryConfig,
    cancel: Option<CancellationToken>,
) -> tokio::task::JoinHandle<()> {
    let broadcast_targets = config.broadcast_targets(ART_NET_PORT);
    let unicast_targets = config.unicast_targets;

    tokio::spawn(async move {
        let socket = match ArtNetSocket::bind(std::net::SocketAddr::from(([0, 0, 0, 0], 0))).await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("DiscoveryEngine: failed to bind socket: {e}");
                return;
            }
        };

        let poll_packet = build_art_poll();
        let our_reply: Option<[u8; 239]> = our_ip.map(|ip| build_our_poll_reply(ip, our_mac));

        let mut poll_interval = time::interval(Duration::from_millis(POLL_INTERVAL_MS));
        poll_interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

        tracing::info!(
            our_ip = ?our_ip,
            broadcast_targets = broadcast_targets.len(),
            unicast_targets = unicast_targets.len(),
            "DiscoveryEngine started (poll: 2.5s)"
        );

        loop {
            tokio::select! {
                _ = poll_interval.tick() => {}
                _ = async {
                    if let Some(ref c) = cancel {
                        c.cancelled().await
                    } else {
                        std::future::pending::<()>().await
                    }
                } => {
                    tracing::info!("DiscoveryEngine: cancelled");
                    return;
                }
            }

            if !broadcast_targets.is_empty() {
                if let Err(e) = socket
                    .send_to_targets(&poll_packet, &broadcast_targets)
                    .await
                {
                    tracing::warn!("DiscoveryEngine: ArtPoll broadcast failed: {e}");
                } else {
                    tracing::debug!("DiscoveryEngine: sent ArtPoll");
                }
            }

            for addr in &unicast_targets {
                if let Err(e) = socket.send_to(&poll_packet, *addr).await {
                    tracing::warn!("DiscoveryEngine: ArtPoll unicast to {addr} failed: {e}");
                }
            }

            if let (Some(ref reply), Some(ip)) = (&our_reply, our_ip) {
                let target = std::net::SocketAddr::from((ip, ART_NET_PORT));
                if let Err(e) = socket.send_to(reply.as_slice(), target).await {
                    tracing::warn!("DiscoveryEngine: self-reply failed: {e}");
                }
            }
        }
    })
}

/// Spawns the discovery engine with default spec-compliant targets.
///
/// Backward-compatible wrapper. Uses `DiscoveryConfig` with `spec_targets: true`
/// and the given `unicast_targets` (e.g. from `LUMENFLOW_DISCOVERY_TARGETS`).
pub fn spawn_discovery(
    device_registry: Arc<DeviceRegistry>,
    our_ip: Option<Ipv4Addr>,
    our_mac: [u8; 6],
    unicast_targets: impl IntoIterator<Item = SocketAddr> + Send + 'static,
) {
    let config = DiscoveryConfig {
        spec_targets: true,
        unicast_targets: unicast_targets.into_iter().collect(),
        ..Default::default()
    };
    spawn_discovery_with_config(device_registry, our_ip, our_mac, config, None);
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::device::DeviceRegistry;

    /// Verifies spawn_discovery runs when called from within a Tokio runtime.
    /// Regression test: calling from a non-runtime context (e.g. Tauri setup on
    /// main thread) would panic with "there is no reactor running".
    #[tokio::test]
    async fn test_spawn_discovery_requires_runtime() {
        let registry = Arc::new(DeviceRegistry::new());
        spawn_discovery(registry, None, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00], vec![]);
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
