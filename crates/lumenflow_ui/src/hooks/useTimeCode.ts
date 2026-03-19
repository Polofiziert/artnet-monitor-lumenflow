import { createSignal } from "solid-js";
import { onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";

export interface TimeCode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  timecodeType: number;
}

const TIMECODE_TYPES = ["Film", "EBU", "DF", "SMPTE"] as const;

export function timecodeTypeLabel(t: number): string {
  return TIMECODE_TYPES[Math.min(3, Math.max(0, t))] ?? "?";
}

export function formatTimeCode(tc: TimeCode): string {
  const h = String(tc.hours).padStart(2, "0");
  const m = String(tc.minutes).padStart(2, "0");
  const s = String(tc.seconds).padStart(2, "0");
  const f = String(tc.frames).padStart(2, "0");
  return `${h}:${m}:${s}:${f}`;
}

/**
 * Listens to timecode Tauri events. Returns the latest timecode or null.
 */
export function useTimeCode() {
  const [timecode, setTimecode] = createSignal<TimeCode | null>(null);

  onMount(async () => {
    const unlisten = await listen<TimeCode>("timecode", (event) => {
      setTimecode(event.payload);
    });

    onCleanup(() => unlisten());
  });

  return timecode;
}
