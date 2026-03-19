# Core Library API Reference

## Overview

`lumenflow_core` is the high-performance Art-Net protocol engine library.

## Main Structs

### ArtNetParser

Parses Art-Net UDP packets with zero-copy semantics.

```rust
pub struct ArtNetParser;

impl ArtNetParser {
    pub fn parse(payload: &[u8]) -> Result<ArtNetPacket, ParseError>;
}

pub struct ArtNetPacket {
    pub opcode: OpCode,
    pub universe_id: u16,
    pub sequence: u8,
    pub physical: u8,
    pub data: &'static [u8; 512],
}
```

### UniverseManager

Manages 32,768 DMX universes with ring buffers.

```rust
pub struct UniverseManager {
    buffers: Vec<UniverseBuffer>,
    device_registry: Arc<DashMap<DeviceAddress, DeviceInfo>>,
}

impl UniverseManager {
    pub fn new() -> Self;
    pub fn write_universe(&self, id: u16, data: &[u8; 512]) -> Result<()>;
    pub fn read_universe(&self, id: u16) -> Result<[u8; 512]>;
    pub fn get_metrics(&self, id: u16) -> Metrics;
}
```

### MetricsEngine

Computes real-time metrics on DMX data.

```rust
pub struct Metrics {
    pub fps: f32,
    pub jitter_ms: f32,
    pub flicker_score: f32,
    pub data_loss_percent: f32,
}
```

## Features

Enable in `Cargo.toml`:

```toml
lumenflow_core = { version = "0.1", features = ["logging", "metrics", "pcap-export"] }
```

- `logging`: Structured logging with `tracing`
- `metrics`: Prometheus metrics export
- `pcap-export`: Save packets to Wireshark files
- `rdm-support`: RDM protocol (Remote Device Management)

## Examples

See [crates/lumenflow_core/examples/](https://github.com/lumenflow/lumenflow/tree/main/crates/lumenflow_core/examples)

---

_For detailed architecture, see [docs/architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md)_
