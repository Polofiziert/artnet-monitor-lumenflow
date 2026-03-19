import { createStore, produce } from "solid-js/store";
import { onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";

/** Staleness: 0=Active, 1=Stale, 2=Disconnected */
export type Staleness = 0 | 1 | 2;

export interface UniverseMetric {
  staleness: Staleness;
  sourceCount: number;
  sequenceErrors: number;
  hasNzs: boolean;
}

export interface UniverseMetricsState {
  syncActive: boolean;
  /** Sync source IPv4 as u32 (network byte order), or 0 if none. */
  syncSourceIp: number;
  metrics: Record<number, UniverseMetric>;
}

/**
 * Parses the binary universe-metrics payload from the backend.
 * Format: [u8 sync_active][u32 LE sync_source_ip] then per universe [u16 id LE, u8 staleness, u8 source_count, u32 seq_errors LE, u8 has_nzs]
 */
function parseUniverseMetrics(raw: number[]): UniverseMetricsState {
  const buf = new Uint8Array(raw);
  const view = new DataView(buf.buffer);
  const metrics: Record<number, UniverseMetric> = {};

  if (buf.length < 5) return { syncActive: false, syncSourceIp: 0, metrics };

  const syncActive = buf[0] !== 0;
  const syncSourceIp = view.getUint32(1, true);
  let offset = 5;

  while (offset + 9 <= buf.length) {
    const id = view.getUint16(offset, true);
    const staleness = Math.min(2, Math.max(0, buf[offset + 2]!)) as Staleness;
    const sourceCount = buf[offset + 3]!;
    const sequenceErrors = view.getUint32(offset + 4, true);
    const hasNzs = buf[offset + 8]! !== 0;
    offset += 9;

    metrics[id] = { staleness, sourceCount, sequenceErrors, hasNzs };
  }

  return { syncActive, syncSourceIp, metrics };
}

/**
 * Listens to the universe-metrics Tauri event and exposes sync status
 * and per-universe metrics (staleness, source count, sequence errors).
 */
export function useUniverseMetrics() {
  const [state, setState] = createStore<UniverseMetricsState>({
    syncActive: false,
    syncSourceIp: 0,
    metrics: {},
  });

  onMount(async () => {
    const unlisten = await listen<number[]>("universe-metrics", (event) => {
      const parsed = parseUniverseMetrics(event.payload);
      setState(
        produce((s) => {
          s.syncActive = parsed.syncActive;
          s.syncSourceIp = parsed.syncSourceIp;
          s.metrics = parsed.metrics;
        })
      );
    });

    onCleanup(() => unlisten());
  });

  return state;
}
