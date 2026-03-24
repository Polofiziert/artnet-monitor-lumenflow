import { createSignal, createEffect, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ArtNetProductDto } from "../components/DeviceList";

/**
 * Shared SWR-ish devices store:
 * - visibility-aware polling (D5 phase 1)
 * - warm cache render + revalidate (D5 phase 2)
 * - push event subscription with fallback polling (D5 phase 3 ready)
 */
type DevicesUpdatedEvent = {
  version: number;
  timestamp_nanos: number;
  products: ArtNetProductDto[];
};

interface UseDevicesOptions {
  enabled: () => boolean;
  shouldPoll: () => boolean;
  pollMs?: number;
  staleMs?: number;
}

let cacheProducts: ArtNetProductDto[] = [];
let cacheUpdatedAt = 0;

export function useDevices(options: UseDevicesOptions) {
  const [products, setProducts] = createSignal<ArtNetProductDto[]>(cacheProducts);
  const [isLoading, setIsLoading] = createSignal(false);
  const [lastUpdatedAt, setLastUpdatedAt] = createSignal(cacheUpdatedAt);
  const [error, setError] = createSignal<string | null>(null);

  const pollMs = () => options.pollMs ?? 2000;
  const staleMs = () => options.staleMs ?? 5000;

  const applyProducts = (next: ArtNetProductDto[]) => {
    cacheProducts = next;
    cacheUpdatedAt = Date.now();
    setProducts(next);
    setLastUpdatedAt(cacheUpdatedAt);
  };

  const refresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<ArtNetProductDto[]>("get_artnet_products");
      applyProducts(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  createEffect(() => {
    if (!options.enabled()) return;
    // D5 SWR: immediately show cache, revalidate if stale.
    if (cacheProducts.length > 0) {
      setProducts(cacheProducts);
      setLastUpdatedAt(cacheUpdatedAt);
    }
    if (Date.now() - cacheUpdatedAt > staleMs()) {
      void refresh();
    }
  });

  createEffect(() => {
    if (!options.enabled() || !options.shouldPoll()) return;
    void refresh();
    const poll = setInterval(() => {
      void refresh();
    }, pollMs());
    onCleanup(() => clearInterval(poll));
  });

  createEffect(() => {
    if (!options.enabled()) return;
    let unlisten: (() => void) | undefined;
    listen<DevicesUpdatedEvent>("devices-updated", (evt) => {
      const payload = evt.payload;
      if (!payload || !Array.isArray(payload.products)) return;
      applyProducts(payload.products);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // Keep fallback polling path active if event subscription fails.
      });
    onCleanup(() => {
      unlisten?.();
    });
  });

  const isStale = () => Date.now() - lastUpdatedAt() > staleMs();

  return {
    products,
    isLoading,
    isStale,
    lastUpdatedAt,
    error,
    refresh,
  };
}
