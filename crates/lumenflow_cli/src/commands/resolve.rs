//! Target address resolution for Art-Net CLI commands.
//!
//! Supports both IP addresses and hostnames (e.g. host.docker.internal).

use std::net::SocketAddr;

use anyhow::Result;

/// Resolves a target host and port to a `SocketAddr`.
///
/// Accepts hostnames (e.g. `host.docker.internal`) and IP addresses.
/// Uses tokio's async DNS resolution.
///
/// # Errors
///
/// Returns an error if DNS resolution fails or no address is returned.
pub async fn resolve_target(target: &str, port: u16) -> Result<SocketAddr> {
    let host_port = format!("{}:{}", target, port);
    let mut addrs = tokio::net::lookup_host(&host_port)
        .await
        .map_err(|e| anyhow::anyhow!("invalid target address '{}': {}", target, e))?;
    addrs
        .next()
        .ok_or_else(|| anyhow::anyhow!("no address resolved for '{}'", target))
}
