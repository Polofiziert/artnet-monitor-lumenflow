import { createSignal } from "solid-js";
import { createEffect } from "solid-js";
import { onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { RouteInfo } from "./useRouteInfo";

/** Chart-relevant subset of NetworkStats for NetworkDiagnostics */
export interface ChartNetworkStats {
  networkLoadMbps: number[];
  jitterSamples: number[];
}

const NET_LOAD_HISTORY_LEN = 120;
const JITTER_SAMPLE_COUNT = 80;
const ARTDMX_BYTES = 530;

/** Mbps = (packets/sec) × (bytes/packet) × (bits/byte) / 1e6 */
function ppsToMbps(pps: number): number {
  return (pps * ARTDMX_BYTES * 8) / 1e6;
}

function shiftPush(arr: number[], value: number): void {
  if (arr.length < 1) return;
  arr.copyWithin(0, 1);
  arr[arr.length - 1] = value;
}

function pushOrShift(arr: number[], value: number, maxLen: number): void {
  if (arr.length < maxLen) {
    arr.push(value);
  } else {
    shiftPush(arr, value);
  }
}

function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random();
  return (
    mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  );
}

/** Dedupe by universeId, sum packetsPerSecond across universes (same as StatusBar) */
function aggregatePacketRate(routeInfo: RouteInfo[]): number {
  const byUni = new Map<number, number>();
  for (const r of routeInfo) {
    if (!byUni.has(r.universeId)) byUni.set(r.universeId, r.packetsPerSecond);
  }
  return [...byUni.values()].reduce((a, b) => a + b, 0);
}

export interface UseNetworkStatsOptions {
  isMockMode: () => boolean;
  routeInfo: () => RouteInfo[];
  availableUniverses: () => number[];
  emitRate: () => number;
  packetRate: () => number;
}

/**
 * Derives chart-relevant network stats from route-info (real mode) or mock params (mock mode).
 * Real mode: packet rate and load from route-info; jitter empty until Phase 2 backend.
 * Mock mode: packet rate and load from mock tick; synthetic jitter for demo.
 */
export function useNetworkStats(
  options: UseNetworkStatsOptions
): () => ChartNetworkStats {
  const [chartStats, setChartStats] = createSignal<ChartNetworkStats>({
    networkLoadMbps: [],
    jitterSamples: [],
  });

  /** Backend jitter samples from jitter-samples event (real mode only) */
  const [backendJitterSamples, setBackendJitterSamples] = createSignal<
    number[]
  >([]);

  onMount(async () => {
    const unlisten = await listen<number[]>("jitter-samples", (event) => {
      setBackendJitterSamples(
        Array.isArray(event.payload) ? event.payload : []
      );
    });
    onCleanup(() => unlisten());
  });

  /** Real-mode load history; cleared when switching from mock to avoid stale mock data */
  const realLoadHistory: number[] = [];

  createEffect(() => {
    const mock = options.isMockMode();
    let pps: number;
    if (mock) {
      pps = options.packetRate();
    } else {
      pps = aggregatePacketRate(options.routeInfo());
    }

    const loadMbps = ppsToMbps(pps);

    if (mock) {
      setChartStats((prev) => {
        const newLoad = [...prev.networkLoadMbps];
        const newJitter = [...prev.jitterSamples];
        pushOrShift(newLoad, loadMbps, NET_LOAD_HISTORY_LEN);
        const emitRate = options.emitRate();
        const meanInterval = emitRate > 0 ? 1000 / emitRate : 22.7;
        const jitter = Math.max(0, gaussianRandom(meanInterval, 1.2));
        pushOrShift(newJitter, jitter, JITTER_SAMPLE_COUNT);
        return { networkLoadMbps: newLoad, jitterSamples: newJitter };
      });
      return;
    }

    // Real mode
    if (pps === 0) {
      realLoadHistory.length = 0;
      setChartStats({ networkLoadMbps: [], jitterSamples: [] });
      return;
    }

    pushOrShift(realLoadHistory, loadMbps, NET_LOAD_HISTORY_LEN);
    setChartStats({
      networkLoadMbps: [...realLoadHistory],
      jitterSamples: backendJitterSamples(),
    });
  });

  return chartStats;
}
