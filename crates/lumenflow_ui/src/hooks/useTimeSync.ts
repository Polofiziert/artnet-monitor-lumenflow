import { createSignal } from "solid-js";
import { onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";

/** Duration in ms to show the sync indicator after last ArtTimeSync packet. */
const SYNC_INDICATOR_DURATION_MS = 3000;

/**
 * Listens to ArtTimeSync (0x9800) Tauri events. Returns a signal that is true
 * when we have received at least one ArtTimeSync in the last few seconds.
 * The minimal ArtTimeSync packet is a sync signal only; it does not carry
 * date/time, so the local clock remains primary.
 */
export function useTimeSync(): () => boolean {
  const [isSynced, setIsSynced] = createSignal(false);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    const unlisten = await listen<{ timestampNanos: number }>(
      "time-sync",
      () => {
        setIsSynced(true);
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setIsSynced(false);
          timeoutId = null;
        }, SYNC_INDICATOR_DURATION_MS);
      }
    );

    onCleanup(() => {
      unlisten();
      if (timeoutId) clearTimeout(timeoutId);
    });
  });

  return isSynced;
}
