import type {
  ArtNetProductDto,
  PortWireSummaryDto,
  ProductPortDto,
} from "../components/DeviceList";

/** Matches `decode_port_wire_from_poll(0x80, 0x80, 0, 0, 0x90)` — DMX out, data active, RDM on-capable node. */
const MOCK_WIRE_DMX_OK: PortWireSummaryDto = {
  artnet_output_capable: true,
  artnet_input_capable: false,
  protocol_code: 0,
  output_sacn_selected: false,
  input_sacn_selected: false,
  merge_ltp: false,
  merge_artnet_active: false,
  output_data_active: true,
  output_short_detected: false,
  input_data_received: false,
  input_receive_errors: false,
  rdm_disabled: false,
  node_supports_rdm_art_address: true,
  node_supports_15bit_address: true,
  node_can_switch_artnet_sacn: true,
  merge_glyph_output_filled_stack: 1,
  merge_glyph_input_lone_filled: false,
  rdm_active_on_port: true,
};

/** Merge active + LTP (`good_output` 0x8a, status2 0). */
const MOCK_WIRE_MERGE_LTP: PortWireSummaryDto = {
  artnet_output_capable: true,
  artnet_input_capable: false,
  protocol_code: 0,
  output_sacn_selected: false,
  input_sacn_selected: false,
  merge_ltp: true,
  merge_artnet_active: true,
  output_data_active: true,
  output_short_detected: false,
  input_data_received: false,
  input_receive_errors: false,
  rdm_disabled: false,
  node_supports_rdm_art_address: false,
  node_supports_15bit_address: false,
  node_can_switch_artnet_sacn: false,
  merge_glyph_output_filled_stack: 2,
  merge_glyph_input_lone_filled: false,
  rdm_active_on_port: true,
};

/** Default PollReply wire bytes for tests and mock devices. */
export function mockProductPort(
  slot: number,
  outputUniverse: number,
  label: string,
  opts?: {
    port_type?: number;
    good_output?: number;
    good_input?: number;
    good_output_b?: number;
    status2?: number;
    wire?: PortWireSummaryDto;
    input_universe?: number | null;
  }
): ProductPortDto {
  const port_type = opts?.port_type ?? 0x80;
  const good_output = opts?.good_output ?? 0x80;
  const good_input = opts?.good_input ?? 0;
  const good_output_b = opts?.good_output_b ?? 0;
  const status2 = opts?.status2 ?? 0x90;
  return {
    bind_index: 1,
    slot,
    output_universe: outputUniverse,
    input_universe: opts?.input_universe ?? null,
    label,
    port_type,
    good_output,
    good_input,
    good_output_b,
    status2,
    wire: opts?.wire ?? MOCK_WIRE_DMX_OK,
  };
}

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

function mockProduct(opts: {
  ip: string;
  mac: string;
  shortName: string;
  longName: string;
  universes: number[];
  fw: number;
  esta: number;
  oem: number;
}): ArtNetProductDto {
  const product_id = `${opts.ip}|${opts.mac.replace(/:/g, "")}`;
  const ports: ProductPortDto[] = opts.universes.map((u, i) => {
    const isMergeDemo = opts.shortName.includes("Swisson") && i === 1;
    const isDaliDemo = opts.shortName.includes("Swisson") && i === 6;
    if (isMergeDemo) {
      return mockProductPort(i, u, `Port ${i + 1}`, {
        good_output: 0x8a,
        status2: 0,
        wire: MOCK_WIRE_MERGE_LTP,
      });
    }
    if (isDaliDemo) {
      return mockProductPort(i, u, `Port ${i + 1}`, {
        port_type: 0x86,
        wire: {
          ...MOCK_WIRE_DMX_OK,
          protocol_code: 6,
        },
      });
    }
    return mockProductPort(i, u, `Port ${i + 1}`);
  });
  return {
    product_id,
    bind_ip: opts.ip,
    ip_address: opts.ip,
    primary_bind_index: 1,
    mac_address: opts.mac,
    short_name: opts.shortName,
    long_name: opts.longName,
    esta_man: opts.esta,
    oem_code: opts.oem,
    firmware_version: opts.fw,
    node_report: "Mock",
    status1: 0,
    status2: 0x90,
    style: 0,
    ports,
    online: true,
  };
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

const EIGHT_UNIS = [0, 1, 2, 3, 4, 5, 6, 7];

export function createMockProducts(): ArtNetProductDto[] {
  return [
    mockProduct({
      ip: GRANDMA3_MASTER_IP,
      mac: "00:1A:2B:3C:4D:5E",
      shortName: "GrandMA 3 #1",
      longName: "MA Lighting grandMA 3 - Master (FOH)",
      universes: [],
      fw: 0x0312,
      esta: 0x0043,
      oem: 0x0431,
    }),
    mockProduct({
      ip: GRANDMA3_BACKUP_IP,
      mac: "AA:BB:CC:DD:EE:01",
      shortName: "GrandMA 3 #2",
      longName: "MA Lighting grandMA 3 - Backup",
      universes: [],
      fw: 0x0312,
      esta: 0x0043,
      oem: 0x0431,
    }),
    mockProduct({
      ip: "192.168.1.101",
      mac: "00:04:20:01:00:01",
      shortName: "Swisson XND-8 #1",
      longName: "Swisson XND-8 Artnet Node - Stage Left",
      universes: EIGHT_UNIS,
      fw: 0x0201,
      esta: 0x0420,
      oem: 0x0420,
    }),
    mockProduct({
      ip: "192.168.1.102",
      mac: "00:04:20:01:00:02",
      shortName: "Swisson XND-8 #2",
      longName: "Swisson XND-8 Artnet Node - Stage Right",
      universes: EIGHT_UNIS,
      fw: 0x0201,
      esta: 0x0420,
      oem: 0x0420,
    }),
    mockProduct({
      ip: "192.168.1.103",
      mac: "00:04:20:01:00:03",
      shortName: "Swisson XND-8 #3",
      longName: "Swisson XND-8 Artnet Node - Upstage",
      universes: EIGHT_UNIS,
      fw: 0x0201,
      esta: 0x0420,
      oem: 0x0420,
    }),
    mockProduct({
      ip: "192.168.1.104",
      mac: "00:04:20:01:00:04",
      shortName: "Swisson XND-8 #4",
      longName: "Swisson XND-8 Artnet Node - FOH",
      universes: EIGHT_UNIS,
      fw: 0x0201,
      esta: 0x0420,
      oem: 0x0420,
    }),
  ];
}
