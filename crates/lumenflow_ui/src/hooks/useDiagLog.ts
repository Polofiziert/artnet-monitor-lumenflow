import { createStore, produce } from "solid-js/store";
import { onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export interface DiagEntry {
  /** Client-side receive timestamp (ms since epoch) for display. */
  receivedAt: number;
  priority: number;
  message: string;
  sourceIp: string | null;
}

export interface DiagLogState {
  entries: DiagEntry[];
}

/** Priority: 0x10=DpLow, 0x40=DpMed, 0x80=DpHigh, 0xe0=DpCritical, 0xf0=DpVolatile */
export function priorityLabel(p: number): string {
  switch (p) {
    case 0x10:
      return "LOW";
    case 0x40:
      return "MED";
    case 0x80:
      return "HIGH";
    case 0xe0:
      return "CRIT";
    case 0xf0:
      return "VOL";
    default:
      return "???";
  }
}

export function priorityColor(p: number): string {
  switch (p) {
    case 0x10:
      return "text-muted";
    case 0x40:
      return "text-secondary";
    case 0x80:
      return "text-amber";
    case 0xe0:
      return "text-red";
    case 0xf0:
      return "text-teal";
    default:
      return "text-muted";
  }
}

/**
 * Listens to diag-entry Tauri events and fetches initial snapshot via get_diag_entries.
 */
export function useDiagLog() {
  const [state, setState] = createStore<DiagLogState>({ entries: [] });

  onMount(async () => {
    const raw = await invoke<
      {
        timestamp_nanos: number;
        priority: number;
        message: string;
        source_ip: string | null;
      }[]
    >("get_diag_entries").catch(() => []);
    const initial: DiagEntry[] = raw.map((r) => ({
      receivedAt: Date.now(),
      priority: r.priority,
      message: r.message,
      sourceIp: r.source_ip,
    }));
    setState("entries", initial);

    const unlisten = await listen<{
      priority: number;
      message: string;
      sourceIp: string | null;
    }>("diag-entry", (event) => {
      setState(
        produce((s) => {
          s.entries.push({
            receivedAt: Date.now(),
            priority: event.payload.priority,
            message: event.payload.message,
            sourceIp: event.payload.sourceIp ?? null,
          });
          if (s.entries.length > 512) s.entries.shift();
        })
      );
    });

    onCleanup(() => unlisten());
  });

  return state;
}
