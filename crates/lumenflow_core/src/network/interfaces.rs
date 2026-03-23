//! Network interface enumeration and CIDR-based resolution.
//!
//! Provides `get_network_interfaces()` for listing IPv4 interfaces and
//! `resolve_interface_for_cidr()` for auto-selecting an interface by IP range.

use std::net::Ipv4Addr;

use ipnetwork::Ipv4Network;
use thiserror::Error;

#[cfg(unix)]
use nix::ifaddrs::getifaddrs;

/// A network interface with IPv4 address and optional subnet/broadcast info.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkInterface {
    /// OS interface name (e.g. `en0`, `eth0`).
    pub name: String,
    /// IPv4 address of the interface.
    pub ip: Ipv4Addr,
    /// Subnet in CIDR notation (e.g. `192.168.1.0/24`), if derivable.
    pub subnet: Option<String>,
    /// Directed broadcast address (e.g. `192.168.1.255`), if derivable.
    pub broadcast: Option<Ipv4Addr>,
}

#[derive(Debug, Error)]
pub enum InterfacesError {
    #[error("failed to enumerate interfaces: {0}")]
    Enumeration(String),

    #[error("invalid CIDR: {0}")]
    InvalidCidr(String),
}

/// Returns the default spec-compliant Art-Net broadcast targets.
///
/// Per Art-Net 4 spec: 2.x.x.x, 10.x.x.x, and loopback broadcast.
pub fn default_spec_broadcast_targets(port: u16) -> Vec<std::net::SocketAddr> {
    vec![
        std::net::SocketAddr::from(([2, 255, 255, 255], port)),
        std::net::SocketAddr::from(([10, 255, 255, 255], port)),
        std::net::SocketAddr::from(([127, 255, 255, 255], port)),
    ]
}

/// Enumerates all IPv4 network interfaces.
///
/// Excludes loopback by default. Returns `name`, `ip`, and when available
/// `subnet` (CIDR) and `broadcast` address.
///
/// # Errors
/// Returns `InterfacesError` if the OS interface list cannot be retrieved.
///
/// # Platform support
/// Uses `nix::ifaddrs` on Unix (Linux, macOS). On Windows, returns `Ok(vec![])`.
#[cfg(unix)]
pub fn get_network_interfaces() -> Result<Vec<NetworkInterface>, InterfacesError> {
    let addrs = getifaddrs().map_err(|e| InterfacesError::Enumeration(e.to_string()))?;
    let mut result = Vec::new();

    for ifaddr in addrs {
        let Some(addr) = ifaddr.address else {
            continue;
        };
        let Some(sin) = addr.as_sockaddr_in() else {
            continue;
        };
        let ip = sin.ip();

        if ip.is_loopback() {
            continue;
        }

        let (subnet, broadcast) = derive_subnet_broadcast(&ifaddr, ip);

        result.push(NetworkInterface {
            name: ifaddr.interface_name.clone(),
            ip,
            subnet,
            broadcast,
        });
    }

    Ok(result)
}

/// Stub for Windows: returns empty list. Use `netdev` crate for full support.
#[cfg(not(unix))]
pub fn get_network_interfaces() -> Result<Vec<NetworkInterface>, InterfacesError> {
    Ok(Vec::new())
}

#[cfg(unix)]
fn derive_subnet_broadcast(
    ifaddr: &nix::ifaddrs::InterfaceAddress,
    ip: Ipv4Addr,
) -> (Option<String>, Option<Ipv4Addr>) {
    let netmask = ifaddr.netmask.as_ref().and_then(|m| m.as_sockaddr_in());
    let netmask = match netmask {
        Some(m) => m.ip(),
        None => return (None, None),
    };

    let prefix = prefix_from_netmask(netmask);
    let network_addr = Ipv4Addr::from(u32::from(ip) & u32::from(netmask));
    let network = match Ipv4Network::new(network_addr, prefix) {
        Ok(n) => n,
        Err(_) => return (None, None),
    };
    let broadcast = network.broadcast();
    let subnet_str = format!("{}/{}", network.network(), prefix);

    (Some(subnet_str), Some(broadcast))
}

fn prefix_from_netmask(netmask: Ipv4Addr) -> u8 {
    let n = u32::from(netmask);
    n.count_ones() as u8
}

/// Derives a /24 CIDR string from an IPv4 address (e.g. 192.168.2.125 → "192.168.2.0/24").
///
/// Used by the sender-subnet fallback: when we receive an ArtPoll and have no
/// `our_ip`, we find our interface on the same subnet as the poll sender.
#[must_use]
pub fn derive_cidr_24_from_ip(ip: Ipv4Addr) -> String {
    let o = ip.octets();
    format!("{}.{}.{}.0/24", o[0], o[1], o[2])
}

/// Resolves the first interface whose IP falls within the given CIDR range.
///
/// Used for "Auto" mode with Preferred IP: user enters `192.168.1.0/24` and
/// we find the interface that matches.
///
/// # Errors
/// Returns `InterfacesError::InvalidCidr` if the CIDR string cannot be parsed.
///
/// # Example
/// ```ignore
/// let iface = resolve_interface_for_cidr("192.168.1.0/24")?;
/// // Returns first interface with IP in 192.168.1.0–192.168.1.255
/// ```
pub fn resolve_interface_for_cidr(
    cidr: &str,
) -> Result<Option<NetworkInterface>, InterfacesError> {
    let network: Ipv4Network = cidr
        .parse()
        .map_err(|e| InterfacesError::InvalidCidr(format!("{e}")))?;

    let interfaces = get_network_interfaces()?;
    for iface in interfaces {
        if network.contains(iface.ip) {
            return Ok(Some(iface));
        }
    }

    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prefix_from_netmask() {
        assert_eq!(prefix_from_netmask(Ipv4Addr::new(255, 255, 255, 0)), 24);
        assert_eq!(prefix_from_netmask(Ipv4Addr::new(255, 255, 0, 0)), 16);
        assert_eq!(prefix_from_netmask(Ipv4Addr::new(255, 0, 0, 0)), 8);
    }

    #[test]
    fn test_default_spec_broadcast_targets() {
        let targets = default_spec_broadcast_targets(6454);
        assert_eq!(targets.len(), 3);
        assert_eq!(targets[0].ip(), std::net::IpAddr::V4(Ipv4Addr::new(2, 255, 255, 255)));
        assert_eq!(targets[1].ip(), std::net::IpAddr::V4(Ipv4Addr::new(10, 255, 255, 255)));
        assert_eq!(targets[2].ip(), std::net::IpAddr::V4(Ipv4Addr::new(127, 255, 255, 255)));
    }

    #[test]
    fn test_resolve_interface_invalid_cidr() {
        let r = resolve_interface_for_cidr("not-a-cidr");
        assert!(r.is_err());
    }

    #[test]
    fn test_derive_cidr_24_from_ip() {
        assert_eq!(
            derive_cidr_24_from_ip(Ipv4Addr::new(192, 168, 2, 125)),
            "192.168.2.0/24"
        );
        assert_eq!(
            derive_cidr_24_from_ip(Ipv4Addr::new(10, 0, 1, 50)),
            "10.0.1.0/24"
        );
        assert_eq!(
            derive_cidr_24_from_ip(Ipv4Addr::new(2, 100, 200, 1)),
            "2.100.200.0/24"
        );
    }
}
