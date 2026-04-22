import type { Component } from "solid-js";
import { Show, For, createSignal, createMemo, createEffect } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type { ArtNetProductDto, ProductPortDto } from "./DeviceList";
import { PORT_PROTOCOL_SELECT_OPTIONS } from "../lib/portProtocolOptions";
import { netSubMismatchError } from "../lib/devicePortAddress";
import { PortAddressPickerPopover } from "./PortAddressPickerPopover";
import type { EditableField, PendingEdit } from "../lib/pendingEdits";
import {
  portFieldKey,
  outFieldKey,
  inFieldKey,
  wrRdmKey,
  wrMergeLtpKey,
  wrSacnKey,
  wrStyleContinuousKey,
  wrDirTxKey,
  wrDirRxKey,
} from "../lib/devicePortKeys";
import { formatMassPortLabel } from "../lib/massPortLabel";

/** Tooltip: purpose + mandatory deactivated reason (operator clarity). */
export function bulkControlTitle(purpose: string, deactivatedReason?: string): string {
  if (!deactivatedReason) return purpose;
  return `${purpose} Deactivated: ${deactivatedReason}`;
}

export type PollReplyPendingEntry = {
  key: string;
  field: EditableField;
  expectedValue: string;
  baselineValue: string;
};

export interface PortsBulkSecondaryBarProps {
  device: () => ArtNetProductDto;
  selectedPortRows: () => ProductPortDto[];
  bulkBusy: () => boolean;
  setBulkBusy: (v: boolean) => void;
  sendPortWireCommand: (
    op: string,
    bind_index: number,
    slot: number
  ) => Promise<void>;
  runCancelMergeBulk: () => Promise<void>;
  clearSelection: () => void;
  pendingEdits: () => Record<string, PendingEdit>;
  registerPollReplyPendings: (entries: PollReplyPendingEntry[]) => void;
  onReadCurrent?: (() => void | Promise<void>) | undefined;
}

const segClass = (active: boolean, enabled: boolean) =>
  `rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
    !enabled
      ? "border-edge bg-surface text-muted opacity-50 cursor-not-allowed"
      : active
        ? "border-teal/50 bg-teal/15 text-teal"
        : "border-edge-active bg-surface text-secondary hover:text-primary"
  }`;

function portDirTxWire(pt: number): boolean {
  return (pt & 0x80) !== 0 && (pt & 0x40) === 0;
}

function portDirRxWire(pt: number): boolean {
  return (pt & 0x40) !== 0 && (pt & 0x80) === 0;
}

export const PortsBulkSecondaryBar: Component<PortsBulkSecondaryBarProps> = (
  props
) => {
  const [labelOpen, setLabelOpen] = createSignal(false);
  const [addrOpen, setAddrOpen] = createSignal(false);
  const [labelDraft, setLabelDraft] = createSignal("");
  const [addrMode, setAddrMode] = createSignal<"output" | "input">("output");
  const [bulkError, setBulkError] = createSignal<string | null>(null);

  const deviceSt2 = () => props.device().status2 ?? 0;
  const rows = () => props.selectedPortRows();
  const busy = () => props.bulkBusy();
  const pe = () => props.pendingEdits();
  const productId = () => props.device().product_id;

  const canSacnSwitch = () => (deviceSt2() & 0x10) !== 0;
  const canRdmArtAddr = () => (deviceSt2() & 0x80) !== 0;
  /** ArtPollReply Status2 bit6 — output style (delta vs continuous) controllable via ArtAddress. */
  const canOutputStyleArtAddr = () => (deviceSt2() & 0x40) !== 0;

  const allSelectedOutput = () =>
    rows().length > 0 && rows().every((p) => p.wire.artnet_output_capable);

  const allSelectedInputOnly = () =>
    rows().length > 0 &&
    rows().every((p) => p.wire.artnet_input_capable && !p.wire.artnet_output_capable);

  const allDmxProtocol = () =>
    rows().length > 0 && rows().every((p) => (p.wire.protocol_code & 0x3f) === 0);

  const mergeAllLtp = () =>
    rows().length > 0 && rows().every((p) => p.wire.merge_ltp);

  const rdmUniformOn = () =>
    rows().length > 0 && rows().every((p) => p.wire.rdm_active_on_port);

  const rdmUniformOff = () =>
    rows().length > 0 && rows().every((p) => !p.wire.rdm_active_on_port);

  const rdmMixed = () => rows().length > 0 && !rdmUniformOn() && !rdmUniformOff();

  const convAllSacn = () =>
    rows().length > 0 &&
    rows().every((p) =>
      p.wire.artnet_output_capable
        ? p.wire.output_sacn_selected
        : p.wire.input_sacn_selected
    );

  const convAllArtnet = () =>
    rows().length > 0 &&
    rows().every((p) =>
      !(p.wire.artnet_output_capable
        ? p.wire.output_sacn_selected
        : p.wire.input_sacn_selected)
    );

  const convMixed = () => rows().length > 0 && !convAllSacn() && !convAllArtnet();

  const protocolUniform = createMemo(() => {
    if (rows().length === 0) return { ok: true as const, code: 0 };
    const c0 = rows()[0]!.wire.protocol_code & 0x3f;
    const same = rows().every((p) => (p.wire.protocol_code & 0x3f) === c0);
    return same ? { ok: true as const, code: c0 } : { ok: false as const, code: -1 };
  });

  const directionUniformOut = () =>
    rows().length > 0 &&
    rows().every((p) => p.wire.artnet_output_capable && !p.wire.artnet_input_capable);

  const directionUniformIn = () =>
    rows().length > 0 &&
    rows().every((p) => p.wire.artnet_input_capable && !p.wire.artnet_output_capable);

  const directionUniformIo = () =>
    rows().length > 0 &&
    rows().every((p) => p.wire.artnet_output_capable && p.wire.artnet_input_capable);

  /** PollReply PortTypes: current path is output-only (bit7 set, bit6 clear). */
  const directionWireAllOut = () =>
    rows().length > 0 &&
    rows().every((p) => (p.port_type & 0x80) !== 0 && (p.port_type & 0x40) === 0);

  /** PollReply PortTypes: current path is input-only (bit6 set, bit7 clear). */
  const directionWireAllIn = () =>
    rows().length > 0 &&
    rows().every((p) => (p.port_type & 0x40) !== 0 && (p.port_type & 0x80) === 0);

  /** GoodOutputB bit6 set = continuous output style (wire); clear = delta. */
  const styleAllContinuous = () =>
    rows().length > 0 &&
    rows().every((p) => (p.good_output_b & 0x40) !== 0);

  const styleAllDelta = () =>
    rows().length > 0 &&
    rows().every((p) => (p.good_output_b & 0x40) === 0);

  const canBulkDirection = () =>
    directionUniformOut() || directionUniformIn() || directionUniformIo();

  const addrSelectionOk = () => {
    if (rows().length === 0) return false;
    const outFam = rows().every((p) => p.wire.artnet_output_capable);
    const inOnly = allSelectedInputOnly();
    if (outFam && !inOnly) return true;
    if (inOnly) return true;
    return false;
  };

  const pendingKeysForPort = (p: ProductPortDto): string[] => [
    wrRdmKey(p.bind_index, p.slot),
    wrMergeLtpKey(p.bind_index, p.slot),
    wrSacnKey(p.bind_index, p.slot),
    wrStyleContinuousKey(p.bind_index, p.slot),
    wrDirTxKey(p.bind_index, p.slot),
    wrDirRxKey(p.bind_index, p.slot),
    portFieldKey(p.bind_index, p.slot),
    outFieldKey(p.bind_index, p.slot),
    inFieldKey(p.bind_index, p.slot),
  ];

  const bulkVerifying = createMemo(() => {
    const map = pe();
    const id = productId();
    for (const p of rows()) {
      for (const k of pendingKeysForPort(p)) {
        const e = map[k];
        if (e && e.productId === id && !e.warning) return true;
      }
    }
    return false;
  });

  const bulkWireWarnings = createMemo(() => {
    const map = pe();
    const id = productId();
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of rows()) {
      for (const k of pendingKeysForPort(p)) {
        const w = map[k]?.warning;
        if (w && map[k]?.productId === id && !seen.has(w)) {
          seen.add(w);
          out.push(w);
        }
      }
    }
    return out;
  });

  createEffect(() => {
    rows();
    setBulkError(null);
    if (allSelectedInputOnly()) setAddrMode("input");
    else setAddrMode("output");
  });

  const runBulkWireOp = async (
    op: string,
    buildPendings?: (list: ProductPortDto[]) => PollReplyPendingEntry[]
  ) => {
    if (busy()) return;
    props.setBulkBusy(true);
    setBulkError(null);
    const snapshot = rows();
    try {
      for (const p of snapshot) {
        await props.sendPortWireCommand(op, p.bind_index, p.slot);
      }
      const pend = buildPendings?.(snapshot);
      if (pend && pend.length > 0) {
        props.registerPollReplyPendings(pend);
      } else {
        await props.onReadCurrent?.();
      }
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    } finally {
      props.setBulkBusy(false);
    }
  };

  const runRdmToggle = async () => {
    if (busy() || rdmToggleDisabledReason()) return;
    const wantOn = !rdmUniformOn();
    const op = wantOn ? "rdm_enable" : "rdm_disable";
    await runBulkWireOp(op, (list) =>
      list.map((p) => ({
        key: wrRdmKey(p.bind_index, p.slot),
        field: "port_wire_rdm",
        expectedValue: wantOn ? "1" : "0",
        baselineValue: p.wire.rdm_active_on_port ? "1" : "0",
      }))
    );
  };

  const applyConvSelect = async (next: "artnet" | "sacn") => {
    if (busy() || convSelectDisabledReason()) return;
    const wantSacn = next === "sacn";
    const op = wantSacn ? "select_sacn" : "select_artnet";
    await runBulkWireOp(op, (list) =>
      list.map((p) => {
        const sacn = p.wire.artnet_output_capable
          ? p.wire.output_sacn_selected
          : p.wire.input_sacn_selected;
        return {
          key: wrSacnKey(p.bind_index, p.slot),
          field: "port_wire_sacn",
          expectedValue: wantSacn ? "1" : "0",
          baselineValue: sacn ? "1" : "0",
        };
      })
    );
  };

  const sendArtAddressPortName = async (
    bindIndex: number,
    portName: string,
    deviceStatus2: number | null | undefined
  ): Promise<void> => {
    const d = props.device();
    await invoke("send_art_address", {
      params: {
        target_ip: d.ip_address,
        transport: d.transport_addr ?? null,
        bind_index: bindIndex,
        port_name: portName,
        long_name: null,
        set_output_universe: null,
        set_input_universe: null,
        led_command: null,
        port_wire_command: null,
        device_status2: deviceStatus2 ?? d.status2 ?? null,
      },
    });
  };

  const applyBulkLabel = async () => {
    const text = labelDraft().trim();
    if (!text || busy()) return;
    props.setBulkBusy(true);
    setBulkError(null);
    const snapshot = rows();
    const d = props.device();
    try {
      const bindLabel = new Map<number, string>();
      let seq = 0;
      for (const p of snapshot) {
        if (bindLabel.has(p.bind_index)) continue;
        const label = formatMassPortLabel(text, seq);
        seq += 1;
        bindLabel.set(p.bind_index, label);
        await sendArtAddressPortName(
          p.bind_index,
          label,
          p.status2 ?? d.status2 ?? null
        );
      }
      setLabelOpen(false);
      const pend: PollReplyPendingEntry[] = snapshot.map((p) => ({
        key: portFieldKey(p.bind_index, p.slot),
        field: "port_name",
        expectedValue: bindLabel.get(p.bind_index) ?? text,
        baselineValue: p.label ?? "",
      }));
      props.registerPollReplyPendings(pend);
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    } finally {
      props.setBulkBusy(false);
    }
  };

  const applyBulkUniverse = async (addr15: number) => {
    const d = props.device();
    const mode = addrMode();
    props.setBulkBusy(true);
    setBulkError(null);
    const snapshot = rows();
    try {
      for (const p of snapshot) {
        const baseline =
          mode === "output" ? p.output_universe : (p.input_universe ?? p.output_universe);
        if (!p.wire.node_supports_15bit_address) {
          const err = netSubMismatchError(addr15, baseline);
          if (err) throw new Error(err);
        }
        if (mode === "output") {
          await invoke("send_art_address", {
            params: {
              target_ip: d.ip_address,
              transport: d.transport_addr ?? null,
              bind_index: p.bind_index,
              port_name: null,
              long_name: null,
              set_output_universe: { slot: p.slot, universe: addr15 },
              set_input_universe: null,
              led_command: null,
              port_wire_command: null,
              device_status2: p.status2 ?? d.status2 ?? null,
            },
          });
        } else {
          await invoke("send_art_address", {
            params: {
              target_ip: d.ip_address,
              transport: d.transport_addr ?? null,
              bind_index: p.bind_index,
              port_name: null,
              long_name: null,
              set_output_universe: null,
              set_input_universe: { slot: p.slot, universe: addr15 },
              led_command: null,
              port_wire_command: null,
              device_status2: p.status2 ?? d.status2 ?? null,
            },
          });
        }
      }
      setAddrOpen(false);
      const pend: PollReplyPendingEntry[] = snapshot.map((p) => {
        if (mode === "output") {
          return {
            key: outFieldKey(p.bind_index, p.slot),
            field: "port_out",
            expectedValue: String(addr15),
            baselineValue: String(p.output_universe),
          };
        }
        return {
          key: inFieldKey(p.bind_index, p.slot),
          field: "port_in",
          expectedValue: String(addr15),
          baselineValue:
            p.input_universe != null ? String(p.input_universe) : "",
        };
      });
      props.registerPollReplyPendings(pend);
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    } finally {
      props.setBulkBusy(false);
    }
  };

  const firstRow = () => rows()[0];
  const addrBaseline = () => {
    const p = firstRow();
    if (!p) return 0;
    return addrMode() === "output"
      ? p.output_universe
      : (p.input_universe ?? p.output_universe);
  };

  const openLabelPopover = () => {
    const p = firstRow();
    setLabelDraft(p?.label ?? "");
    setLabelOpen(true);
    setAddrOpen(false);
  };

  const openAddrPopover = () => {
    setAddrOpen(true);
    setLabelOpen(false);
  };

  const protocolDisabledReason =
    "Port protocol (PollReply PortTypes bits 5..0) cannot be programmed via ArtAddress in LumenFlow yet; use the device configuration tool or vendor software.";

  const mergeDisabledReason = () =>
    !allSelectedOutput()
      ? "Select output-capable ports only."
      : busy()
        ? "Another bulk send is in progress."
        : undefined;

  const rdmToggleDisabledReason = () =>
    !allSelectedOutput()
      ? "Select output-capable ports only."
      : rdmMixed()
        ? "Selected ports disagree on RDM (PollReply). Pick ports with uniform RDM state."
        : !canRdmArtAddr()
          ? "Node Status2 bit7 clear: RDM is not controllable via ArtAddress on this node. Next: confirm PollReply Status2 in Devices › Protocol."
          : busy()
            ? "Another bulk send is in progress."
            : undefined;

  const convSelectDisabledReason = () =>
    !allSelectedOutput()
      ? "Select output-capable ports only."
      : convMixed()
        ? "Selected ports disagree on Art-Net vs sACN conversion (PollReply). Pick ports with uniform conversion."
        : !canSacnSwitch()
          ? "Node Status2 bit4 clear: Art-Net/sACN conversion switching is not advertised. Next: confirm PollReply Status2 in Devices › Protocol."
          : busy()
            ? "Another bulk send is in progress."
            : undefined;

  const directionDisabledReason = () =>
    !canBulkDirection()
      ? "Ports must be all output-only, all input-only, or all I/O-capable for a single direction bulk action."
      : busy()
        ? "Another bulk send is in progress."
        : undefined;

  const styleDisabledReason = () =>
    !allSelectedOutput()
      ? "Select output-capable ports only."
      : !canOutputStyleArtAddr()
        ? "Node Status2 bit6 clear: output style (delta vs continuous) is not controllable via ArtAddress on this node. Next: confirm PollReply Status2 in Devices › Protocol."
        : !allDmxProtocol()
          ? "Output style commands are only offered when all selected ports report DMX512 (protocol code 0)."
          : busy()
            ? "Another bulk send is in progress."
            : undefined;

  const addrDisabledReason = () =>
    rows().length === 0
      ? "No ports selected."
      : !addrSelectionOk()
        ? "Select ports that are all output-capable (including I/O) or all input-only for bulk address edit."
        : busy()
          ? "Another bulk send is in progress."
          : undefined;

  const labelDisabledReason = () =>
    rows().length === 0
      ? "No ports selected."
      : busy()
        ? "Another bulk send is in progress."
        : undefined;

  const protoVal = () =>
    protocolUniform().ok ? String(protocolUniform().code) : "mixed";

  const labelButtonCaption = () => {
    if (rows().length === 0) return "Edit label…";
    const first = (rows()[0]!.label ?? "").trim();
    if (!first) return "Edit label…";
    const allSame = rows().every((p) => (p.label ?? "").trim() === first);
    if (!allSame) return "Edit label…";
    return first.length > 22 ? `${first.slice(0, 22)}…` : first;
  };

  const showAddrInOutTabs = () =>
    rows().length > 0 &&
    rows().every((p) => p.wire.artnet_output_capable) &&
    rows().some((p) => p.wire.artnet_input_capable);

  /** Per-port `wire.node_supports_15bit_address` (PollReply Status2 bit3 on each port's bind page). */
  const addressPickerMeta = createMemo(() => {
    const list = rows();
    if (list.length === 0) {
      return { allowNetSub: true, notes: [] as string[] };
    }
    const flags = list.map((p) => p.wire.node_supports_15bit_address);
    const all15 = flags.every(Boolean);
    const none15 = flags.every((f) => !f);
    const binds = [...new Set(list.map((p) => p.bind_index))].sort((a, b) => a - b);
    const notes: string[] = [];

    if (all15) {
      notes.push(
        "PollReply Status2 bit3 set on every selected port — full 15-bit port address. Net, SubNet, and Universe are editable here (within ArtAddress limits)."
      );
      if (binds.length > 1) {
        notes.push(
          `Selection spans BindIndex ${binds.join(", ")}. Each port uses its bind page's address fields (multi-page nodes such as Swisson XND-8 often differ per port).`
        );
      } else {
        notes.push(
          "Single bind page: addressing policy matches all selected rows; each slot still follows its own PollReply port address."
        );
      }
      return { allowNetSub: true, notes };
    }
    if (none15) {
      notes.push(
        "PollReply Status2 bit3 clear — 8-bit addressing on the involved bind page(s). Net/Sub are read-only; only the universe nibble (0–15) is editable (same as table double-click)."
      );
      if (binds.length > 1) {
        notes.push(
          `BindIndex values: ${binds.join(", ")}. If pages disagree, select ports from one bind at a time for clearer feedback.`
        );
      }
      return { allowNetSub: false, notes };
    }
    notes.push(
      "Mixed selection: some ports report 15-bit support (Status2 bit3) and others 8-bit only (often across bind pages). Net/Sub are disabled until the selection is uniform."
    );
    return { allowNetSub: false, notes };
  });

  const convSelectValue = () => {
    if (convMixed()) return "mixed";
    return convAllSacn() ? "sacn" : "artnet";
  };

  return (
    <div
      class="flex flex-col gap-2 rounded-md border border-teal/30 bg-teal/5 px-2 py-2"
      data-testid="ports-bulk-bar"
    >
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="whitespace-nowrap font-mono text-[10px] font-semibold text-teal">
          {rows().length} selected
        </span>
        <span class="text-[9px] text-muted">
          Secondary edit bar (mass apply). Prefer double-click in table/cards for
          single-field edits.
        </span>
        <Show when={busy() || bulkVerifying()}>
          <span
            class="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-teal/50 border-t-teal align-middle"
            title={
              busy()
                ? "Sending ArtAddress…"
                : "Waiting for ArtPollReply to confirm wire state…"
            }
            data-testid="ports-bulk-spinner"
            aria-hidden="true"
          />
        </Show>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <div class="flex flex-col gap-0.5">
          <span class="text-[9px] font-medium uppercase tracking-wide text-muted">
            Merge
          </span>
          <div class="flex overflow-hidden rounded border border-edge">
            <button
              type="button"
              disabled={!!mergeDisabledReason()}
              title={bulkControlTitle(
                "ArtAddress: merge HTP on each selected output port (PollReply merge bit follows).",
                mergeDisabledReason()
              )}
              class={segClass(!mergeAllLtp(), !mergeDisabledReason())}
              onClick={() =>
                void runBulkWireOp("merge_htp", (list) =>
                  list.map((p) => ({
                    key: wrMergeLtpKey(p.bind_index, p.slot),
                    field: "port_wire_merge_ltp",
                    expectedValue: "0",
                    baselineValue: p.wire.merge_ltp ? "1" : "0",
                  }))
                )
              }
            >
              HTP
            </button>
            <button
              type="button"
              disabled={!!mergeDisabledReason()}
              title={bulkControlTitle(
                "ArtAddress: merge LTP on each selected output port (PollReply merge bit follows).",
                mergeDisabledReason()
              )}
              class={segClass(mergeAllLtp(), !mergeDisabledReason())}
              onClick={() =>
                void runBulkWireOp("merge_ltp", (list) =>
                  list.map((p) => ({
                    key: wrMergeLtpKey(p.bind_index, p.slot),
                    field: "port_wire_merge_ltp",
                    expectedValue: "1",
                    baselineValue: p.wire.merge_ltp ? "1" : "0",
                  }))
                )
              }
            >
              LTP
            </button>
          </div>
        </div>

        <div class="flex min-w-[5.5rem] shrink-0 flex-col gap-0.5">
          <span class="text-[9px] font-medium uppercase tracking-wide text-muted">
            RDM
          </span>
          <button
            type="button"
            disabled={!!rdmToggleDisabledReason()}
            title={bulkControlTitle(
              "Toggle RDM on each selected output port via ArtAddress. Label shows current PollReply-derived RDM state.",
              rdmToggleDisabledReason()
            )}
            class={`w-full min-w-[5.5rem] shrink-0 rounded border px-2 py-0.5 text-center text-[10px] font-medium transition-colors ${
              !!rdmToggleDisabledReason()
                ? "border-edge bg-surface text-muted opacity-50 cursor-not-allowed"
                : rdmMixed()
                  ? "border-edge-active bg-surface text-muted"
                  : rdmUniformOn()
                    ? "border-teal/50 bg-teal/15 text-teal"
                    : "border-edge-active bg-surface text-secondary hover:text-primary"
            }`}
            onClick={() => void runRdmToggle()}
          >
            {rdmMixed() ? "Mixed" : rdmUniformOn() ? "On" : "Off"}
          </button>
        </div>

        <div class="flex flex-col gap-0.5">
          <span class="text-[9px] font-medium uppercase tracking-wide text-muted">
            Conversion
          </span>
          <select
            class="h-7 max-w-[9rem] rounded border border-edge bg-obsidian px-1.5 text-[10px] text-primary disabled:opacity-50"
            disabled={!!convSelectDisabledReason()}
            title={bulkControlTitle(
              "ArtAddress: Art-Net vs sACN conversion on each selected output port (PollReply GoodOutput/GoodInput bit0).",
              convSelectDisabledReason()
            )}
            value={convSelectValue()}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === "artnet" || v === "sacn") void applyConvSelect(v);
            }}
          >
            <Show when={convMixed()}>
              <option value="mixed">Mixed</option>
            </Show>
            <option value="artnet">Art-Net</option>
            <option value="sacn">sACN</option>
          </select>
        </div>

        <div class="flex flex-col gap-0.5">
          <span class="text-[9px] font-medium uppercase tracking-wide text-muted">
            Protocol
          </span>
          <select
            class="h-7 max-w-[9rem] rounded border border-edge bg-obsidian px-1.5 text-[10px] text-primary opacity-60"
            disabled
            title={bulkControlTitle(
              "PollReply PortTypes protocol (DMX512, DALI, …).",
              protocolDisabledReason
            )}
            value={protoVal()}
          >
            <Show
              when={protocolUniform().ok}
              fallback={<option value="mixed">Mixed / other</option>}
            >
              <For each={PORT_PROTOCOL_SELECT_OPTIONS}>
                {(o) => <option value={String(o.value)}>{o.label}</option>}
              </For>
            </Show>
          </select>
        </div>

        <div class="flex flex-col gap-0.5">
          <span class="text-[9px] font-medium uppercase tracking-wide text-muted">
            Direction
          </span>
          <div class="flex overflow-hidden rounded border border-edge">
            <button
              type="button"
              disabled={!!directionDisabledReason()}
              title={bulkControlTitle(
                "ArtAddress: set port direction transmit (PollReply PortTypes bit7-only path).",
                directionDisabledReason()
              )}
              class={segClass(directionWireAllOut(), !directionDisabledReason())}
              onClick={() =>
                void runBulkWireOp("direction_tx", (list) =>
                  list.map((p) => ({
                    key: wrDirTxKey(p.bind_index, p.slot),
                    field: "port_direction_tx",
                    expectedValue: "1",
                    baselineValue: portDirTxWire(p.port_type) ? "1" : "0",
                  }))
                )
              }
            >
              Out
            </button>
            <button
              type="button"
              disabled={!!directionDisabledReason()}
              title={bulkControlTitle(
                "ArtAddress: set port direction receive (PollReply PortTypes bit6-only path).",
                directionDisabledReason()
              )}
              class={segClass(directionWireAllIn(), !directionDisabledReason())}
              onClick={() =>
                void runBulkWireOp("direction_rx", (list) =>
                  list.map((p) => ({
                    key: wrDirRxKey(p.bind_index, p.slot),
                    field: "port_direction_rx",
                    expectedValue: "1",
                    baselineValue: portDirRxWire(p.port_type) ? "1" : "0",
                  }))
                )
              }
            >
              In
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-0.5">
          <span class="text-[9px] font-medium uppercase tracking-wide text-muted">
            Output style
          </span>
          <div class="flex overflow-hidden rounded border border-edge">
            <button
              type="button"
              disabled={!!styleDisabledReason()}
              title={bulkControlTitle(
                "ArtAddress: set output style to delta (PollReply GoodOutputB bit6 clear).",
                styleDisabledReason()
              )}
              class={segClass(styleAllDelta(), !styleDisabledReason())}
              onClick={() =>
                void runBulkWireOp("style_delta", (list) =>
                  list.map((p) => ({
                    key: wrStyleContinuousKey(p.bind_index, p.slot),
                    field: "port_wire_style_continuous",
                    expectedValue: "0",
                    baselineValue: (p.good_output_b & 0x40) !== 0 ? "1" : "0",
                  }))
                )
              }
            >
              Delta
            </button>
            <button
              type="button"
              disabled={!!styleDisabledReason()}
              title={bulkControlTitle(
                "ArtAddress: set output style to continuous (PollReply GoodOutputB bit6 set).",
                styleDisabledReason()
              )}
              class={segClass(styleAllContinuous(), !styleDisabledReason())}
              onClick={() =>
                void runBulkWireOp("style_const", (list) =>
                  list.map((p) => ({
                    key: wrStyleContinuousKey(p.bind_index, p.slot),
                    field: "port_wire_style_continuous",
                    expectedValue: "1",
                    baselineValue: (p.good_output_b & 0x40) !== 0 ? "1" : "0",
                  }))
                )
              }
            >
              Continuous
            </button>
          </div>
        </div>

        <div class="relative flex flex-col gap-0.5">
          <span class="text-[9px] font-medium uppercase tracking-wide text-muted">
            Label
          </span>
          <button
            type="button"
            disabled={!!labelDisabledReason()}
            title={bulkControlTitle(
              "Apply port names via ArtAddress (one ShortName per bind index). If the name ends with digits, each successive bind in selection order increments that number (grandMA2 / dot2 style). Enter applies in the popover.",
              labelDisabledReason()
            )}
            class="h-7 max-w-[10rem] truncate rounded border border-edge-active bg-surface px-2 text-left text-[10px] text-secondary hover:border-teal/40 disabled:opacity-50"
            onClick={() => openLabelPopover()}
          >
            {labelButtonCaption()}
          </button>
          <Show when={labelOpen()}>
            <div class="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-edge-active bg-surface p-2 shadow-xl">
              <label class="text-[9px] text-muted">Port name (max 17)</label>
              <p class="mt-1 text-[9px] leading-snug text-muted">
                Trailing digits count up per bind in selection order (same idea as grandMA2 / dot2
                &quot;Mac700 1&quot; → 2, 3… on successive fixtures).
              </p>
              <input
                type="text"
                maxlength={17}
                class="mt-1 w-full rounded border border-edge bg-obsidian px-2 py-1 text-[11px] text-primary"
                value={labelDraft()}
                onInput={(e) => setLabelDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyBulkLabel();
                  }
                }}
              />
              <div class="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  class="text-[10px] text-muted"
                  onClick={() => setLabelOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded border border-teal/40 bg-teal/10 px-2 py-0.5 text-[10px] text-teal"
                  onClick={() => void applyBulkLabel()}
                >
                  Apply
                </button>
              </div>
            </div>
          </Show>
        </div>

        <div class="relative flex flex-col gap-0.5">
          <span class="text-[9px] font-medium uppercase tracking-wide text-muted">
            Address
          </span>
          <Show when={showAddrInOutTabs()}>
            <div class="mb-1 flex gap-1">
              <button
                type="button"
                class={`rounded border px-1.5 py-0.5 text-[9px] ${addrMode() === "output" ? "border-teal/40 bg-teal/10 text-teal" : "border-edge text-muted"}`}
                onClick={() => setAddrMode("output")}
              >
                Out
              </button>
              <button
                type="button"
                class={`rounded border px-1.5 py-0.5 text-[9px] ${addrMode() === "input" ? "border-teal/40 bg-teal/10 text-teal" : "border-edge text-muted"}`}
                onClick={() => setAddrMode("input")}
              >
                In
              </button>
            </div>
          </Show>
          <button
            type="button"
            disabled={!!addrDisabledReason()}
            title={bulkControlTitle(
              "Open picker for port address (PollReply + Status2 bit3 govern Net/Sub editability). Enter applies in the picker.",
              addrDisabledReason()
            )}
            class="h-7 rounded border border-edge-active bg-surface px-2 text-left text-[10px] text-secondary hover:border-teal/40 disabled:opacity-50"
            onClick={() => openAddrPopover()}
          >
            Address…
          </button>
          <Show when={addrOpen() && firstRow()}>
            <PortAddressPickerPopover
              baselineAddr15={addrBaseline()}
              initialAddr15={addrBaseline()}
              allowNetSubEdit={addressPickerMeta().allowNetSub}
              compatibilityNotes={addressPickerMeta().notes}
              onApply={(v) => void applyBulkUniverse(v)}
              onClose={() => setAddrOpen(false)}
            />
          </Show>
        </div>

        <span class="mx-1 h-5 w-px self-center bg-edge-active" />

        <button
          type="button"
          disabled={rows().length === 0 || busy() || !allSelectedOutput()}
          title={bulkControlTitle(
            "ArtAddress: clear output buffer on each selected output port.",
            rows().length === 0
              ? "No ports selected."
              : !allSelectedOutput()
                ? "Select output-capable ports only."
                : busy()
                  ? "Another bulk send is in progress."
                  : undefined
          )}
          class={segClass(false, allSelectedOutput() && rows().length > 0 && !busy())}
          onClick={() => void runBulkWireOp("clear_buffer")}
        >
          Clear buf
        </button>
        <button
          type="button"
          disabled={rows().length === 0 || busy()}
          title={bulkControlTitle(
            "ArtAddress: cancel merge once per involved bind index.",
            rows().length === 0
              ? "No ports selected."
              : busy()
                ? "Another bulk send is in progress."
                : undefined
          )}
          class={segClass(false, rows().length > 0 && !busy())}
          onClick={() => void props.runCancelMergeBulk()}
        >
          Cancel merge
        </button>
        <button
          type="button"
          class="ml-auto text-[10px] text-muted hover:text-secondary"
          onClick={() => props.clearSelection()}
        >
          Clear selection
        </button>
      </div>
      <Show when={bulkError()}>
        <div class="text-[10px] text-amber" data-testid="ports-bulk-error">
          {bulkError()}
        </div>
      </Show>
      <For each={bulkWireWarnings()}>
        {(w) => (
          <div class="text-[10px] text-amber" data-testid="ports-bulk-warning">
            {w}
          </div>
        )}
      </For>
    </div>
  );
};
