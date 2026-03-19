# IPC API Contract — Detailed Reference

This file supplements `docs/IPC_API_CONTRACT.md` with implementation details.

## Rust: Building dmx-frame Payload

```rust
// In start_emit_loop
let mut dmx_payload = Vec::with_capacity(count * 516);
for id_ref in active_ids.iter() {
    let id = *id_ref;
    if universe_store.snapshot(id, &mut snapshot_buf) {
        dmx_payload.extend_from_slice(&id.to_le_bytes());
        dmx_payload.extend_from_slice(&512u16.to_le_bytes());
        dmx_payload.extend_from_slice(&snapshot_buf);
    }
}
app_handle.emit("dmx-frame", &dmx_payload);
```

## TypeScript: Parsing dmx-frame

```typescript
function parseDmxFrame(raw: number[]): DmxFrame[] {
  const buf = new Uint8Array(raw);
  const view = new DataView(buf.buffer);
  const frames: DmxFrame[] = [];
  let offset = 0;
  while (offset + 4 <= buf.length) {
    const universeId = view.getUint16(offset, true);
    const len = view.getUint16(offset + 2, true);
    offset += 4;
    if (offset + len > buf.length) break;
    frames.push({ universeId, data: buf.slice(offset, offset + len) });
    offset += len;
  }
  return frames;
}
```

## Rust: Building universe-metrics Payload

```rust
let sync_active = if sync_detector.is_active(now_nanos) { 1u8 } else { 0u8 };
metrics_payload.push(sync_active);
for id_ref in active_ids.iter() {
    if let Some((staleness, source_count, seq_errors, has_nzs)) = universe_store.slot_metrics(id) {
        let staleness_byte = match staleness {
            Staleness::Active => 0,
            Staleness::Stale => 1,
            Staleness::Disconnected => 2,
        };
        metrics_payload.extend_from_slice(&id.to_le_bytes());
        metrics_payload.push(staleness_byte);
        metrics_payload.push(source_count);
        metrics_payload.extend_from_slice(&(seq_errors as u32).to_le_bytes());
        metrics_payload.push(if has_nzs { 1 } else { 0 });
    }
}
```

## TypeScript: Parsing universe-metrics

```typescript
function parseUniverseMetrics(raw: number[]): UniverseMetricsState {
  const buf = new Uint8Array(raw);
  const view = new DataView(buf.buffer);
  const metrics: Record<number, UniverseMetric> = {};
  if (buf.length < 1) return { syncActive: false, metrics };
  const syncActive = buf[0] !== 0;
  let offset = 1;
  while (offset + 9 <= buf.length) {
    // Must be 9, not 8 — each record is 9 bytes
    const id = view.getUint16(offset, true);
    const staleness = Math.min(2, Math.max(0, buf[offset + 2]!)) as Staleness;
    const sourceCount = buf[offset + 3]!;
    const sequenceErrors = view.getUint32(offset + 4, true);
    const hasNzs = buf[offset + 8]! !== 0;
    metrics[id] = { staleness, sourceCount, sequenceErrors, hasNzs };
    offset += 9;
  }
  return { syncActive, metrics };
}
```

## Known Gaps (Mock vs Real)

| Gap                   | Mock Has                                             | Real Missing | Action                                                |
| --------------------- | ---------------------------------------------------- | ------------ | ----------------------------------------------------- |
| Routes                | RouteInfo[] (sourceIp, pkt/s, lastSeen per universe) | —            | Add `route-info` event or derive from UniverseStore   |
| Source IPs with roles | sourceIps: { ip, role }[]                            | —            | Derive from SyncDetector + SourceTracker or add event |
| Network stats         | jitter, load, packet rate                            | —            | Add `network-stats` event (future)                    |
