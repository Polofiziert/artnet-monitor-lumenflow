import type { Component } from "solid-js";
import {
  createSignal,
  createEffect,
  on,
  For,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import DmxGridCanvas from "./DmxGridCanvas";
import FloatingPopover from "./FloatingPopover";
import Sparkline from "./Sparkline";
import SourceSyncPanel from "./SourceSyncPanel";
import { globalHistory } from "../lib/channelHistory";

export type ChannelValueFormat = "decimal" | "hex" | "binary" | "percent";

/** C2/C3: Per-universe data origin and merge mode (when backend exposes it). */
export interface DataOriginInfo {
  sourceIp: string;
  mergeMode?: "HTP" | "LTP";
}

interface ChannelInspectorProps {
  universeId: number;
  channels: () => ArrayLike<number> | undefined;
  clearTrigger?: () => number;
  channelValueFormat?: () => ChannelValueFormat;
  sourceIps?: () => { ip: string; role: "master" | "backup" | "secondary" }[];
  /** C2/C3: Data origin for this universe (source IP; merge mode when backend provides it). */
  dataOrigin?: () => DataOriginInfo | undefined;
  artSyncActive?: () => boolean;
  /** Whether this universe has NZS (non-zero start code) traffic. */
  hasNzs?: () => boolean;
}

const CHANNEL_COUNT = 512;
const SKELETON_CELLS = Array.from({ length: CHANNEL_COUNT }, (_, i) => i);
const FLICKER_STD_DEV_THRESHOLD = 25;
const FLICKER_WINDOW = 10;

function computeStdDev(buf: Float32Array, start: number, end: number): number {
  let sum = 0;
  const count = end - start;
  if (count <= 0) return 0;
  for (let i = start; i < end; i++) sum += buf[i]!;
  const mean = sum / count;
  let variance = 0;
  for (let i = start; i < end; i++) {
    const d = buf[i]! - mean;
    variance += d * d;
  }
  return Math.sqrt(variance / count);
}

const ChannelInspector: Component<ChannelInspectorProps> = (props) => {
  const [hoveredChannel, setHoveredChannel] = createSignal<number | null>(null);
  const [selectedChannel, setSelectedChannel] = createSignal<number | null>(
    null
  );
  const [gridCols, setGridCols] = createSignal<16 | 32>(32);
  const [flickeringSet, setFlickeringSet] = createSignal<Set<number>>(
    new Set()
  );

  createEffect(
    on(
      () => props.clearTrigger?.(),
      () => {
        setSelectedChannel(null);
        setHoveredChannel(null);
      },
      { defer: true }
    )
  );

  onMount(() => {
    const flickerTimer = setInterval(() => {
      const next = new Set<number>();
      for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
        const hist = globalHistory.getHistory(props.universeId, ch);
        if (!hist) continue;
        const len = hist.length;
        const start = Math.max(0, len - FLICKER_WINDOW);
        if (computeStdDev(hist, start, len) > FLICKER_STD_DEV_THRESHOLD) {
          next.add(ch);
        }
      }
      setFlickeringSet(next);
    }, 500);
    onCleanup(() => clearInterval(flickerTimer));
  });

  const portAddress = () => {
    const id = props.universeId;
    const net = (id >> 8) & 0x7f;
    const subNet = (id >> 4) & 0x0f;
    const uni = id & 0x0f;
    return `${net}:${subNet}:${uni}`;
  };

  const activeChannelCount = () => {
    const ch = props.channels();
    if (!ch) return 0;
    let count = 0;
    for (let i = 0; i < ch.length; i++) {
      if ((ch[i] ?? 0) > 0) count++;
    }
    return count;
  };

  const avgValue = () => {
    const ch = props.channels();
    if (!ch || ch.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < ch.length; i++) sum += ch[i] ?? 0;
    return Math.round(sum / ch.length);
  };

  const flickerCount = () => flickeringSet().size;

  const detailChannel = () => selectedChannel() ?? hoveredChannel();

  return (
    <div data-testid="channel-inspector" class="flex flex-col gap-4">
      {/* Header */}
      <div class="rounded-lg border border-edge bg-surface p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h2 class="text-sm font-medium uppercase tracking-wide text-secondary">
              Universe {props.universeId}
            </h2>
            <span
              class="font-mono text-xs tabular-nums text-muted"
              title="Net : SubNet : Universe — Art-Net 15-bit port address (e.g. Universe 1 on Net 0, SubNet 0)"
            >
              {portAddress()}
            </span>
            <Show when={props.hasNzs?.()}>
              <span
                class="rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-mono text-teal"
                title="NZS (non-zero start code) traffic"
              >
                NZS
              </span>
            </Show>
            <Show when={props.dataOrigin?.()}>
              {(origin) => (
                <span
                  class="text-[10px] text-muted"
                  title={
                    origin().mergeMode
                      ? `Merge: ${origin().mergeMode} (highest takes precedence vs latest)`
                      : "Merge mode not reported by controller"
                  }
                >
                  Merge: {origin().mergeMode ?? "—"}
                </span>
              )}
            </Show>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1 rounded-md border border-edge bg-obsidian">
              <button
                onClick={() => setGridCols(16)}
                class="rounded-l-md px-2 py-1 font-mono text-[10px] transition-colors"
                classList={{
                  "bg-teal/10 text-teal": gridCols() === 16,
                  "text-muted hover:text-secondary": gridCols() !== 16,
                }}
              >
                16
              </button>
              <button
                onClick={() => setGridCols(32)}
                class="rounded-r-md px-2 py-1 font-mono text-[10px] transition-colors"
                classList={{
                  "bg-teal/10 text-teal": gridCols() === 32,
                  "text-muted hover:text-secondary": gridCols() !== 32,
                }}
              >
                32
              </button>
            </div>
            <span class="text-xs tabular-nums text-muted">
              {activeChannelCount()} active
            </span>
            <span class="font-mono text-xs tabular-nums text-muted">
              avg {avgValue()}
            </span>
            <Show when={flickerCount() > 0}>
              <span class="flex items-center gap-1 text-xs text-amber">
                <span class="h-1.5 w-1.5 rounded-full bg-amber animate-flicker" />
                {flickerCount()} flicker
              </span>
            </Show>
          </div>
        </div>
      </div>

      {/* Source & Stats row */}
      <Show when={props.sourceIps}>
        {(sourceIps) => (
          <div class="flex gap-4">
            <div class="w-52 flex-shrink-0">
              <SourceSyncPanel
                sourceIps={sourceIps()}
                artSyncActive={props.artSyncActive ?? (() => false)}
              />
            </div>
            <div class="flex flex-1 items-center gap-6 rounded-lg border border-edge bg-surface px-4 py-3">
              <div class="flex flex-col">
                <span class="text-[10px] uppercase tracking-wide text-muted">
                  Grid
                </span>
                <span class="font-mono text-sm tabular-nums text-secondary">
                  {gridCols()} x {CHANNEL_COUNT / gridCols()}
                </span>
              </div>
              <div class="flex flex-col">
                <span class="text-[10px] uppercase tracking-wide text-muted">
                  Active
                </span>
                <span class="font-mono text-sm tabular-nums text-teal">
                  {activeChannelCount()}
                  <span class="text-muted">/{CHANNEL_COUNT}</span>
                </span>
              </div>
              <div class="flex flex-col">
                <span class="text-[10px] uppercase tracking-wide text-muted">
                  Average
                </span>
                <span class="font-mono text-sm tabular-nums text-secondary">
                  {avgValue()}
                </span>
              </div>
              <Show when={flickerCount() > 0}>
                <div class="flex flex-col">
                  <span class="text-[10px] uppercase tracking-wide text-muted">
                    Flicker
                  </span>
                  <span class="font-mono text-sm tabular-nums text-amber">
                    {flickerCount()} ch
                  </span>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>

      {/* Grid + Detail overlay (detail does not affect layout — B2) */}
      <div class="relative">
        <div class="flex gap-4">
          {/* Single unified canvas grid; always full width so layout is stable on hover */}
          <div
            class="flex-1 min-w-0"
            data-testid="channel-inspector-grid-wrapper"
          >
            <Show
              when={props.channels()}
              fallback={
                <div
                  class="rounded-md border border-edge bg-edge overflow-hidden"
                  classList={{
                    "grid grid-cols-32 gap-px": gridCols() === 32,
                    "grid grid-cols-16 gap-px": gridCols() === 16,
                  }}
                >
                  <For each={SKELETON_CELLS}>
                    {() => <div class="h-9 bg-surface animate-pulse" />}
                  </For>
                </div>
              }
            >
              <DmxGridCanvas
                channels={props.channels}
                universeId={props.universeId}
                gridCols={gridCols}
                flickeringSet={flickeringSet}
                hoveredChannel={hoveredChannel}
                selectedChannel={selectedChannel}
                onHover={setHoveredChannel}
                onSelect={setSelectedChannel}
              />

              <div class="mt-2 flex items-center gap-4 text-[10px] text-muted">
                <span class="flex items-center gap-1.5">
                  <span class="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
                  Live
                </span>
                <span>{CHANNEL_COUNT} ch</span>
                <span class="font-mono tabular-nums">
                  {gridCols()} x {CHANNEL_COUNT / gridCols()}
                </span>
              </div>
            </Show>
          </div>
        </div>

        {/* Channel detail as overlay so grid does not reflow on hover/select */}
        <FloatingPopover
          show={detailChannel() !== null && detailChannel() !== undefined}
          position="right"
          class="w-64 p-4"
        >
          <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Channel Detail
          </h3>
          <div class="flex flex-col gap-3">
            <div class="text-center">
              <div class="font-mono text-3xl font-semibold tabular-nums text-teal">
                {props.channels()?.[detailChannel()!] ?? 0}
              </div>
              <div class="mt-1 text-xs text-muted">
                Channel {detailChannel()! + 1}
              </div>
              <Show
                when={
                  detailChannel() !== null &&
                  flickeringSet().has(detailChannel()!)
                }
              >
                <div class="mt-1 flex items-center justify-center gap-1 text-[10px] text-amber">
                  <span class="h-1.5 w-1.5 rounded-full bg-amber animate-flicker" />
                  Flickering
                </div>
              </Show>
            </div>

            <div class="rounded-md border border-edge bg-obsidian p-2 w-full overflow-hidden">
              <div class="mb-1 text-[10px] uppercase tracking-wide text-muted">
                History
              </div>
              <div
                class="flex justify-start"
                data-testid="channel-detail-sparkline"
              >
                <Sparkline
                  data={() =>
                    globalHistory.getHistory(props.universeId, detailChannel()!)
                  }
                  width={224}
                  height={48}
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <span class="text-muted">Channel</span>
              <span class="font-mono tabular-nums text-secondary">
                {detailChannel()! + 1}
              </span>
              <span class="text-muted">
                {props.channelValueFormat?.() === "percent"
                  ? "Percent"
                  : "Value"}
              </span>
              <span class="font-mono tabular-nums text-secondary">
                {(() => {
                  const raw = props.channels()?.[detailChannel()!] ?? 0;
                  const fmt = props.channelValueFormat?.() ?? "decimal";
                  if (fmt === "hex")
                    return `0x${raw.toString(16).toUpperCase().padStart(2, "0")}`;
                  if (fmt === "binary") return raw.toString(2).padStart(8, "0");
                  if (fmt === "percent")
                    return `${Math.round((raw / 255) * 100)} %`;
                  return String(raw);
                })()}
              </span>
              <Show when={props.dataOrigin?.()}>
                {(origin) => (
                  <>
                    <span
                      class="text-muted"
                      title="Art-Net source for this universe"
                    >
                      Source
                    </span>
                    <span
                      class="font-mono text-[11px] text-secondary truncate"
                      title={origin().sourceIp}
                    >
                      {origin().sourceIp}
                    </span>
                    <Show when={origin().mergeMode}>
                      {(mode) => (
                        <>
                          <span
                            class="text-muted"
                            title="Merge mode: HTP = highest takes precedence, LTP = latest"
                          >
                            Merge
                          </span>
                          <span class="font-mono text-[11px] text-secondary">
                            {mode()}
                          </span>
                        </>
                      )}
                    </Show>
                  </>
                )}
              </Show>
            </div>
          </div>
        </FloatingPopover>
      </div>
    </div>
  );
};

export default ChannelInspector;
