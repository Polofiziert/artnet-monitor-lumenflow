# Performance Tuning Guide

## Baseline Metrics

Target performance for LumenFlow:

- **Latency:** <15ms (network packet → rendered pixel)
- **Throughput:** 500+ DMX universes at 44Hz (~22,000 packets/sec)
- **Memory:** <50MB stable state
- **Jitter:** <2ms (inter-packet arrival time variance)
- **UI Responsiveness:** 60 FPS (never drops below 30 FPS during load)

## Benchmarking

### Running Benchmarks

```bash
# Run all benchmarks
cargo bench --all

# Run specific benchmark
cargo bench --bench dmx_throughput

# Output to file
cargo bench -- --output-format bencher | tee output.txt
```

### Key Benchmarks

**1. DMX Throughput (`benches/dmx_throughput.rs`)**

```rust
criterion_group!(benches, dmx_throughput_500_universes);

// Measures: packets/sec, memory allocation rate, latency distribution
```

**2. Art-Net Parser Performance**

```rust
// Zero-copy parsing: should complete in <1µs per packet
```

**3. UI Rendering (SolidJS)**

```bash
pnpm run dev
# Open DevTools → Performance tab
# Record while receiving DMX data
# Target: 60 FPS, <16ms frame time
```

## System-Level Tuning

### macOS

**1. Increase UDP Buffer (for reception)**

```bash
# Temporary
sudo sysctl -w net.inet.udp.recvspace=16777216

# Permanent (add to /etc/sysctl.conf)
net.inet.udp.recvspace=16777216
net.inet.udp.maxdgram=16777216
```

**2. Thread Priority**

```bash
# Run Tauri app with boosted priority
nice -n -10 /Applications/LumenFlow.app/Contents/MacOS/LumenFlow
```

### Linux

**1. Increase Socket Buffers**

```bash
# Temporary
sudo sysctl -w net.core.rmem_max=134217728
sudo sysctl -w net.core.rmem_default=134217728
sudo sysctl -w net.core.wmem_max=134217728

# Permanent (add to /etc/sysctl.d/99-lumenflow.conf)
net.core.rmem_max=134217728
net.core.rmem_default=134217728
net.core.wmem_max=134217728
```

**2. Network Quality of Service**

```bash
# Reserve bandwidth for Art-Net traffic
sudo tc qdisc add dev eth0 root multiq
sudo tc filter add dev eth0 parent 1: protocol ip prio 1 u32 match ip dport 6454 flowid 1:1
```

### Windows

**1. QoS Policy**

- Use Group Policy Editor:
- Local Computer Policy → Computer Configuration → Windows Settings → Security Settings → Quality of Service Policies

## Code-Level Optimizations

### Hot Path Analysis

Identify performance bottlenecks:

```bash
# Flame graph generation (requires cargo-flamegraph)
cargo install flamegraph
cargo flamegraph --bin lumenflow -- --benchmark

# View result
open flamegraph.svg
```

### Ring Buffer Optimization

Current implementation:

```rust
pub struct RingBuffer<T, const N: usize> {
    buffer: Vec<T>,
    write_idx: AtomicUsize,
    read_idx: AtomicUsize,
}
```

**Profiling tip:** If `write_idx` CAS operations have high contention, consider padding to prevent false sharing:

```rust
#[repr(align(64))]  // Cache line size on most CPUs
struct Padded<T>(T);
```

### Memory Allocation Reduction

**Before (allocating):**

```rust
fn process_packet(data: &[u8]) {
    let mut processed = Vec::new();  // Allocation! (Hot path)
    // ... process ...
}
```

**After (pre-allocated):**

```rust
thread_local! {
    static PROCESS_BUFFER: RefCell<Vec<u8>> = RefCell::new(Vec::with_capacity(512));
}

fn process_packet(data: &[u8]) {
    let buf = PROCESS_BUFFER.with(|b| b.borrow_mut());
    buf.clear();
    // ... reuse ...
}
```

### IPC Optimization

**Current: Binary payload, viewport-culled**

```typescript
// Render thread sends only visible universes (~4 universes typically)
// Instead of 32,768 universes
// Result: 4 × 512 bytes × 44 Hz = 88 KB/s
// Instead of 32,768 × 512 bytes × 44 Hz = ~737 MB/s
```

**If IPC becomes bottleneck, next steps:**

1. Increase batching (send every 2 frames instead of 1)
2. Compress with `lz4` or `zstd`
3. Use shared memory (Tauri plugin: `tauri-plugin-shmem`)

## UI Performance

### SolidJS Reactivity Tuning

**Problem:** Too many reactive computations

```typescript
// ❌ Creates signal for every channel
for (let i = 0; i < 512; i++) {
  setChannelValues[i] = createSignal(0);
}

// ✅ Use fine-grained store
const [dmxData, setDmxData] = createStore({
  channels: new Uint8Array(512),
});
```

### Canvas Rendering Optimization

For sparklines (many animated channels):

```typescript
// ❌ DOM-based (slow)
{channels.map(ch => <span>{ch.value}</span>)}

// ✅ Canvas-based (fast)
<canvas id="sparklines" width={1600} height={512} />
// Use requestAnimationFrame to update
```

### Tailwind CSS Performance

```bash
# Purge unused CSS
npm run build  # Vite handles this automatically

# Check CSS file size
du -h dist/*.css
```

## Database Queries (if applicable)

If logging to database in future:

```sql
-- Index on (timestamp, universe_id) for range queries
CREATE INDEX idx_dmx_time_universe
ON dmx_history (timestamp, universe_id);

-- Partition by date for old data archival
PARTITION BY RANGE (YEAR(timestamp)) (
    PARTITION p0 VALUES LESS THAN (2024),
    PARTITION p1 VALUES LESS THAN (2025)
);
```

## Monitoring & Telemetry

### Prometheus Metrics (Optional feature: `metrics`)

```rust
// Enable in Cargo.toml features
[features]
default = ["logging", "metrics"]
profiling = ["metrics", "metrics-exporter-prometheus"]
```

**Exportable metrics:**

- `lumenflow_packets_received_total` (counter)
- `lumenflow_channels_flickering` (gauge)
- `lumenflow_parse_latency_ms` (histogram)
- `lumenflow_buffer_fill_ratio` (gauge 0-100)

### Health Check API

```bash
# If HTTP server enabled:
curl http://localhost:9090/health

# Returns:
{
    "status": "healthy",
    "universes_active": 42,
    "packet_rate": 22000,
    "memory_mb": 28,
    "ui_fps": 60
}
```

## Real-World Load Testing

### Simulating Art-Net Traffic

Use `lumenflow_cli` or third-party generator:

```bash
# Generate 100 universes of test traffic
lumenflow --gen-artnet --universe-count 100 --framerate 44
```

**Monitoring during test:**

```bash
# Terminal 1: Run generator
lumenflow --gen-artnet --universe-count 500

# Terminal 2: Monitor metrics
watch -n 1 'lumenflow --stats'

# Terminal 3: Monitor system
top  # Watch CPU/memory
```

## Profiling Results Interpretation

### Example Flame Graph Analysis

```
100% total CPU
├─ 45% network_receive_thread
│  ├─ 30% artnet_packet_parser    ← Hot function
│  ├─ 10% ringbuffer_write       → Optimize CAS
│  └─ 5% other
├─ 30% render_to_ui_thread
│  ├─ 20% binary_serialization   ← Consider SIMD
│  ├─ 8% tauri_emit
│  └─ 2% other
└─ 25% ui_rendering
   ├─ 15% solidjs_update
   ├─ 8% canvas_redraw
   └─ 2% other
```

**Interpretation:**

- Focus optimizations on largest segments (network_receive > 40%)
- Art-Net parser is the most significant → profile deeper with `cargo-calipers`

## Continuous Performance Monitoring

GitHub Actions automation:

```bash
# .github/workflows/benchmarks.yml runs:
cargo bench -- --output-format bencher | tee output.txt

# Stores results in benchmark-results branch
# Compare across commits
```

View at: `github.com/lumenflow/lumenflow/actions/workflows/benchmarks.yml`

---

**Remember:** Optimize iteratively. Measure → Profile → Optimize → Remeasure.

_Next read: [DEPLOYMENT.md](DEPLOYMENT.md) for production considerations._
