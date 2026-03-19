use std::collections::BTreeMap;
use std::net::Ipv4Addr;

use dashmap::DashMap;

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

        assert_eq!(registry.len(), 3, "same IP with different BindIndex = separate entries");

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
}
