import { createEffect, onCleanup, onMount } from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface DmxFrame {
  universeId: number;
  data: Uint8Array;
}

function parseDmxFrame(raw: number[]): DmxFrame[] {
  const buf = new Uint8Array(raw);
  const view = new DataView(buf.buffer);
  const frames: DmxFrame[] = [];
  let offset = 0;

  while (offset + 4 <= buf.length) {
    const universeId = view.getUint16(offset, true);
    const len = view.getUint16(offset + 2, true);
    offset += 4;
    if (offset + len > buf.length) break;
    frames.push({
      universeId,
      data: buf.slice(offset, offset + len),
    });
    offset += len;
  }
  return frames;
}

export function useDmxStream(
  activeIds: () => number[],
  isMockMode: () => boolean
) {
  const [universeData, setUniverseData] = createStore<
    Record<number, Uint8Array>
  >({});

  onMount(async () => {
    const unlisten = await listen<number[]>("dmx-frame", (event) => {
      const frames = parseDmxFrame(event.payload);
      for (const frame of frames) {
        setUniverseData(
          produce((state) => {
            state[frame.universeId] = frame.data;
          })
        );
      }
    });

    onCleanup(() => unlisten());
  });

  createEffect(() => {
    const ids = activeIds();
    invoke("set_active_universes", { ids }).catch(console.error);
    if (ids.length === 0) {
      setUniverseData(reconcile({}));
    }
  });

  createEffect((prev) => {
    const mock = isMockMode();
    if (prev === true && mock === false) {
      setUniverseData(reconcile({}));
    }
    return mock;
  });

  return universeData;
}

export async function getAvailableUniverses(): Promise<number[]> {
  return invoke<number[]>("get_available_universes");
}
