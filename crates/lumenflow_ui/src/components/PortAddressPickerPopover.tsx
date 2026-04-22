import type { Component } from "solid-js";
import { createSignal, Show, For, createEffect } from "solid-js";
import { parsePortAddress, netSubMismatchError } from "../lib/devicePortAddress";

function splitUni15(u: number): { net: number; sub: number; uni: number } {
  return {
    net: (u >> 8) & 0x7f,
    sub: (u >> 4) & 0x0f,
    uni: u & 0x0f,
  };
}

function compose15(net: number, sub: number, uni: number): number {
  return ((net & 0x7f) << 8) | ((sub & 0x0f) << 4) | (uni & 0x0f);
}

/** When only the universe nibble may change, force Net/Sub from `baseline`. */
function clampToBaselineUniverseOnly(baseline: number, addr: number): number {
  return (baseline & 0xfff0) | (addr & 0x0f);
}

/** When N/S/U are complete valid integers, returns composed 15-bit address; else null. */
function tryComposeFromNsuStrings(
  netStr: string,
  subStr: string,
  uniStr: string
): number | null {
  const t = (s: string) => s.trim();
  const nStr = t(netStr);
  const sStr = t(subStr);
  const uStr = t(uniStr);
  if (nStr === "" || sStr === "" || uStr === "") return null;
  const n = Number(nStr);
  const s = Number(sStr);
  const u = Number(uStr);
  if (![n, s, u].every((x) => Number.isInteger(x))) return null;
  if (n < 0 || n > 127 || s < 0 || s > 15 || u < 0 || u > 15) return null;
  return compose15(n, s, u);
}

export interface PortAddressPickerPopoverProps {
  /** Per-port baseline for nibble-only validation (output or input row). */
  baselineAddr15: number;
  initialAddr15: number;
  /**
   * When false, PollReply reports 8-bit addressing (Status2 bit3 clear on this port's bind page):
   * Net/Sub are display-only; only the universe nibble can change (matches ArtAddress limits in LumenFlow).
   */
  allowNetSubEdit: boolean;
  /** Optional operator-facing lines (bind pages, mixed selection, examples). */
  compatibilityNotes?: string[];
  onApply: (addr15: number) => void;
  onClose: () => void;
}

const nsDisabledTitle =
  "Net/Sub locked: PollReply Status2 bit3 clear on this port's bind page (8-bit port addressing). Only the Universe nibble (0–15) can be edited here.";

/** Popover: NSU column + 15-bit field; NSU updates 15-bit on blur; 15-bit updates NSU on input/blur. */
export const PortAddressPickerPopover: Component<PortAddressPickerPopoverProps> = (
  props
) => {
  const s0 = splitUni15(props.initialAddr15);
  const [net, setNet] = createSignal(String(s0.net));
  const [sub, setSub] = createSignal(String(s0.sub));
  const [uni, setUni] = createSignal(String(s0.uni));
  const [uni15Text, setUni15Text] = createSignal(String(props.initialAddr15));
  const [error, setError] = createSignal<string | null>(null);

  const allowNs = () => props.allowNetSubEdit;

  createEffect(() => {
    const b = props.baselineAddr15;
    if (!allowNs()) {
      const sp = splitUni15(b);
      setNet(String(sp.net));
      setSub(String(sp.sub));
    }
  });

  const applyNsuToUni15 = () => {
    const n = Number(net());
    const s = Number(sub());
    const u = Number(uni());
    if (![n, s, u].every((x) => Number.isInteger(x))) {
      setError("Net, SubNet, and Universe must be integers.");
      return;
    }
    if (n < 0 || n > 127 || s < 0 || s > 15 || u < 0 || u > 15) {
      setError("Net 0..127, SubNet 0..15, Universe nibble 0..15.");
      return;
    }
    let composed = compose15(n, s, u);
    if (!allowNs()) {
      composed = clampToBaselineUniverseOnly(props.baselineAddr15, composed);
    }
    setUni15Text(String(composed));
    const sp = splitUni15(composed);
    setNet(String(sp.net));
    setSub(String(sp.sub));
    setUni(String(sp.uni));
    setError(null);
  };

  const syncNsuToUni15OnInput = (nextNet: string, nextSub: string, nextUni: string) => {
    if (!allowNs()) return;
    const composed = tryComposeFromNsuStrings(nextNet, nextSub, nextUni);
    if (composed !== null) {
      setUni15Text(String(composed));
      setError(null);
    }
  };

  const syncUni15Field = (raw: string, opts?: { coerceNibbleOnly?: boolean }) => {
    setUni15Text(raw);
    const p = parsePortAddress(raw);
    if (p.error || p.value === undefined) return;
    let v = p.value;
    if (opts?.coerceNibbleOnly) {
      v = clampToBaselineUniverseOnly(props.baselineAddr15, v);
      setUni15Text(String(v));
    }
    const sp = splitUni15(v);
    setNet(String(sp.net));
    setSub(String(sp.sub));
    setUni(String(sp.uni));
    setError(null);
  };

  const apply = () => {
    const parsed15 = parsePortAddress(uni15Text());
    if (parsed15.error || parsed15.value === undefined) {
      setError(parsed15.error ?? "Invalid 15-bit address.");
      return;
    }
    let v = parsed15.value;
    if (!allowNs()) {
      v = clampToBaselineUniverseOnly(props.baselineAddr15, v);
      const mismatch = netSubMismatchError(v, props.baselineAddr15);
      if (mismatch) {
        setError(mismatch);
        return;
      }
    }
    setError(null);
    props.onApply(v);
    props.onClose();
  };

  const applyOnEnter = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    apply();
  };

  const nsInputClass = (enabled: boolean) =>
    `w-10 rounded border px-1 py-0.5 text-[11px] font-mono ${
      enabled
        ? "border-edge bg-obsidian text-primary"
        : "cursor-not-allowed border-edge/60 bg-surface/80 text-muted opacity-70"
    }`;

  return (
    <div
      class="absolute left-0 top-full z-30 mt-1 w-[min(100vw-1rem,260px)] max-w-[260px] rounded-lg border border-edge-active bg-surface p-2 shadow-xl"
      role="dialog"
      aria-label="Port address"
      onClick={(e) => e.stopPropagation()}
    >
      <div class="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Port address (15-bit)
      </div>
      <Show when={(props.compatibilityNotes?.length ?? 0) > 0}>
        <div class="mb-2 space-y-1 rounded border border-teal/20 bg-teal/5 px-2 py-1.5 text-[9px] leading-snug text-secondary">
          <For each={props.compatibilityNotes ?? []}>
            {(line) => <p>{line}</p>}
          </For>
        </div>
      </Show>
      <div class="flex items-start gap-2">
        <div class="flex shrink-0 flex-col gap-px font-mono leading-none">
          <label class="flex items-center gap-1 text-[9px] text-muted">
            <span class="w-2">N</span>
            <input
              type="text"
              inputmode="numeric"
              data-testid="port-addr-picker-net"
              class={nsInputClass(allowNs())}
              value={net()}
              disabled={!allowNs()}
              title={allowNs() ? "Net (0–127)" : nsDisabledTitle}
              readOnly={!allowNs()}
              onInput={(e) => {
                if (!allowNs()) return;
                const v = e.currentTarget.value;
                setNet(v);
                syncNsuToUni15OnInput(v, sub(), uni());
              }}
              onBlur={() => allowNs() && applyNsuToUni15()}
              onKeyDown={applyOnEnter}
            />
          </label>
          <label class="flex items-center gap-1 text-[9px] text-muted">
            <span class="w-2">S</span>
            <input
              type="text"
              inputmode="numeric"
              data-testid="port-addr-picker-sub"
              class={nsInputClass(allowNs())}
              value={sub()}
              disabled={!allowNs()}
              title={allowNs() ? "SubNet (0–15)" : nsDisabledTitle}
              readOnly={!allowNs()}
              onInput={(e) => {
                if (!allowNs()) return;
                const v = e.currentTarget.value;
                setSub(v);
                syncNsuToUni15OnInput(net(), v, uni());
              }}
              onBlur={() => allowNs() && applyNsuToUni15()}
              onKeyDown={applyOnEnter}
            />
          </label>
          <label class="flex items-center gap-1 text-[9px] text-muted">
            <span class="w-2">U</span>
            <input
              type="text"
              inputmode="numeric"
              data-testid="port-addr-picker-uni"
              class="w-10 rounded border border-edge bg-obsidian px-1 py-0.5 text-[11px] text-primary"
              value={uni()}
              title="Universe nibble (0–15)"
              onInput={(e) => {
                const v = e.currentTarget.value;
                setUni(v);
                if (allowNs()) {
                  syncNsuToUni15OnInput(net(), sub(), v);
                } else {
                  const composed = tryComposeFromNsuStrings(net(), sub(), v);
                  if (composed !== null) {
                    const c = clampToBaselineUniverseOnly(props.baselineAddr15, composed);
                    setUni15Text(String(c));
                    const sp = splitUni15(c);
                    setNet(String(sp.net));
                    setSub(String(sp.sub));
                    setUni(String(sp.uni));
                    setError(null);
                  }
                }
              }}
              onBlur={() => applyNsuToUni15()}
              onKeyDown={applyOnEnter}
            />
          </label>
        </div>
        <div class="h-16 w-px shrink-0 bg-edge" />
        <div class="min-w-0 flex-1">
          <label class="block text-[9px] text-muted">
            Universe (0–32767)
            <Show when={!allowNs()}>
              <span class="ml-1 font-normal text-amber">· nibble-only edit</span>
            </Show>
          </label>
          <input
            type="text"
            inputmode="numeric"
            data-testid="port-addr-picker-uni15"
            class="mt-0.5 w-full rounded border border-edge bg-obsidian px-2 py-1 font-mono text-sm text-primary"
            value={uni15Text()}
            onInput={(e) => {
              syncUni15Field(e.currentTarget.value, {
                coerceNibbleOnly: !allowNs(),
              });
            }}
            onBlur={() => {
              const p = parsePortAddress(uni15Text());
              if (!p.error && p.value !== undefined) {
                const v = allowNs()
                  ? p.value
                  : clampToBaselineUniverseOnly(props.baselineAddr15, p.value);
                const sp = splitUni15(v);
                setNet(String(sp.net));
                setSub(String(sp.sub));
                setUni(String(sp.uni));
                setUni15Text(String(v));
                setError(null);
              }
            }}
            onKeyDown={applyOnEnter}
          />
        </div>
      </div>
      <Show when={error()}>
        <div class="mt-1 text-[10px] text-amber">{error()}</div>
      </Show>
      <div class="mt-2 flex justify-end gap-2">
        <button
          type="button"
          class="rounded border border-edge px-2 py-0.5 text-[10px] text-muted hover:border-edge-active"
          onClick={() => props.onClose()}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded border border-teal/40 bg-teal/10 px-2 py-0.5 text-[10px] text-teal hover:bg-teal/20"
          onClick={() => apply()}
        >
          Apply
        </button>
      </div>
    </div>
  );
};
