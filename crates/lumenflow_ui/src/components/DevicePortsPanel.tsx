import type { Component, JSX } from "solid-js";
import {
  Show,
  Index,
  createSignal,
  createMemo,
  createEffect,
  untrack,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { EditableField, PendingEdit } from "../lib/pendingEdits";
import {
  portFieldKey,
  portSelectionKey,
} from "../lib/devicePortKeys";
import { portProtocolLabel } from "../lib/portProtocolLabel";
import type {
  ArtNetProductDto,
  PortWireSummaryDto,
  ProductPortDto,
} from "./DeviceList";
import { PortMergeGlyph } from "./PortMergeGlyph";
import { PortsBulkSecondaryBar } from "./PortsBulkSecondaryBar";

const UNI_DUP_PALETTE = [
  "#2DD4BF",
  "#F59E0B",
  "#818CF8",
  "#34D399",
  "#F87171",
  "#60A5FA",
  "#A78BFA",
  "#FBBF24",
] as const;

function splitUni15(u: number): { net: number; sub: number; uni: number } {
  return {
    net: (u >> 8) & 0x7f,
    sub: (u >> 4) & 0x0f,
    uni: u & 0x0f,
  };
}

function dirPill(w: PortWireSummaryDto): { label: string; tone: "out" | "in" | "io" } {
  const o = w.artnet_output_capable;
  const i = w.artnet_input_capable;
  if (o && i) return { label: "I/O", tone: "io" };
  if (o) return { label: "OUT", tone: "out" };
  if (i) return { label: "IN", tone: "in" };
  return { label: "—", tone: "in" };
}

function convLabel(w: PortWireSummaryDto): "Art-Net" | "sACN" {
  if (w.artnet_output_capable) {
    return w.output_sacn_selected ? "sACN" : "Art-Net";
  }
  return w.input_sacn_selected ? "sACN" : "Art-Net";
}

/** Node-reported activity line (PollReply bits; not live wire health). */
function activityFor(w: PortWireSummaryDto): {
  label: string;
  tone: "ok" | "warn" | "err" | "muted";
} {
  if (w.output_short_detected)
    return { label: "SHORT", tone: "err" };
  if (w.input_receive_errors) return { label: "ERR", tone: "err" };
  if (w.artnet_input_capable && w.input_data_received)
    return { label: "RX", tone: "ok" };
  if (w.artnet_output_capable && w.output_data_active)
    return { label: "OK", tone: "ok" };
  return { label: "IDLE", tone: "muted" };
}

function mergeGlyphProps(w: PortWireSummaryDto): {
  variant: "output" | "input";
  filledStackCount: number;
  loneSquareFilled: boolean;
} {
  const inOnly = w.artnet_input_capable && !w.artnet_output_capable;
  if (inOnly) {
    return {
      variant: "input",
      filledStackCount: 0,
      loneSquareFilled: w.merge_glyph_input_lone_filled,
    };
  }
  return {
    variant: "output",
    filledStackCount: w.merge_glyph_output_filled_stack,
    loneSquareFilled: false,
  };
}

function activityDotClass(tone: "ok" | "warn" | "err" | "muted"): string {
  if (tone === "ok") return "bg-teal";
  if (tone === "warn") return "bg-amber";
  if (tone === "err") return "bg-error";
  return "bg-muted";
}

function activityTextClass(tone: "ok" | "warn" | "err" | "muted"): string {
  if (tone === "ok") return "text-teal";
  if (tone === "warn") return "text-amber";
  if (tone === "err") return "text-error";
  return "text-muted";
}

function parsePortSelectionKeys(
  keys: Set<string>
): Array<{ bind_index: number; slot: number }> {
  const out: Array<{ bind_index: number; slot: number }> = [];
  for (const k of keys) {
    const parts = k.split(":");
    if (parts.length !== 2) continue;
    const bind_index = Number(parts[0]);
    const slot = Number(parts[1]);
    if (!Number.isInteger(bind_index) || !Number.isInteger(slot)) continue;
    out.push({ bind_index, slot });
  }
  return out;
}

const SelectAllPortsCheckbox: Component<{
  allSelected: () => boolean;
  someSelected: () => boolean;
  onToggle: () => void;
}> = (props) => {
  let inputEl: HTMLInputElement | undefined;
  createEffect(() => {
    const el = inputEl;
    if (!el) return;
    el.indeterminate = props.someSelected() && !props.allSelected();
  });
  return (
    <input
      type="checkbox"
      ref={(el) => {
        inputEl = el;
      }}
      class="h-3.5 w-3.5 rounded border-edge-active accent-teal"
      checked={props.allSelected()}
      onChange={() => props.onToggle()}
      onClick={(e) => e.stopPropagation()}
      title="Select all ports"
    />
  );
};

export interface DevicePortsPanelProps {
  device: () => ArtNetProductDto;
  deviceIdentity: string;
  viewMode: () => "table" | "card";
  setViewMode: (mode: "table" | "card") => void;
  editingPortKey: () => string | null;
  setEditingPortKey: (v: string | null) => void;
  editingValue: () => string;
  setEditingValue: (v: string) => void;
  beginEdit: (key: string, current: string) => void;
  submitPortNameEdit: (
    bindIndex: number,
    slot: number,
    currentLabel: string
  ) => Promise<void>;
  submitPortOutEdit: (
    bindIndex: number,
    slot: number,
    currentValue: number
  ) => Promise<void>;
  submitPortInEdit: (
    bindIndex: number,
    slot: number,
    currentValue: number | null | undefined,
    outputUniverseForBaseline: number
  ) => Promise<void>;
  isFieldBusy: (key: string) => boolean;
  fieldSpinner: (key: string, opts?: { inline?: boolean }) => JSX.Element;
  pendingEdits: () => Record<string, PendingEdit>;
  registerPollReplyPendings: (
    entries: Array<{
      key: string;
      field: EditableField;
      expectedValue: string;
      baselineValue: string;
    }>
  ) => void;
  fieldErrors: () => Record<string, string>;
  /** After bulk ArtAddress sends, trigger Poll refresh to verify wire state. */
  onReadCurrent?: (() => void | Promise<void>) | undefined;
}

export const DevicePortsPanel: Component<DevicePortsPanelProps> = (props) => {
  const [selected, setSelected] = createSignal<Set<string>>(new Set<string>());
  const [lastClickedIndex, setLastClickedIndex] = createSignal<number | null>(
    null
  );
  const [bulkBusy, setBulkBusy] = createSignal(false);
  let lastIdentity = props.deviceIdentity;

  const ports = () => props.device().ports;

  createEffect(() => {
    const nextIdentity = props.deviceIdentity;
    if (nextIdentity === lastIdentity) return;
    lastIdentity = nextIdentity;
    untrack(() => {
      setSelected(new Set<string>());
      setLastClickedIndex(null);
    });
  });

  const dupColorsByOutputUni = createMemo(() => {
    const list = ports();
    const counts = new Map<number, number>();
    for (const p of list) {
      if (!p.wire.artnet_output_capable) continue;
      const u = p.output_universe;
      counts.set(u, (counts.get(u) ?? 0) + 1);
    }
    const colors = new Map<number, string>();
    let ci = 0;
    for (const [u, c] of counts.entries()) {
      if (c > 1) {
        colors.set(u, UNI_DUP_PALETTE[ci % UNI_DUP_PALETTE.length]!);
        ci += 1;
      }
    }
    return colors;
  });

  const hasSharedOutputUni = () => dupColorsByOutputUni().size > 0;

  const allKeys = () =>
    ports().map((p) => portSelectionKey(p.bind_index, p.slot));

  const allSelected = () =>
    ports().length > 0 && selected().size === ports().length;
  const someSelected = () =>
    selected().size > 0 && !allSelected();

  const toggleAll = () => {
    if (allSelected()) {
      setSelected(new Set<string>());
      setLastClickedIndex(null);
    } else {
      setSelected(new Set<string>(allKeys()));
      setLastClickedIndex(null);
    }
  };

  const clearSelection = () => {
    setSelected(new Set<string>());
    setLastClickedIndex(null);
  };

  const handleRowClick = (
    e: MouseEvent,
    key: string,
    rowIndex: number
  ) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("button, input, textarea, a, label")) return;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift && lastClickedIndex() != null) {
      const lo = Math.min(lastClickedIndex()!, rowIndex);
      const hi = Math.max(lastClickedIndex()!, rowIndex);
      setSelected((prev) => {
        const next = new Set<string>(prev);
        for (let i = lo; i <= hi; i++) {
          const p = ports()[i];
          if (p) next.add(portSelectionKey(p.bind_index, p.slot));
        }
        return next;
      });
    } else if (isCtrl) {
      setSelected((prev) => {
        const next = new Set<string>(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setLastClickedIndex(rowIndex);
    } else {
      setSelected((prev) => {
        if (prev.size === 1 && prev.has(key)) return new Set<string>();
        return new Set<string>([key]);
      });
      setLastClickedIndex(rowIndex);
    }
  };

  const handleCardClick = (e: MouseEvent, key: string, rowIndex: number) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("button, input, textarea, a, label")) return;
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey && lastClickedIndex() != null;
    if (isShift) {
      const lo = Math.min(lastClickedIndex()!, rowIndex);
      const hi = Math.max(lastClickedIndex()!, rowIndex);
      setSelected((prev) => {
        const next = new Set<string>(prev);
        for (let i = lo; i <= hi; i++) {
          const p = ports()[i];
          if (p) next.add(portSelectionKey(p.bind_index, p.slot));
        }
        return next;
      });
    } else if (isCtrl) {
      setSelected((prev) => {
        const next = new Set<string>(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setLastClickedIndex(rowIndex);
    } else {
      setSelected((prev) => {
        if (prev.size === 1 && prev.has(key)) return new Set<string>();
        return new Set<string>([key]);
      });
      setLastClickedIndex(rowIndex);
    }
  };

  const selectedPortRows = createMemo(() => {
    const rows: ProductPortDto[] = [];
    for (const it of parsePortSelectionKeys(selected())) {
      const p = ports().find(
        (x) => x.bind_index === it.bind_index && x.slot === it.slot
      );
      if (p) rows.push(p);
    }
    return rows;
  });

  const sendPortWireCommand = async (
    op: string,
    bind_index: number,
    slot: number
  ) => {
    const d = props.device();
    await invoke("send_art_address", {
      params: {
        target_ip: d.ip_address,
        transport: d.transport_addr ?? null,
        bind_index,
        port_name: null,
        long_name: null,
        set_output_universe: null,
        set_input_universe: null,
        led_command: null,
        port_wire_command: { op, bind_index, slot },
        device_status2: d.status2 ?? null,
      },
    });
  };

  const runCancelMergeBulk = async () => {
    if (bulkBusy()) return;
    setBulkBusy(true);
    try {
      const binds = new Set(
        parsePortSelectionKeys(selected()).map((i) => i.bind_index)
      );
      for (const bind_index of binds) {
        await sendPortWireCommand("cancel_merge", bind_index, 0);
      }
      await props.onReadCurrent?.();
    } finally {
      setBulkBusy(false);
    }
  };

  const AddressBlock: Component<{
    uni15: number;
    dupColor?: string | null;
    large?: boolean;
  }> = (a) => {
    const { net, sub, uni } = splitUni15(a.uni15);
    return (
      <div class="flex items-center gap-1.5">
        <Show when={a.dupColor}>
          {(c) => (
            <span
              class="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ "background-color": c() }}
              title="Duplicate output universe on this node (node-reported addresses)"
            />
          )}
        </Show>
        <div class="flex flex-col gap-px font-mono leading-none">
          <div class="flex gap-1 text-[7px] text-muted">
            <span class="w-2">N</span>
            <span class="tabular-nums text-secondary">{net}</span>
          </div>
          <div class="flex gap-1 text-[7px] text-muted">
            <span class="w-2">S</span>
            <span class="tabular-nums text-secondary">{sub}</span>
          </div>
          <div class="flex gap-1 text-[7px] text-muted">
            <span class="w-2">U</span>
            <span class="tabular-nums text-secondary">{uni}</span>
          </div>
        </div>
        <div class="h-6 w-px shrink-0 bg-edge" />
        <div class="min-w-0">
          <span
            class="font-mono tabular-nums tracking-tight text-primary"
            classList={{
              "text-sm font-semibold": !a.large,
              "text-lg font-bold": !!a.large,
            }}
            style={
              a.dupColor
                ? { color: a.dupColor, "text-shadow": `0 0 8px ${a.dupColor}55` }
                : undefined
            }
          >
            {a.uni15}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div class="space-y-2 text-xs" data-testid="device-ports-panel">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded bg-teal/10 px-1.5 py-0.5 font-mono text-[10px] text-teal">
          {ports().length} ports
        </span>
        <div class="ml-auto flex overflow-hidden rounded-md border border-edge">
          <button
            type="button"
            class="px-2 py-0.5 text-[11px] transition-colors"
            classList={{
              "bg-teal/15 text-teal": props.viewMode() === "table",
              "text-muted hover:text-secondary": props.viewMode() !== "table",
            }}
            onClick={() => props.setViewMode("table")}
          >
            Table
          </button>
          <button
            type="button"
            class="border-l border-edge px-2 py-0.5 text-[11px] transition-colors"
            classList={{
              "bg-teal/15 text-teal": props.viewMode() === "card",
              "text-muted hover:text-secondary": props.viewMode() !== "card",
            }}
            onClick={() => props.setViewMode("card")}
          >
            Cards
          </button>
        </div>
      </div>

      <Show when={props.viewMode() === "table"}>
        <div class="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] leading-snug text-muted">
          <span>
            <kbd class="rounded border border-edge-active bg-surface px-1 py-px font-mono">
              Shift
            </kbd>{" "}
            range
          </span>
          <span>
            <kbd class="rounded border border-edge-active bg-surface px-1 py-px font-mono">
              ⌘
            </kbd>
            /
            <kbd class="rounded border border-edge-active bg-surface px-1 py-px font-mono">
              Ctrl
            </kbd>{" "}
            toggle
          </span>
          <span class="text-muted">
            Double-click label or universe cells to edit. If PollReply Status2
            bit3 is set (15-bit addressing), the full port address can be
            programmed; otherwise only the universe nibble changes via ArtAddress.
          </span>
        </div>
      </Show>

      <Show when={hasSharedOutputUni()}>
        <div class="flex flex-wrap items-center gap-2 rounded-md border border-amber/25 bg-amber/5 px-2 py-1 text-[10px] text-secondary">
          <span class="font-medium uppercase tracking-wide text-amber">
            Shared universe
          </span>
          <span class="text-muted">
            Same 15-bit output address appears on multiple ports (node-reported).
          </span>
        </div>
      </Show>

      <Show when={selected().size > 0}>
        <PortsBulkSecondaryBar
          device={props.device}
          selectedPortRows={selectedPortRows}
          bulkBusy={bulkBusy}
          setBulkBusy={setBulkBusy}
          sendPortWireCommand={sendPortWireCommand}
          runCancelMergeBulk={runCancelMergeBulk}
          clearSelection={clearSelection}
          pendingEdits={props.pendingEdits}
          registerPollReplyPendings={props.registerPollReplyPendings}
          onReadCurrent={props.onReadCurrent}
        />
      </Show>

      <Show
        when={ports().length === 0}
        fallback={
          <Show
            when={props.viewMode() === "table"}
            fallback={
              <div
                class="flex max-h-[min(32rem,calc(100vh-14rem))] flex-wrap gap-2 overflow-auto pb-1"
                data-testid="ports-card-scroll"
              >
                <Index each={ports()}>
                  {(p, idx) => {
                    const key = () =>
                      portSelectionKey(p().bind_index, p().slot);
                    const w = () => p().wire;
                    const act = () => activityFor(w());
                    const mg = () => mergeGlyphProps(w());
                    const dup = () =>
                      dupColorsByOutputUni().get(p().output_universe) ?? null;
                    const d = () => dirPill(w());
                    const risk = () =>
                      w().output_short_detected
                        ? "border-error/40"
                        : w().input_receive_errors
                          ? "border-amber/40"
                          : "border-edge";
                    return (
                      <div
                        role="button"
                        tabindex={0}
                        class={`relative w-[190px] shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-surface transition-colors ${risk()}`}
                        classList={{
                          "ring-1 ring-teal/40 border-teal/50":
                            selected().has(key()),
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleCardClick(
                              e as unknown as MouseEvent,
                              key(),
                              idx
                            );
                          }
                        }}
                        onClick={(e) => handleCardClick(e, key(), idx)}
                      >
                        <div
                          class="h-0.5 w-full"
                          classList={{
                            "bg-teal": w().artnet_output_capable,
                            "bg-amber": !w().artnet_output_capable,
                          }}
                        />
                        <div class="flex items-center justify-between border-b border-edge bg-obsidian px-2 py-1">
                          <span
                            class="font-mono text-[9px] font-bold tracking-wide"
                            classList={{
                              "text-teal": d().tone === "out" || d().tone === "io",
                              "text-amber": d().tone === "in",
                            }}
                          >
                            {d().tone === "out"
                              ? "▶ OUT"
                              : d().tone === "in"
                                ? "◀ IN"
                                : "I/O"}
                          </span>
                          <span
                            class="font-mono text-[9px] font-bold"
                            classList={{
                              "text-fuchsia-400": convLabel(w()) === "sACN",
                              "text-teal": convLabel(w()) === "Art-Net",
                            }}
                          >
                            {convLabel(w())}
                          </span>
                        </div>
                        <div class="space-y-1.5 px-2 py-2">
                          <div class="truncate text-xs font-semibold text-primary">
                            {p().label}
                          </div>
                          <div class="flex items-center justify-between gap-1">
                            <div class="flex min-w-0 items-center gap-1 text-[10px]">
                              <span class="font-mono text-muted">
                                {portProtocolLabel(w().protocol_code)}
                              </span>
                              <div class="flex items-center gap-1">
                                <span
                                  class={`h-1.5 w-1.5 shrink-0 rounded-full ${activityDotClass(act().tone)}`}
                                />
                                <span
                                  class={`font-mono text-[9.5px] font-bold ${activityTextClass(act().tone)}`}
                                >
                                  {act().label}
                                </span>
                              </div>
                            </div>
                            <div class="flex shrink-0 items-center gap-1">
                              <Show when={w().rdm_active_on_port}>
                                <span class="rounded bg-violet-700 px-1 py-px font-mono text-[8.5px] font-bold text-white">
                                  RDM
                                </span>
                              </Show>
                              <Show when={w().artnet_output_capable}>
                                <span
                                  class="rounded px-1 py-px font-mono text-[8.5px] font-bold text-white"
                                  classList={{
                                    "bg-violet-800": !w().merge_ltp,
                                    "bg-sky-800": w().merge_ltp,
                                  }}
                                >
                                  {w().merge_ltp ? "LTP" : "HTP"}
                                </span>
                              </Show>
                              <PortMergeGlyph
                                variant={mg().variant}
                                filledStackCount={mg().filledStackCount}
                                loneSquareFilled={mg().loneSquareFilled}
                                class={
                                  mg().variant === "output"
                                    ? "text-teal"
                                    : "text-amber"
                                }
                              />
                            </div>
                          </div>
                          <div class="flex items-center gap-2 border-t border-edge pt-2">
                            <AddressBlock
                              uni15={p().output_universe}
                              dupColor={dup()}
                              large
                            />
                          </div>
                          <div class="border-t border-edge pt-2 text-[9px] text-muted">
                            <span class="font-mono text-[9px]">
                              B{p().bind_index} · S{p().slot}
                            </span>
                            <span class="mx-1">·</span>
                            <span>Edit via table view (double-click)</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </Index>
              </div>
            }
          >
            <div
              class="max-h-[min(32rem,calc(100vh-14rem))] overflow-auto rounded-md border border-edge"
              data-testid="ports-table-scroll"
            >
              <table class="w-full border-collapse text-left text-[11px]">
                <thead class="sticky top-0 z-[1] border-b border-edge bg-surface">
                  <tr class="text-[10px] font-medium uppercase tracking-wide text-muted">
                    <th class="w-8 px-2 py-1.5">
                      <SelectAllPortsCheckbox
                        allSelected={allSelected}
                        someSelected={someSelected}
                        onToggle={toggleAll}
                      />
                    </th>
                    <th class="px-2 py-1.5">Dir</th>
                    <th class="px-2 py-1.5">Label</th>
                    <th class="px-2 py-1.5">Conv</th>
                    <th class="px-2 py-1.5">Protocol</th>
                    <th class="px-2 py-1.5">Activity</th>
                    <th class="px-2 py-1.5">Flags</th>
                    <th class="px-2 py-1.5">Merge</th>
                    <th class="px-2 py-1.5">Address</th>
                  </tr>
                </thead>
                <tbody>
                  <Index each={ports()}>
                    {(p, rowIndex) => {
                      const key = () =>
                        portSelectionKey(p().bind_index, p().slot);
                      const w = () => p().wire;
                      const act = () => activityFor(w());
                      const mg = () => mergeGlyphProps(w());
                      const dup = () =>
                        dupColorsByOutputUni().get(p().output_universe) ??
                        null;
                      const d = () => dirPill(w());
                      return (
                        <tr
                          class="cursor-pointer border-b border-edge/40 transition-colors hover:bg-surface-hover/50"
                          classList={{
                            "bg-teal/[0.07]": selected().has(key()),
                          }}
                          data-testid={`port-row-${p().bind_index}-${p().slot}`}
                          onClick={(e) =>
                            handleRowClick(e, key(), rowIndex)
                          }
                        >
                          <td
                            class="px-2 py-1 align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              class="h-3.5 w-3.5 rounded border-edge-active accent-teal"
                              checked={selected().has(key())}
                              onChange={() => {
                                setSelected((prev) => {
                                  const next = new Set<string>(prev);
                                  if (next.has(key())) next.delete(key());
                                  else next.add(key());
                                  return next;
                                });
                                setLastClickedIndex(rowIndex);
                              }}
                            />
                          </td>
                          <td class="px-2 py-1 align-middle">
                            <span
                              class="inline-flex items-center gap-0.5 rounded px-1.5 py-px font-mono text-[9px] font-semibold tracking-wide"
                              classList={{
                                "border border-teal/25 bg-teal/10 text-teal":
                                  d().tone === "out" || d().tone === "io",
                                "border border-amber/25 bg-amber/10 text-amber":
                                  d().tone === "in",
                              }}
                            >
                              {d().tone === "out"
                                ? "▶ OUT"
                                : d().tone === "in"
                                  ? "◀ IN"
                                  : "I/O"}
                            </span>
                          </td>
                          <td class="px-2 py-1 align-middle">
                            <Show
                              when={
                                props.editingPortKey() ===
                                portFieldKey(p().bind_index, p().slot)
                              }
                              fallback={
                                <button
                                  type="button"
                                  class="w-full max-w-[10rem] truncate text-left text-primary hover:text-teal"
                                  title="Double-click to edit port name"
                                  onDblClick={() => {
                                    props.beginEdit(
                                      portFieldKey(p().bind_index, p().slot),
                                      p().label
                                    );
                                    props.setEditingPortKey(
                                      portFieldKey(p().bind_index, p().slot)
                                    );
                                  }}
                                >
                                  {p().label}
                                </button>
                              }
                            >
                              <input
                                autofocus
                                maxlength={17}
                                value={props.editingValue()}
                                onInput={(e) =>
                                  props.setEditingValue(e.currentTarget.value)
                                }
                                onBlur={() => props.setEditingPortKey(null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape")
                                    props.setEditingPortKey(null);
                                  if (e.key === "Enter") {
                                    void props.submitPortNameEdit(
                                      p().bind_index,
                                      p().slot,
                                      p().label
                                    );
                                  }
                                }}
                                class="w-full max-w-[10rem] rounded border border-edge-active bg-surface px-2 py-1 text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                              />
                            </Show>
                          </td>
                          <td class="px-2 py-1 align-middle">
                            <span
                              class="font-mono text-[10px] font-semibold"
                              classList={{
                                "text-fuchsia-400": convLabel(w()) === "sACN",
                                "text-teal": convLabel(w()) === "Art-Net",
                              }}
                            >
                              {convLabel(w())}
                            </span>
                          </td>
                          <td class="px-2 py-1 align-middle font-mono text-secondary">
                            {portProtocolLabel(w().protocol_code)}
                          </td>
                          <td class="px-2 py-1 align-middle">
                            <div class="flex items-center gap-1">
                              <span
                                class={`h-1.5 w-1.5 shrink-0 rounded-full ${activityDotClass(act().tone)}`}
                              />
                              <span
                                class={`font-mono text-[10px] font-bold ${activityTextClass(act().tone)}`}
                              >
                                {act().label}
                              </span>
                            </div>
                          </td>
                          <td class="px-2 py-1 align-middle">
                            <div class="flex flex-wrap items-center gap-1">
                              <Show when={w().rdm_active_on_port}>
                                <span class="rounded bg-violet-700 px-1 py-px font-mono text-[8.5px] font-bold text-white">
                                  RDM
                                </span>
                              </Show>
                              <Show when={w().artnet_output_capable}>
                                <span
                                  class="rounded px-1 py-px font-mono text-[8.5px] font-bold text-white"
                                  classList={{
                                    "bg-violet-800": !w().merge_ltp,
                                    "bg-sky-800": w().merge_ltp,
                                  }}
                                >
                                  {w().merge_ltp ? "LTP" : "HTP"}
                                </span>
                              </Show>
                              <Show when={!w().artnet_output_capable}>
                                <span class="text-[10px] text-muted">—</span>
                              </Show>
                            </div>
                          </td>
                          <td class="px-2 py-1 align-middle">
                            <PortMergeGlyph
                              variant={mg().variant}
                              filledStackCount={mg().filledStackCount}
                              loneSquareFilled={mg().loneSquareFilled}
                              class={
                                mg().variant === "output"
                                  ? "text-teal"
                                  : "text-amber"
                              }
                            />
                          </td>
                          <td class="px-2 py-1 align-middle">
                            <AddressBlock
                              uni15={p().output_universe}
                              dupColor={dup()}
                            />
                          </td>
                        </tr>
                      );
                    }}
                  </Index>
                </tbody>
              </table>
            </div>
          </Show>
        }
      >
        <div class="text-[11px] text-muted">
          No ports reported (e.g. manual entry or controller with no DMX
          outputs).
        </div>
      </Show>
    </div>
  );
};
