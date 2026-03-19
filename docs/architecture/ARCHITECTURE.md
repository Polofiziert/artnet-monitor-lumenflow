# LumenFlow Architecture

## High-Level Overview

LumenFlow is a Tauri-based desktop application with a performance-optimized Rust backend for Art-Net protocol processing. The system is designed for <15ms latency and supports 500+ DMX universes at 44Hz.

```
┌─────────────────────────────────────────────────────────────┐
│                     SolidJS Frontend                          │
│           (Responsive UI, Real-time Visualization)            │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ Binary IPC (Viewport-Culled)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Bridge v2                            │
│            (High-performance Command Channels)                │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ Tokio Runtime
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                Rust Backend (Tokio)                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Render Thread        Device PollThread   Network Thread│  │
│  │ (44Hz viewport)      (Art-Addr, Poll)   (Raw UDP)      │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ▲                                           ▲
         │ HTTP/WebSocket (CLI/External)            │ UDP/6454
         ▼                                           ▼
    ┌─────────┐                            ┌───────────────┐
    │  CLI    │                            │  Art-Net      │
    │  Tools  │                            │  Network      │
    └─────────┘                            └───────────────┘
```

## Core Components

### 1. `lumenflow_core` - Protocol Engine

**Responsibility:** Zero-allocation Art-Net framework

- **UDP Socket Management:** Configured with kernel buffers (SO_RCVBUF 8MB+)
- **Ring Buffers:** Lock-free, pre-allocated circular buffers for 512-channel DMX data
- **Art-Net Parsing:** Zero-copy deserialization using `zerocopy` crate
- **Concurrency Model:** `tokio::task` actors with crossbeam channels

**Key Data Structures:**

```rust
pub struct UniverseBuffer {
    universe_id: u16,
    current_data: [u8; 512],
    history: RingBuffer<[u8; 512], 100>,  // Lock-free
    metrics: AtomicMetrics,
}

pub struct MetricsEngine {
    ipat_ema: f64,  // Exponential Moving Average of Inter-Packet Arrival Time
    flicker_score: f64,
}
```

**Performance Constraints:**

- No heap allocations in the network receive thread (hot path)
- Pre-allocated memory pools for all buffers
- Atomic operations only (no mutexes in hot path)

### 2. `lumenflow_ui` - Tauri Desktop Application

**Frontend (SolidJS):**

- Fine-grained reactivity with `createSignal` and `createStore`
- Viewport-aware subscriptions (only request data user can see)
- Canvas-based rendering for sparklines and heatmaps

**Tauri Backend:**

- Command handlers for device control
- Event emitters for real-time data
- Binary IPC for DMX payload

### 3. `lumenflow_cli` - Command-Line Interface

Standalone tools for:

- Network introspection
- Packet replay/capture
- Device configuration
- Diagnostic logging

## Data Flow Architecture

### Inbound Flow (Network → UI)

```
1. UDP Packet (Art-Net) arrives at port 6454
   ↓
2. Network thread reads into pre-allocated buffer (zero-alloc)
   ↓
3. Art-Net parser validates header and extracts universe_id, data
   ↓
4. Write to UniverseBuffer[universe_id] via CAS (Compare-And-Swap)
   ↓
5. Render thread (44Hz) reads subscribed universes
   ↓
6. Serialize to binary format
   ↓
7. Emit via Tauri event to SolidJS
   ↓
8. SolidJS updates only changed signals (fine-grained reactivity)
   ↓
9. Canvas or DOM updates efficiently
```

### Outbound Flow (UI → Network)

```
1. User interaction (e.g., set Art-Address)
   ↓
2. SolidJS command: invoke_artaddress_command()
   ↓
3. Tauri command handler → Rust logic
   ↓
4. Generate Art-Address packet
   ↓
5. Send via UDP socket (broadcast)
   ↓
6. Device receives and reconfigures universe mapping
```

## Threading Model

| Thread            | Purpose                                | Scheduling                  |
| ----------------- | -------------------------------------- | --------------------------- |
| **Network RX**    | UDP receive, Art-Net parsing           | Tokio (event-driven)        |
| **Render (44Hz)** | Viewport culling, binary serialization | Tokio interval timer        |
| **Device Poll**   | ArtPoll emission, registry updates     | Tokio interval timer (2.5s) |
| **UI Event Loop** | Tauri/SolidJS                          | OS event loop               |
| **CLI**           | Standalone process                     | Sequential                  |

## IPC Optimization Strategy

**Problem:** JSON serialization overhead for 500 universes × 512 bytes at 44Hz = enormous CPU usage.

**Solution: Viewport Culling**

```typescript
// Frontend subscriptions (SolidJS):
const [visibleUniverses, setVisibleUniverses] = createSignal([0, 1, 2, 3]);

// Rust render thread only processes and sends these:
fn render_to_frontend(visible_ids: Vec<u16>) {
    for id in visible_ids {
        let data = universe_buffers[id].read();
        // Send binary payload, NOT JSON
    }
}
```

**Binary Payload Format:**

- Header: universe_id (u16), timestamp (u64), fps (u8)
- Data: 512 bytes DMX values (Uint8Array)
- Metrics: jitter_ms (f32), flicker_score (f32)

## Performance Targets & Measurements

| Metric                   | Target         | How to Verify                |
| ------------------------ | -------------- | ---------------------------- |
| Latency (packet → pixel) | <15ms          | `cargo bench dmx_throughput` |
| Jitter                   | <2ms           | Oscilloscope view in UI      |
| Memory (500 universes)   | <50MB          | Profiling tools              |
| Throughput               | 22,000 pkt/sec | Load test generator          |
| UI responsiveness        | 60 FPS         | Monitor refresh rate         |

## Error Handling Strategy

**Network Errors:**

- Malformed packets: discard, log, update error counter (non-fatal)
- Network outages: graceful degradation (UI shows "disconnected")
- Buffer overflow: ring buffer automatically drops oldest frame

**Rust Panic Policy:**

- `#![deny(clippy::unwrap_used)]` - No unwrap() in production code
- All errors propagated via `Result<T, E>`
- Structured logging with `tracing` crate

## Security Considerations

1. **Input Validation:** All Art-Net packets validated against protocol spec
2. **Privilege Isolation:** Network socket runs with minimal privileges (not root)
3. **PCAP Recorder:** Optional, controlled via feature flag
4. **Update Signing:** Tauri auto-update signed (future)

## Extensibility Points

### Plugin System (Future)

- `lumenflow_core` exposed as a library crate
- External CLI tools can use Art-Net engine
- RDM plugin system (Remote Device Management)

### Configuration

- **Network settings:** Persisted in `{app_config_dir}/network.json` (platform-specific via Tauri `app.path().app_config_dir()`). Includes interface mode (auto/manual), preferred IP CIDR, discovery targets (spec, subnet, custom, unicast). Applied on change; listener and discovery restart automatically.
- **Future:** User settings in unified `config.json`; workspace layouts; hotkey profiles.

## Testing Strategy

| Level           | Framework                           | Coverage                    |
| --------------- | ----------------------------------- | --------------------------- |
| **Unit**        | `cargo test`                        | Individual parsers, metrics |
| **Integration** | `cargo test --test '*'`             | Multi-channel scenarios     |
| **UI**          | `vitest` + `@testing-library/solid` | Component logic             |
| **Performance** | `cargo bench` (Criterion)           | Throughput, latency         |
| **E2E**         | Manual (Tauri testing limited)      | Full workflow               |

---

**Architecture Revision History:**

- v0.1.0 (Current): Core protocol engine + Tauri + SolidJS
- v0.2.0 (Planned): RDM support, plugin API
- v1.0.0 (Target): Mobile PWA, cluster monitoring
