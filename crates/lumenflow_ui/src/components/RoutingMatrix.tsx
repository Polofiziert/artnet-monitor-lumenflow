import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { ArtNetProductDto } from "./DeviceList";

export interface RouteInfo {
  universeId: number;
  sourceIp: string;
  packetsPerSecond: number;
  lastSeen: number;
}

interface RoutingMatrixProps {
  universes: () => number[];
  routes?: () => RouteInfo[];
  products?: () => ArtNetProductDto[];
  onDeviceSelect?: (device: ArtNetProductDto) => void;
}

interface PortColumn {
  product: ArtNetProductDto;
  universe: number;
  label: string;
  /** First column within this product’s port group (visual separator). */
  isFirstPortOfProduct: boolean;
}

const DEVICE_HEADER_H = "3rem";

const formatUniverse = (uni: number): string => {
  const net = (uni >> 8) & 0x7f;
  const sub = (uni >> 4) & 0x0f;
  const u = uni & 0x0f;
  return `${net}:${sub}:${u}`;
};

const RoutingMatrix: Component<RoutingMatrixProps> = (props) => {
  const routes = () => props.routes?.() ?? [];
  const products = () => props.products?.() ?? [];

  const deviceByIp = createMemo(() => {
    const map = new Map<string, ArtNetProductDto>();
    for (const p of products()) map.set(p.ip_address, p);
    return map;
  });

  const transmitters = createMemo(() => {
    const seen = new Map<string, ArtNetProductDto | undefined>();
    for (const r of routes()) {
      if (!seen.has(r.sourceIp)) {
        seen.set(r.sourceIp, deviceByIp().get(r.sourceIp));
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ip, device]) => ({ ip, device }));
  });

  const receivers = createMemo(() =>
    products().filter((p) => p.ports.length > 0)
  );

  const portColumns = createMemo((): PortColumn[] => {
    const cols: PortColumn[] = [];
    for (const prod of receivers()) {
      for (let i = 0; i < prod.ports.length; i++) {
        const port = prod.ports[i]!;
        cols.push({
          product: prod,
          universe: port.output_universe,
          label: port.label,
          isFirstPortOfProduct: i === 0,
        });
      }
    }
    return cols;
  });

  const totalPortColumns = createMemo(() => portColumns().length);

  const routeIndex = createMemo(() => {
    const map = new Map<string, RouteInfo>();
    for (const r of routes()) {
      map.set(`${r.sourceIp}::${r.universeId}`, r);
    }
    return map;
  });

  const conflictUniverses = createMemo(() => {
    const byUniverse = new Map<number, Set<string>>();
    for (const r of routes()) {
      let sources = byUniverse.get(r.universeId);
      if (!sources) {
        sources = new Set();
        byUniverse.set(r.universeId, sources);
      }
      sources.add(r.sourceIp);
    }
    const conflicts = new Set<number>();
    for (const [uni, sources] of byUniverse) {
      if (sources.size > 1) conflicts.add(uni);
    }
    return conflicts;
  });

  const conflictCount = createMemo(() => conflictUniverses().size);

  const hasData = createMemo(
    () => transmitters().length > 0 && receivers().length > 0
  );

  return (
    <div
      data-testid="routing-matrix"
      class="flex flex-col gap-3 rounded-lg border border-edge bg-surface p-4"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium tracking-wide uppercase text-secondary">
          Routing Matrix
        </h2>
        <Show when={hasData()}>
          <span class="text-[10px] font-mono text-muted">
            {transmitters().length} tx · {receivers().length} rx ·{" "}
            {totalPortColumns()} ports
          </span>
        </Show>
      </div>

      <Show
        when={hasData()}
        fallback={
          <div class="flex h-40 flex-col items-center justify-center gap-3 text-xs text-muted">
            <svg
              class="h-10 w-10 text-edge"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="1"
            >
              <path d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
            <span class="text-center leading-relaxed px-8">
              No active routing. Connect Art-Net devices and send data to
              populate the matrix.
            </span>
          </div>
        }
      >
        <div class="overflow-auto max-h-[calc(100vh-14rem)]">
          <div
            class="grid gap-px"
            style={{
              "grid-template-columns": `minmax(160px, auto) repeat(${totalPortColumns()}, minmax(56px, 1fr))`,
              background: "rgba(31,31,31,0.5)",
            }}
          >
            {/* Corner cell — sticky in both directions */}
            <div
              class="sticky top-0 left-0 z-30 flex items-end bg-surface p-2 border-b border-r border-edge"
              style={{ "grid-row": "span 2" }}
              title="TX (senders) = rows, RX (receivers) = columns. Art-Net sources send DMX; devices receive."
            >
              <span class="text-[9px] font-medium uppercase tracking-widest text-muted leading-tight">
                {"tx ↓"}
                <br />
                {"rx →"}
              </span>
            </div>

            {/* Device name headers — row 0, each spans its port count */}
            <For each={receivers()}>
              {(dev) => (
                <div
                  class="sticky top-0 z-20 flex items-center justify-center bg-surface px-2 h-12 border-b border-edge cursor-pointer hover:bg-surface-hover transition-colors"
                  style={{
                    "grid-column": `span ${dev.ports.length}`,
                  }}
                  onClick={() => props.onDeviceSelect?.(dev)}
                  title={`${dev.long_name} (${dev.ip_address})`}
                >
                  <div class="flex flex-col items-center min-w-0">
                    <span class="text-[11px] font-medium text-primary truncate max-w-[120px]">
                      {dev.short_name}
                    </span>
                    <span class="text-[9px] font-mono text-muted truncate">
                      {dev.ip_address}
                    </span>
                  </div>
                </div>
              )}
            </For>

            {/* Port label headers — row 1, one per port */}
            <For each={portColumns()}>
              {(col) => (
                <div
                  class="sticky z-20 flex flex-col items-center justify-center bg-surface px-1 py-1 border-b border-edge"
                  style={{ top: DEVICE_HEADER_H }}
                  classList={{
                    "border-l border-l-teal/10": col.isFirstPortOfProduct,
                  }}
                >
                  <span class="text-[9px] font-medium text-secondary truncate max-w-[56px]">
                    {col.label}
                  </span>
                  <span
                    class="text-[8px] font-mono text-muted"
                    title="Net : SubNet : Universe"
                  >
                    {formatUniverse(col.universe)}
                  </span>
                </div>
              )}
            </For>

            {/* Data rows — one per transmitter source */}
            <For each={transmitters()}>
              {(tx) => (
                <>
                  <div
                    class="sticky left-0 z-10 flex items-center gap-2 bg-surface px-3 py-2 border-r border-edge cursor-pointer hover:bg-surface-hover transition-colors"
                    onClick={() => {
                      if (tx.device) props.onDeviceSelect?.(tx.device);
                    }}
                  >
                    <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-teal/10 text-teal">
                      <svg
                        class="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="1.5"
                      >
                        <path d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                      </svg>
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span class="text-[11px] font-medium text-primary truncate">
                        {tx.device?.short_name ?? "Unknown"}
                      </span>
                      <span class="text-[9px] font-mono text-muted">
                        {tx.ip}
                      </span>
                    </div>
                  </div>

                  <For each={portColumns()}>
                    {(col) => {
                      const route = () =>
                        routeIndex().get(`${tx.ip}::${col.universe}`);
                      const isConflict = () =>
                        conflictUniverses().has(col.universe) && !!route();

                      return (
                        <div
                          class="flex items-center justify-center bg-obsidian min-h-[40px]"
                          classList={{
                            "border-l border-l-teal/10": col.isFirstPortOfProduct,
                          }}
                        >
                          <Show
                            when={route()}
                            fallback={
                              <div class="h-7 w-full rounded border border-edge/30 bg-obsidian" />
                            }
                          >
                            {(r) => (
                              <div
                                class="flex h-7 w-full max-w-[48px] items-center justify-center rounded border font-mono text-[10px] tabular-nums"
                                classList={{
                                  "border-amber/40 bg-amber/10 text-amber shadow-[0_0_6px_rgba(245,158,11,0.15)]":
                                    isConflict(),
                                  "border-teal/30 bg-teal/15 text-teal shadow-[0_0_6px_#2DD4BF33] animate-[cell-pulse_3s_ease-in-out_infinite]":
                                    !isConflict(),
                                }}
                                title={
                                  isConflict()
                                    ? `Universe ${col.universe} — merge conflict (multiple sources)`
                                    : `Universe ${col.universe} · ${r().packetsPerSecond} pps`
                                }
                              >
                                <Show when={isConflict()}>
                                  <span class="mr-0.5 text-[8px]">⇄</span>
                                </Show>
                                {col.universe}
                              </div>
                            )}
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </>
              )}
            </For>
          </div>
        </div>

        {/* Bottom alert bar */}
        <div
          class="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-medium"
          classList={{
            "border-teal/20 bg-teal/5 text-teal": conflictCount() === 0,
            "border-amber/30 bg-amber/5 text-amber": conflictCount() > 0,
          }}
        >
          <span
            class="h-1.5 w-1.5 shrink-0 rounded-full"
            classList={{
              "bg-teal": conflictCount() === 0,
              "bg-amber animate-pulse": conflictCount() > 0,
            }}
          />
          <Show when={conflictCount() > 0} fallback="No conflicts detected">
            {conflictCount()} merge point{conflictCount() !== 1 ? "s" : ""}{" "}
            detected
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default RoutingMatrix;
