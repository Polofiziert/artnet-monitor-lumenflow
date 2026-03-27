use std::collections::BTreeMap;
use std::net::{Ipv4Addr, SocketAddr};

use dashmap::DashMap;

/// One logical DMX port on an Art-Net product (flattened across BindIndex pages).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProductPort {
    /// Art-Net 4 bind index for the ArtPollReply page this port came from.
    pub bind_index: u8,
    /// Zero-based index within that page (`num_ports` slots, max 4 per reply).
    pub slot: u8,
    /// Full 15-bit output (DMX) universe for this port.
    pub output_universe: u16,
    /// Input universe for this slot, if present.
    pub input_universe: Option<u16>,
    /// Display label (typically the bind’s Short Name, plus slot when `num_ports` > 1).
    pub label: String,
}

/// One physical Art-Net product: all BindIndex replies sharing the same bind IP and MAC.
#[derive(Debug, Clone)]
pub struct ArtNetProduct {
    /// Root bind address from ArtPollReply (Art-Net 4).
    pub bind_ip: Ipv4Addr,
    /// Source IPv4 seen on replies (usually matches `bind_ip`).
    pub ip_address: Ipv4Addr,
    /// UDP source of the last PollReply (e.g. `127.0.0.1:6457` when Docker maps ports).
    /// Use for management traffic when it differs from advertised `ip_address`.
    pub last_reply_source: Option<SocketAddr>,
    /// Canonical bind page for node-level actions (e.g. LED/long-name writes).
    pub primary_bind_index: u8,
    pub mac_address: [u8; 6],
    /// Best-effort product short name (prefers bind_index == 1, else first bind).
    pub short_name: String,
    /// Best-effort long name (from the lowest bind_index entry).
    pub long_name: String,
    /// Metadata from the lowest `bind_index` page (for OEM / diagnostics).
    pub esta_man: u16,
    pub oem_code: u16,
    pub firmware_version: u16,
    pub node_report: String,
    /// ArtPollReply Status1 from the primary bind page (includes indicator mode in bits 7..6).
    pub status1: u8,
    /// ArtPollReply Status2 from the primary bind page.
    pub status2: u8,
    pub ports: Vec<ProductPort>,
    pub last_seen: std::time::Instant,
}

/// Per-port information decoded from ArtPollReply.
#[derive(Debug, Clone)]
pub struct PortInfo {
    pub index: u8,
    pub port_address: u16,
    pub direction: PortDirection,
}

/// Input or output port direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PortDirection {
    Input,
    Output,
}

/// Information about a discovered Art-Net node.
///
/// Keyed by `(ip_address, bind_index)` in the [`DeviceRegistry`] to correctly
/// handle Art-Net 4 multi-port products that send one ArtPollReply per
/// BindIndex from the same IP address.
#[derive(Debug, Clone)]
pub struct DeviceInfo {
    pub mac_address: [u8; 6],
    pub ip_address: Ipv4Addr,
    pub bind_ip: Ipv4Addr,
    pub bind_index: u8,
    pub port: u16,
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
    pub port_types: [u8; 4],
    pub good_input: [u8; 4],
    pub good_output: [u8; 4],
    pub good_output_b: [u8; 4],
    pub sw_in: [u8; 4],
    pub sw_out: [u8; 4],
    pub status1: u8,
    pub status2: u8,
    pub status3: u8,
    pub acn_priority: u8,
    pub sw_macro: u8,
    pub sw_remote: u8,
    pub style: u8,
    pub def_resp: [u8; 6],
    pub user: [u8; 2],
    pub refresh_rate: u16,
    pub port_addresses: Vec<u16>,
    pub input_port_addresses: Vec<u16>,
    pub last_seen: std::time::Instant,
    /// UDP source address of the packet that produced this row (NAT / port-mapped Docker).
    pub last_reply_source: Option<SocketAddr>,
}

/// Thread-safe registry for tracking discovered Art-Net devices.
///
/// Uses `DashMap` keyed by `(Ipv4Addr, bind_index)` for lock-free concurrent
/// reads from the UI thread while the network thread inserts/updates entries.
/// This correctly models Art-Net 4 multi-port products where a single IP
/// sends multiple ArtPollReply packets with different BindIndex values.
pub struct DeviceRegistry {
    devices: DashMap<(Ipv4Addr, u8), DeviceInfo>,
}

impl DeviceRegistry {
    /// Creates an empty device registry.
    pub fn new() -> Self {
        Self {
            devices: DashMap::new(),
        }
    }

    /// Inserts or updates a device entry keyed by `(ip_address, bind_index)`.
    pub fn upsert(&self, device: DeviceInfo) {
        let key = (device.ip_address, device.bind_index);
        self.devices.insert(key, device);
    }

    /// Returns a snapshot of all known devices.
    pub fn list_devices(&self) -> Vec<DeviceInfo> {
        self.devices.iter().map(|r| r.value().clone()).collect()
    }

    /// Returns IPs of devices that have the given port-address in their
    /// SwIn or SwOut configuration (subscribed to that universe).
    pub fn find_subscribers(&self, port_address: u16) -> Vec<Ipv4Addr> {
        self.devices
            .iter()
            .filter(|r| {
                let d = r.value();
                d.port_addresses.contains(&port_address)
                    || d.input_port_addresses.contains(&port_address)
            })
            .map(|r| r.value().ip_address)
            .collect()
    }

    /// Groups devices by IP address for product-level aggregation in the UI.
    ///
    /// Each inner `Vec` contains all BindIndex entries for a single physical
    /// product, sorted by `bind_index`. The outer `Vec` is sorted by IP
    /// address for deterministic ordering.
    ///
    /// Prefer [`Self::aggregate_products`] for UI: it keys by `(bind_ip, mac)` and
    /// flattens ports across binds.
    pub fn list_products(&self) -> Vec<Vec<DeviceInfo>> {
        let mut by_ip: BTreeMap<Ipv4Addr, Vec<DeviceInfo>> = BTreeMap::new();
        for entry in self.devices.iter() {
            by_ip
                .entry(entry.value().ip_address)
                .or_default()
                .push(entry.value().clone());
        }
        let mut products: Vec<Vec<DeviceInfo>> = by_ip.into_values().collect();
        for group in &mut products {
            group.sort_by_key(|d| d.bind_index);
        }
        products
    }

    /// Merges all [`DeviceInfo`] rows into physical **products** keyed by
    /// `(effective_bind_ip, mac_address)`.
    ///
    /// `effective_bind_ip` is [`DeviceInfo::bind_ip`] when it is not
    /// `0.0.0.0`, otherwise [`DeviceInfo::ip_address`] (some firmware leaves
    /// bind IP unset).
    ///
    /// Ports are ordered by increasing `bind_index`, then slot index within each
    /// ArtPollReply page.
    pub fn aggregate_products(&self) -> Vec<ArtNetProduct> {
        fn effective_bind_ip(d: &DeviceInfo) -> Ipv4Addr {
            if d.bind_ip.is_unspecified() {
                d.ip_address
            } else {
                d.bind_ip
            }
        }

        let mut groups: BTreeMap<(Ipv4Addr, [u8; 6]), Vec<DeviceInfo>> = BTreeMap::new();
        for d in self.list_devices() {
            let key = (effective_bind_ip(&d), d.mac_address);
            groups.entry(key).or_default().push(d);
        }

        for binds in groups.values_mut() {
            binds.sort_by_key(|d| d.bind_index);
        }

        let mut products: Vec<ArtNetProduct> = groups
            .into_iter()
            .map(|((bind_ip, mac), binds)| {
                let ref_bind = binds.iter().min_by_key(|d| d.bind_index);
                let primary_bind_index = ref_bind.map(|d| d.bind_index.max(1)).unwrap_or(1);

                let long_name = ref_bind.map(|d| d.long_name.clone()).unwrap_or_default();

                let short_name = binds
                    .iter()
                    .find(|d| d.bind_index == 1)
                    .map(|d| d.short_name.clone())
                    .or_else(|| binds.first().map(|d| d.short_name.clone()))
                    .unwrap_or_default();

                let esta_man = ref_bind.map(|d| d.esta_man).unwrap_or(0);
                let oem_code = ref_bind.map(|d| d.oem_code).unwrap_or(0);
                let firmware_version = ref_bind.map(|d| d.firmware_version).unwrap_or(0);
                let node_report = ref_bind.map(|d| d.node_report.clone()).unwrap_or_default();
                let status1 = ref_bind.map(|d| d.status1).unwrap_or(0);
                let status2 = ref_bind.map(|d| d.status2).unwrap_or(0);

                let last_seen = binds
                    .iter()
                    .map(|d| d.last_seen)
                    .max()
                    .unwrap_or_else(std::time::Instant::now);

                let ip_address = binds.first().map(|d| d.ip_address).unwrap_or(bind_ip);

                let last_reply_source = binds.iter().find_map(|d| d.last_reply_source);

                let mut ports = Vec::new();
                for bind in &binds {
                    let n_out = bind.port_addresses.len();
                    for slot in 0..n_out {
                        let label = if bind.num_ports > 1 {
                            format!("{} · {}", bind.short_name.trim(), slot + 1)
                        } else {
                            bind.short_name.clone()
                        };
                        let input = bind.input_port_addresses.get(slot).copied();
                        ports.push(ProductPort {
                            bind_index: bind.bind_index,
                            slot: slot as u8,
                            output_universe: bind.port_addresses[slot],
                            input_universe: input,
                            label,
                        });
                    }
                }

                ArtNetProduct {
                    bind_ip,
                    ip_address,
                    last_reply_source,
                    primary_bind_index,
                    mac_address: mac,
                    short_name,
                    long_name,
                    esta_man,
                    oem_code,
                    firmware_version,
                    node_report,
                    status1,
                    status2,
                    ports,
                    last_seen,
                }
            })
            .collect();

        products.sort_by(|a, b| a.bind_ip.cmp(&b.bind_ip));
        products
    }

    /// Returns the number of known devices.
    pub fn len(&self) -> usize {
        self.devices.len()
    }

    /// Returns `true` if no devices are known.
    pub fn is_empty(&self) -> bool {
        self.devices.is_empty()
    }

    /// Removes devices not seen since `cutoff`.
    pub fn prune_stale(&self, cutoff: std::time::Instant) {
        self.devices.retain(|_, v| v.last_seen >= cutoff);
    }
}

impl Default for DeviceRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_device(ip: [u8; 4], bind_index: u8) -> DeviceInfo {
        DeviceInfo {
            mac_address: [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF],
            ip_address: Ipv4Addr::from(ip),
            bind_ip: Ipv4Addr::from(ip),
            bind_index,
            port: 6454,
            short_name: "TestNode".to_string(),
            long_name: "Test Art-Net Node".to_string(),
            node_report: "OK".to_string(),
            firmware_version: 0x0100,
            ubea_version: 0,
            esta_man: 0x0000,
            oem_code: 0x0000,
            net_switch: 0,
            sub_switch: 0,
            num_ports: 2,
            port_types: [0x80, 0x80, 0, 0],
            good_input: [0; 4],
            good_output: [0; 4],
            good_output_b: [0; 4],
            sw_in: [0; 4],
            sw_out: [0; 4],
            status1: 0,
            status2: 0,
            status3: 0,
            acn_priority: 100,
            sw_macro: 0,
            sw_remote: 0,
            style: 0,
            def_resp: [0; 6],
            user: [0; 2],
            refresh_rate: 44,
            port_addresses: vec![0, 1],
            input_port_addresses: vec![],
            last_seen: std::time::Instant::now(),
            last_reply_source: None,
        }
    }

    #[test]
    fn test_device_registry_upsert_and_list() {
        let registry = DeviceRegistry::new();
        assert!(registry.is_empty());

        registry.upsert(sample_device([10, 0, 0, 1], 0));
        registry.upsert(sample_device([10, 0, 0, 2], 0));
        assert_eq!(registry.len(), 2);

        let devices = registry.list_devices();
        assert_eq!(devices.len(), 2);
    }

    #[test]
    fn test_device_registry_multi_port_bind_index() {
        let registry = DeviceRegistry::new();

        registry.upsert(sample_device([10, 0, 0, 1], 0));
        registry.upsert(sample_device([10, 0, 0, 1], 1));
        registry.upsert(sample_device([10, 0, 0, 1], 2));

        assert_eq!(
            registry.len(),
            3,
            "same IP with different BindIndex = separate entries"
        );

        let products = registry.list_products();
        assert_eq!(products.len(), 1, "same IP groups into one product");
        assert_eq!(products[0].len(), 3, "product has 3 bind-index pages");
        assert_eq!(products[0][0].bind_index, 0);
        assert_eq!(products[0][1].bind_index, 1);
        assert_eq!(products[0][2].bind_index, 2);
    }

    #[test]
    fn test_device_registry_list_products_multiple_ips() {
        let registry = DeviceRegistry::new();

        registry.upsert(sample_device([10, 0, 0, 1], 0));
        registry.upsert(sample_device([10, 0, 0, 1], 1));
        registry.upsert(sample_device([10, 0, 0, 2], 0));

        let products = registry.list_products();
        assert_eq!(products.len(), 2);
    }

    #[test]
    fn test_device_registry_prune_stale() {
        let registry = DeviceRegistry::new();
        let mut old_device = sample_device([10, 0, 0, 1], 0);
        old_device.last_seen = std::time::Instant::now() - std::time::Duration::from_secs(60);
        registry.upsert(old_device);
        registry.upsert(sample_device([10, 0, 0, 2], 0));

        assert_eq!(registry.len(), 2);
        registry.prune_stale(std::time::Instant::now() - std::time::Duration::from_secs(10));
        assert_eq!(registry.len(), 1);
    }

    #[test]
    fn test_device_registry_find_subscribers() {
        let registry = DeviceRegistry::new();

        let mut d1 = sample_device([10, 0, 0, 1], 0);
        d1.port_addresses = vec![0x0001, 0x0002];
        d1.input_port_addresses = vec![0x0005];
        registry.upsert(d1);

        let mut d2 = sample_device([10, 0, 0, 2], 0);
        d2.port_addresses = vec![0x0002, 0x0003];
        d2.input_port_addresses = vec![];
        registry.upsert(d2);

        let subs_1 = registry.find_subscribers(0x0001);
        assert_eq!(subs_1.len(), 1);
        assert_eq!(subs_1[0], Ipv4Addr::from([10, 0, 0, 1]));

        let subs_2 = registry.find_subscribers(0x0002);
        assert_eq!(subs_2.len(), 2, "both devices have universe 2");

        let subs_5 = registry.find_subscribers(0x0005);
        assert_eq!(subs_5.len(), 1);
        assert_eq!(subs_5[0], Ipv4Addr::from([10, 0, 0, 1]));

        let subs_99 = registry.find_subscribers(0x0099);
        assert!(subs_99.is_empty());
    }

    #[test]
    fn test_device_registry_upsert_overwrites_same_key() {
        let registry = DeviceRegistry::new();

        let mut d1 = sample_device([10, 0, 0, 1], 0);
        d1.short_name = "OldName".to_string();
        registry.upsert(d1);

        let mut d2 = sample_device([10, 0, 0, 1], 0);
        d2.short_name = "NewName".to_string();
        registry.upsert(d2);

        assert_eq!(registry.len(), 1);
        let devices = registry.list_devices();
        assert_eq!(devices[0].short_name, "NewName");
    }

    fn swisson_like_bind(
        ip: [u8; 4],
        mac: [u8; 6],
        bind_index: u8,
        short: &str,
        universe: u16,
    ) -> DeviceInfo {
        DeviceInfo {
            mac_address: mac,
            ip_address: Ipv4Addr::from(ip),
            bind_ip: Ipv4Addr::from(ip),
            bind_index,
            port: 6454,
            short_name: short.to_string(),
            long_name: "SWISSON XND-8".to_string(),
            node_report: "OK".to_string(),
            firmware_version: 0x0103,
            ubea_version: 0,
            esta_man: 0x5377,
            oem_code: 0x28c1,
            net_switch: 0,
            sub_switch: 0,
            num_ports: 1,
            port_types: [0xc0, 0, 0, 0],
            good_input: [0; 4],
            good_output: [0; 4],
            good_output_b: [0; 4],
            sw_in: [0; 4],
            sw_out: [0; 4],
            status1: 0,
            status2: 0,
            status3: 0,
            acn_priority: 0,
            sw_macro: 0,
            sw_remote: 0,
            style: 0,
            def_resp: [0; 6],
            user: [0; 2],
            refresh_rate: 0,
            port_addresses: vec![universe],
            input_port_addresses: vec![],
            last_seen: std::time::Instant::now(),
            last_reply_source: None,
        }
    }

    #[test]
    fn test_aggregate_products_swisson_eight_binds() {
        let registry = DeviceRegistry::new();
        let ip = [2, 0, 0, 11];
        let mac = [0x28, 0x36, 0x38, 0xc0, 0x64, 0xc5];
        for i in 1u8..=8u8 {
            registry.upsert(swisson_like_bind(
                ip,
                mac,
                i,
                &format!("Port {i}"),
                u16::from(i - 1),
            ));
        }

        let products = registry.aggregate_products();
        assert_eq!(products.len(), 1);
        let p = &products[0];
        assert_eq!(p.ports.len(), 8);
        assert_eq!(p.short_name, "Port 1");
        assert_eq!(p.long_name, "SWISSON XND-8");
        for (i, port) in p.ports.iter().enumerate() {
            assert_eq!(port.bind_index, (i + 1) as u8);
            assert_eq!(port.slot, 0);
            assert_eq!(port.output_universe, i as u16);
            assert_eq!(port.label, format!("Port {}", i + 1));
        }
    }

    #[test]
    fn test_aggregate_products_single_reply_four_ports() {
        let registry = DeviceRegistry::new();
        let mut d = sample_device([10, 0, 0, 1], 0);
        d.num_ports = 4;
        d.port_addresses = vec![0x0000, 0x0001, 0x0002, 0x0003];
        d.short_name = "Quad".to_string();
        registry.upsert(d);

        let products = registry.aggregate_products();
        assert_eq!(products.len(), 1);
        assert_eq!(products[0].ports.len(), 4);
        assert_eq!(products[0].ports[0].label, "Quad · 1");
        assert_eq!(products[0].ports[3].label, "Quad · 4");
    }

    #[test]
    fn test_aggregate_products_bind_ip_unspecified_falls_back_to_ip() {
        let registry = DeviceRegistry::new();
        let mut d = sample_device([10, 0, 0, 1], 0);
        d.bind_ip = Ipv4Addr::UNSPECIFIED;
        registry.upsert(d);

        let products = registry.aggregate_products();
        assert_eq!(products.len(), 1);
        assert_eq!(products[0].bind_ip, Ipv4Addr::from([10, 0, 0, 1]));
    }
}
