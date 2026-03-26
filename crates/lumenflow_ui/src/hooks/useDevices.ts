import { createSignal, createEffect, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
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

type DevicePollReplyActivityEvent = {
  product_id: string;
  ip_address: string;
  bind_ip: string;
  bind_index: number;
  short_name: string;
  received_at_nanos: number;
  bundle_window_ms: number;
};

export type PollReplyActivity = {
  pulseNonce: number;
  lastReceivedAtMs: number;
  lastBindIndex: number;
  ipAddress: string;
  bindIp: string;
  shortName: string;
  bundleWindowMs: number;
  bundleCount: number;
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
  const [products, setProducts] =
    createSignal<ArtNetProductDto[]>(cacheProducts);
  const [pollReplyActivity, setPollReplyActivity] = createStore<
    Record<string, PollReplyActivity>
  >({});
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
    let disposed = false;
    listen<DevicesUpdatedEvent>("devices-updated", (evt) => {
      const payload = evt.payload;
      if (!payload || !Array.isArray(payload.products)) return;
      applyProducts(payload.products);
    })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {
        // Keep fallback polling path active if event subscription fails.
      });
    onCleanup(() => {
      disposed = true;
      unlisten?.();
    });
  });

  createEffect(() => {
    if (!options.enabled()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<DevicePollReplyActivityEvent>(
      "device-poll-reply-activity",
      (evt) => {
        const payload = evt.payload;
        if (!payload || !payload.product_id) return;
        const receivedAtMs = Math.floor(payload.received_at_nanos / 1_000_000);
        const prior = pollReplyActivity[payload.product_id];
        setPollReplyActivity(payload.product_id, {
          pulseNonce: (prior?.pulseNonce ?? 0) + 1,
          lastReceivedAtMs: receivedAtMs,
          lastBindIndex: payload.bind_index,
          ipAddress: payload.ip_address,
          bindIp: payload.bind_ip,
          shortName: payload.short_name,
          bundleWindowMs: payload.bundle_window_ms,
          bundleCount: (prior?.bundleCount ?? 0) + 1,
        });
      }
    )
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {
        // Optional activity indicator path only; silently degrade.
      });
    onCleanup(() => {
      disposed = true;
      unlisten?.();
    });
  });

  const isStale = () => Date.now() - lastUpdatedAt() > staleMs();

  return {
    products,
    pollReplyActivity: () => pollReplyActivity,
    isLoading,
    isStale,
    lastUpdatedAt,
    error,
    refresh,
  };
}
