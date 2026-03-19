import { createStore, reconcile } from "solid-js/store";
import { onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";

export interface RouteInfo {
  universeId: number;
  sourceIp: string;
  packetsPerSecond: number;
  lastSeen: number;
}

/**
 * Converts IPv4 u32 (network byte order) to "a.b.c.d" string.
 */
function ipU32ToString(ip: number): string {
  return `${(ip >>> 24) & 0xff}.${(ip >>> 16) & 0xff}.${(ip >>> 8) & 0xff}.${ip & 0xff}`;
}

/**
 * Parses the binary route-info payload from the backend.
 * Format: per universe [u16 LE id, u32 LE src_a_ip, u32 LE src_b_ip, u32 LE pkt_per_sec, u64 LE last_nanos]
 * Each source IP (if non-zero) produces one RouteInfo entry.
 */
function parseRouteInfo(raw: number[]): RouteInfo[] {
  const buf = new Uint8Array(raw);
  const view = new DataView(buf.buffer);
  const routes: RouteInfo[] = [];
  let offset = 0;

  while (offset + 22 <= buf.length) {
    const id = view.getUint16(offset, true);
    const srcA = view.getUint32(offset + 2, true);
    const srcB = view.getUint32(offset + 6, true);
    const pktPerSec = view.getUint32(offset + 10, true);
    const lastNanos = Number(view.getBigUint64(offset + 14, true));
    offset += 22;

    const lastSeenMs = Math.floor(lastNanos / 1_000_000);

    if (srcA !== 0) {
      routes.push({
        universeId: id,
        sourceIp: ipU32ToString(srcA),
        packetsPerSecond: pktPerSec,
        lastSeen: lastSeenMs,
      });
    }
    if (srcB !== 0 && srcB !== srcA) {
      routes.push({
        universeId: id,
        sourceIp: ipU32ToString(srcB),
        packetsPerSecond: pktPerSec,
        lastSeen: lastSeenMs,
      });
    }
  }

  return routes;
}

/**
 * Listens to the route-info Tauri event and exposes RouteInfo[] for the Routing Matrix.
 */
export function useRouteInfo() {
  const [routes, setRoutes] = createStore<RouteInfo[]>([]);

  onMount(async () => {
    const unlisten = await listen<number[]>("route-info", (event) => {
      const parsed = parseRouteInfo(event.payload);
      setRoutes(reconcile(parsed));
    });

    onCleanup(() => unlisten());
  });

  return routes;
}
