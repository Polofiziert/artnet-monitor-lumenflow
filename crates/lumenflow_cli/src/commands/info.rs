use std::net::Ipv4Addr;

use anyhow::Result;

/// Prints LumenFlow version and lists network interfaces suitable for Art-Net.
///
/// # Errors
/// Returns an error if the OS interface list cannot be retrieved.
pub fn run() -> Result<()> {
    println!("LumenFlow CLI v{}", env!("CARGO_PKG_VERSION"));
    println!("Art-Net 4 diagnostic suite\n");
    println!("Art-Net port:     6454 (UDP)");
    println!("Protocol version: 14\n");

    println!("Network interfaces (IPv4):");
    println!("{:<16} {}", "INTERFACE", "ADDRESS");
    println!("{}", "─".repeat(36));

    let mut found_any = false;

    let addrs = nix::ifaddrs::getifaddrs()?;
    for ifaddr in addrs {
        let Some(addr) = ifaddr.address else {
            continue;
        };
        let Some(sin) = addr.as_sockaddr_in() else {
            continue;
        };
        let ip = Ipv4Addr::from(sin.ip());

        if ip.is_loopback() {
            continue;
        }

        found_any = true;
        println!("{:<16} {ip}", ifaddr.interface_name);
    }

    if !found_any {
        println!("  (no non-loopback IPv4 interfaces found)");
    }

    Ok(())
}
