//! Target address resolution for Art-Net CLI commands.
//!
//! Supports both IP addresses and hostnames (e.g. host.docker.internal).

use std::net::{Ipv4Addr, SocketAddr};

use anyhow::{bail, Result};

fn trim_target(target: &str) -> &str {
    target.trim().trim_start_matches('\u{feff}')
}

/// Resolves a target host and port to a `SocketAddr`.
///
/// Accepts:
/// - A full socket address: `ip:port` or `[ipv6]:port` (no DNS when parse succeeds).
/// - `hostname:port` — one DNS lookup for that pair (no double-appending of `default_port`).
/// - Host or bare IP only — `default_port` is appended (e.g. `host.docker.internal` → `:6454`).
///
/// # Errors
///
/// Returns an error if DNS resolution fails or no address is returned.
pub async fn resolve_target(target: &str, default_port: u16) -> Result<SocketAddr> {
    let t = trim_target(target);
    if let Ok(addr) = t.parse::<SocketAddr>() {
        return Ok(addr);
    }
    // `hostname:port` is not accepted by `str::parse::<SocketAddr>()`. Split on the last ':' so
    // IPv4:port works; trim parts so CRLF / BOM on the host does not force a bogus DNS lookup.
    if let Some((host, port_str)) = t.rsplit_once(':') {
        let host = host.trim();
        let port_str = port_str.trim();
        if let Ok(port) = port_str.parse::<u16>() {
            if let Ok(ip) = host.parse::<Ipv4Addr>() {
                return Ok(SocketAddr::new(ip.into(), port));
            }
            let host_port = format!("{host}:{port}");
            let mut addrs = tokio::net::lookup_host(&host_port)
                .await
                .map_err(|e| anyhow::anyhow!("invalid target address '{t}': {e}"))?;
            return addrs
                .next()
                .ok_or_else(|| anyhow::anyhow!("no address resolved for '{t}'"));
        }
        // Had ':' but port is not numeric — do not append default_port (would make host:port:port).
        bail!("invalid port in target address '{t}'");
    }
    let host_port = format!("{t}:{default_port}");
    let mut addrs = tokio::net::lookup_host(&host_port)
        .await
        .map_err(|e| anyhow::anyhow!("invalid target address '{t}': {e}"))?;
    addrs
        .next()
        .ok_or_else(|| anyhow::anyhow!("no address resolved for '{t}'"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn resolve_accepts_full_ipv4_port_without_double_appending() {
        let addr = resolve_target("10.255.255.255:6454", 6454)
            .await
            .expect("broadcast-style target");
        assert_eq!(addr.ip().to_string(), "10.255.255.255");
        assert_eq!(addr.port(), 6454);
    }

    #[tokio::test]
    async fn resolve_ipv4_split_path_broadcast() {
        let addr = resolve_target("10.255.255.255:6454", 9999)
            .await
            .expect("must use embedded port 6454, not default");
        assert_eq!(addr.port(), 6454);
    }

    #[tokio::test]
    async fn resolve_broadcast_with_bom_on_host_still_ipv4() {
        let t = "\u{feff}10.255.255.255:6454";
        let addr = resolve_target(t, 6454)
            .await
            .expect("BOM must not force DNS");
        assert_eq!(addr.ip().to_string(), "10.255.255.255");
        assert_eq!(addr.port(), 6454);
    }

    #[tokio::test]
    async fn resolve_port_with_crlf_still_parses() {
        let addr = resolve_target("10.255.255.255:6454\r\n", 6454)
            .await
            .expect("CRLF on port side must trim");
        assert_eq!(addr.port(), 6454);
    }
}
