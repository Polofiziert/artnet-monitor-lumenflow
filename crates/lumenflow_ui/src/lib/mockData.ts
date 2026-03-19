import type { DeviceInfoDto } from "../components/DeviceList";

export interface MockUniverse {
  id: number;
  channels: number[];
  /** Pre-allocated snapshot to avoid per-tick array spreading */
  snapshot: number[];
  sourceIp: string;
  packetsPerSecond: number;
  lastSeen: number;
}

export interface NetworkStats {
  jitterSamples: number[];
  artSyncActive: boolean;
  sourceIps: { ip: string; role: "master" | "backup" | "secondary" }[];
  flickerChannels: number[];
  packetRateHistory: number[];
  networkLoadMbps: number[];
}

const CHANNEL_COUNT = 512;
const JITTER_SAMPLE_COUNT = 80;
const RATE_HISTORY_LEN = 120;
const NET_LOAD_HISTORY_LEN = 120;

type PatternFn = (channel: number, time: number) => number;

const patterns: Record<string, PatternFn> = {
  sine: (ch, t) => Math.round(127.5 + 127.5 * Math.sin(t * 0.002 + ch * 0.05)),
  chase: (ch, t) => {
    const pos = (t * 0.05) % CHANNEL_COUNT;
    const dist = Math.abs(ch - pos);
    return dist < 8 ? Math.round(255 * Math.max(0, 1 - dist / 8)) : 0;
  },
  random: (_ch, _t) => Math.round(Math.random() * 255),
  strobe: (_ch, t) => (Math.floor(t * 0.01) % 2 === 0 ? 255 : 0),
  gradient: (ch, _t) => Math.round((ch / CHANNEL_COUNT) * 255),
  dimmer: (ch, t) => {
    const group = Math.floor(ch / 4);
    return Math.round(127.5 + 127.5 * Math.sin(t * 0.001 + group * 0.3));
  },
  flicker: (ch, t) => {
    const base = Math.round(127.5 + 127.5 * Math.sin(t * 0.003 + ch * 0.1));
    return Math.random() > 0.95
      ? Math.min(255, base + Math.round(Math.random() * 60))
      : base;
  },
  static: (ch, _t) => (ch % 3 === 0 ? 200 : ch % 3 === 1 ? 100 : 0),
};

const PATTERN_KEYS = Object.keys(patterns);

/** GrandMA 3 #1 (master) and #2 (backup) — both send same 8 universes in Backup mode */
export const GRANDMA3_MASTER_IP = "192.168.1.10";
export const GRANDMA3_BACKUP_IP = "192.168.1.20";

function assignPattern(universeIndex: number): PatternFn {
  const key = PATTERN_KEYS[universeIndex % PATTERN_KEYS.length]!;
  return patterns[key]!;
}

export function createMockUniverses(count: number): MockUniverse[] {
  const universes: MockUniverse[] = [];
  for (let i = 0; i < count; i++) {
    const channels = new Array<number>(CHANNEL_COUNT).fill(0);
    const snapshot = new Array<number>(CHANNEL_COUNT).fill(0);
    universes.push({
      id: i,
      channels,
      snapshot,
      sourceIp: GRANDMA3_MASTER_IP,
      packetsPerSecond: 40 + Math.floor(Math.random() * 5),
      lastSeen: Date.now(),
    });
  }
  return universes;
}

/**
 * Copy channels into the pre-allocated snapshot buffer.
 * Avoids `[...mu.channels]` which allocates a new 512-element array every tick.
 */
export function snapshotChannels(mu: MockUniverse): number[] {
  const src = mu.channels;
  const dst = mu.snapshot;
  for (let i = 0; i < CHANNEL_COUNT; i++) dst[i] = src[i]!;
  return dst;
}

export function tickMockUniverses(
  universes: MockUniverse[],
  time: number
): void {
  for (let u = 0; u < universes.length; u++) {
    const pattern = assignPattern(u);
    const uni = universes[u]!;
    const chans = uni.channels;
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      chans[ch] = pattern(ch, time);
    }
    uni.packetsPerSecond = 40 + Math.floor(Math.random() * 5);
    uni.lastSeen = Date.now();
  }
}

function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random() || 0.0001;
  const u2 = Math.random();
  return (
    mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  );
}

export function createMockNetworkStats(): NetworkStats {
  const jitterSamples: number[] = [];
  for (let i = 0; i < JITTER_SAMPLE_COUNT; i++) {
    jitterSamples.push(Math.max(0, gaussianRandom(22.7, 1.2)));
  }

  return {
    jitterSamples,
    artSyncActive: true,
    sourceIps: [
      { ip: GRANDMA3_MASTER_IP, role: "master" },
      { ip: GRANDMA3_BACKUP_IP, role: "backup" },
    ],
    flickerChannels: [47, 128, 391],
    packetRateHistory: Array.from(
      { length: RATE_HISTORY_LEN },
      () => 40 + Math.floor(Math.random() * 5)
    ),
    networkLoadMbps: Array.from(
      { length: NET_LOAD_HISTORY_LEN },
      (_, i) => 2.5 + 1.5 * Math.sin(i * 0.08) + Math.random() * 0.3
    ),
  };
}

/** Empty stats for real mode when no traffic — shows "Waiting for..." in Network Diagnostics */
export function createEmptyNetworkStats(): NetworkStats {
  return {
    jitterSamples: [],
    artSyncActive: false,
    sourceIps: [],
    flickerChannels: [],
    packetRateHistory: [],
    networkLoadMbps: [],
  };
}

function shiftPush(arr: number[], value: number): void {
  arr.copyWithin(0, 1);
  arr[arr.length - 1] = value;
}

export function tickMockNetworkStats(stats: NetworkStats, time: number): void {
  const jitter = Math.abs(gaussianRandom(22.7, time % 5000 < 200 ? 3.5 : 1.2));
  shiftPush(stats.jitterSamples, jitter);

  shiftPush(stats.packetRateHistory, 40 + Math.floor(Math.random() * 5));

  const load = 2.5 + 1.5 * Math.sin(time * 0.0003) + Math.random() * 0.3;
  shiftPush(stats.networkLoadMbps, load);

  if (Math.random() > 0.98) {
    const ch = Math.floor(Math.random() * 512);
    if (
      stats.flickerChannels.length < 6 &&
      !stats.flickerChannels.includes(ch)
    ) {
      stats.flickerChannels.push(ch);
    }
  }
  if (Math.random() > 0.99 && stats.flickerChannels.length > 1) {
    stats.flickerChannels.shift();
  }
}

export function createMockDevices(): DeviceInfoDto[] {
  return [
    {
      ip_address: GRANDMA3_MASTER_IP,
      mac_address: "00:1A:2B:3C:4D:5E",
      short_name: "GrandMA 3 #1",
      long_name: "MA Lighting grandMA 3 - Master (FOH)",
      firmware_version: 0x0312,
      esta_man: 0x0043,
      oem_code: 0x0431,
      port_addresses: [],
      online: true,
    },
    {
      ip_address: GRANDMA3_BACKUP_IP,
      mac_address: "AA:BB:CC:DD:EE:01",
      short_name: "GrandMA 3 #2",
      long_name: "MA Lighting grandMA 3 - Backup",
      firmware_version: 0x0312,
      esta_man: 0x0043,
      oem_code: 0x0431,
      port_addresses: [],
      online: true,
    },
    {
      ip_address: "192.168.1.101",
      mac_address: "00:04:20:01:00:01",
      short_name: "Swisson XND-8 #1",
      long_name: "Swisson XND-8 Artnet Node - Stage Left",
      firmware_version: 0x0201,
      esta_man: 0x0420,
      oem_code: 0x0420,
      port_addresses: [0, 1, 2, 3, 4, 5, 6, 7],
      online: true,
    },
    {
      ip_address: "192.168.1.102",
      mac_address: "00:04:20:01:00:02",
      short_name: "Swisson XND-8 #2",
      long_name: "Swisson XND-8 Artnet Node - Stage Right",
      firmware_version: 0x0201,
      esta_man: 0x0420,
      oem_code: 0x0420,
      port_addresses: [0, 1, 2, 3, 4, 5, 6, 7],
      online: true,
    },
    {
      ip_address: "192.168.1.103",
      mac_address: "00:04:20:01:00:03",
      short_name: "Swisson XND-8 #3",
      long_name: "Swisson XND-8 Artnet Node - Upstage",
      firmware_version: 0x0201,
      esta_man: 0x0420,
      oem_code: 0x0420,
      port_addresses: [0, 1, 2, 3, 4, 5, 6, 7],
      online: true,
    },
    {
      ip_address: "192.168.1.104",
      mac_address: "00:04:20:01:00:04",
      short_name: "Swisson XND-8 #4",
      long_name: "Swisson XND-8 Artnet Node - FOH",
      firmware_version: 0x0201,
      esta_man: 0x0420,
      oem_code: 0x0420,
      port_addresses: [0, 1, 2, 3, 4, 5, 6, 7],
      online: true,
    },
  ];
}
