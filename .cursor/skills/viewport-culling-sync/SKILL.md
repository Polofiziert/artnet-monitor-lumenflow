---
name: viewport-culling-sync
description: Implement viewport-culled DMX data sync between Rust backend and SolidJS frontend via Tauri IPC. Use when syncing DMX universe data to the UI, implementing IPC throttling, emitting Tauri events for visible universes, or bridging lumenflow_core with the frontend.
---

# Viewport-Culling Sync

Sync DMX data from the Rust backend to the SolidJS frontend without saturating the Tauri IPC bridge. Only universes the user is currently viewing are emitted, at a fixed 60Hz cadence.

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Frontend (SolidJS)                             │
│                                                 │
│  visible universes ──invoke──▶ set_active_ids   │
│  listen("dmx-frame") ◀──event── binary payload  │
└─────────────────────────────────────────────────┘
                        │ IPC │
┌─────────────────────────────────────────────────┐
│  Backend (Rust · Tauri)                         │
│                                                 │
│  ViewportCuller {                               │
│      active_ids: Arc<DashSet<u16>>              │
│      tick_interval: 16.67ms (60 Hz)             │
│  }                                              │
│                                                 │
│  UDP rx loop ──▶ DashMap<u16, UniverseBuffer>   │
│                      │                          │
│  emit_loop ──reads──▶ only active_ids ──emit──▶ │
└─────────────────────────────────────────────────┘
```

## Rust Backend Implementation

### 1. Shared State

Store DMX snapshots in a `DashMap` keyed by universe ID. Use `DashSet` for the active viewport set.

```rust
use dashmap::DashMap;
use dashmap::DashSet;
use std::sync::Arc;

pub struct AppState {
    pub universes: Arc<DashMap<u16, [u8; 512]>>,
    pub active_ids: Arc<DashSet<u16>>,
}
```

Register it in Tauri `.manage()`:

```rust
let state = AppState {
    universes: Arc::new(DashMap::new()),
    active_ids: Arc::new(DashSet::new()),
};

tauri::Builder::default()
    .manage(state)
    // ...
```

### 2. Tauri Command — `set_active_universes`

The frontend calls this whenever the visible universe list changes (scroll, tab switch, filter).

```rust
#[tauri::command]
fn set_active_universes(
    ids: Vec<u16>,
    state: tauri::State<'_, AppState>,
) {
    state.active_ids.clear();
    for id in ids {
        state.active_ids.insert(id);
    }
}
```

Register with `.invoke_handler(tauri::generate_handler![set_active_universes])`.

### 3. Emit Loop — 60Hz Ticker

Spawn a dedicated `tokio::task` that ticks at 60Hz. On each tick, build a **single binary payload** containing only the active universes and emit it as one Tauri event.

```rust
use std::time::Duration;
use tokio::time;

fn start_emit_loop(app_handle: tauri::AppHandle, state: AppState) {
    let universes = state.universes.clone();
    let active_ids = state.active_ids.clone();

    tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_micros(16_667));
        interval.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            if active_ids.is_empty() {
                continue;
            }

            let payload = build_binary_frame(&universes, &active_ids);
            if !payload.is_empty() {
                let _ = app_handle.emit("dmx-frame", &payload);
            }
        }
    });
}
```

### 4. Binary Frame Format

Pack multiple universes into a single `Vec<u8>` to minimize IPC overhead. Each universe entry is **516 bytes**: 2-byte LE universe ID + 2-byte LE length + 512 bytes DMX data.

```rust
fn build_binary_frame(
    universes: &DashMap<u16, [u8; 512]>,
    active_ids: &DashSet<u16>,
) -> Vec<u8> {
    let count = active_ids.len();
    let mut buf = Vec::with_capacity(count * 516);

    for id_ref in active_ids.iter() {
        let id = *id_ref;
        if let Some(data) = universes.get(&id) {
            buf.extend_from_slice(&id.to_le_bytes());
            buf.extend_from_slice(&512u16.to_le_bytes());
            buf.extend_from_slice(data.value());
        }
    }
    buf
}
```

### 5. Critical Constraints

| Rule                       | Rationale                                                        |
| -------------------------- | ---------------------------------------------------------------- |
| `MissedTickBehavior::Skip` | Never queue up stale frames                                      |
| `DashSet` for active IDs   | Lock-free reads from emit loop while frontend writes via command |
| Single `dmx-frame` event   | One event per tick, not one per universe — reduces IPC syscalls  |
| Binary payload (`Vec<u8>`) | Avoid JSON serialization of 512-byte arrays                      |
| `continue` when empty      | Zero cost when no universes are visible                          |

## Frontend Implementation

### 1. Listen for Binary Frames

```typescript
import { listen } from "@tauri-apps/api/event";

interface DmxFrame {
  universeId: number;
  data: Uint8Array;
}

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
    frames.push({
      universeId,
      data: buf.slice(offset, offset + len),
    });
    offset += len;
  }
  return frames;
}
```

### 2. Register Active Universes

Call `set_active_universes` whenever the visible set changes. Debounce to avoid spamming the command.

```typescript
import { invoke } from "@tauri-apps/api/core";

async function updateActiveUniverses(ids: number[]): Promise<void> {
  await invoke("set_active_universes", { ids });
}
```

### 3. SolidJS Integration Pattern

```typescript
import { createSignal, onCleanup, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

function useDmxStream(activeIds: () => number[]) {
  const [universeData, setUniverseData] = createStore<
    Record<number, Uint8Array>
  >({});

  onMount(async () => {
    const unlisten = await listen<number[]>("dmx-frame", (event) => {
      const frames = parseDmxFrame(event.payload);
      for (const frame of frames) {
        setUniverseData(frame.universeId, frame.data);
      }
    });

    onCleanup(() => unlisten());
  });

  // Re-register active universes reactively
  createEffect(() => {
    updateActiveUniverses(activeIds());
  });

  return universeData;
}
```

## File Locations

| File                                                   | Purpose                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `crates/lumenflow_ui/src-tauri/src/viewport_culler.rs` | `AppState`, `set_active_universes`, `start_emit_loop`, `build_binary_frame` |
| `crates/lumenflow_ui/src-tauri/src/main.rs`            | Register state, command handler, spawn emit loop in `setup()`               |
| `crates/lumenflow_ui/src/hooks/useDmxStream.ts`        | `parseDmxFrame`, `updateActiveUniverses`, `useDmxStream`                    |
| `crates/lumenflow_core/src/buffer.rs`                  | `UniverseBuffer` (existing — source of DMX snapshots)                       |

## Testing Checklist

```
- [ ] Emit loop idles (zero CPU) when active_ids is empty
- [ ] Frame rate stays at 60Hz ± 1ms under load (tokio::time::Instant assertions)
- [ ] Binary frame round-trips correctly (Rust build → JS parse → correct universe IDs + data)
- [ ] Switching active_ids mid-stream immediately changes which universes are emitted
- [ ] No panic or error when a universe in active_ids has no data yet in DashMap
- [ ] Payload size = N × 516 bytes for N active universes
```
