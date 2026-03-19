import {
  createResource,
  createSignal,
  createEffect,
  onCleanup,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface NetworkInterfaceDto {
  name: string;
  ip: string;
  subnet?: string;
  broadcast?: string;
}

export interface NetworkSettingsDto {
  version: number;
  interface_mode: string;
  preferred_ip_cidr: string;
  secondary_preferred_cidr: string | null;
  primary_nic: string | null;
  secondary_nic: string | null;
  spec_targets: boolean;
  subnet_broadcast: boolean;
  custom_broadcast_targets: string[];
  unicast_targets: string[];
}

async function fetchInterfaces(): Promise<NetworkInterfaceDto[]> {
  return invoke<NetworkInterfaceDto[]>("get_network_interfaces_cmd");
}

async function fetchSettings(): Promise<NetworkSettingsDto> {
  return invoke<NetworkSettingsDto>("get_network_settings_cmd");
}

/**
 * Hook for network settings: interfaces, persisted settings, and apply.
 * Refetches interfaces when Settings panel opens; debounces set_network_settings.
 */
export function useNetworkSettings(panelOpen: () => boolean) {
  const [interfaces, { refetch: refetchInterfaces }] = createResource(
    () => (panelOpen() ? "interfaces" : null),
    fetchInterfaces,
    { initialValue: [] }
  );

  const [settings, { refetch: refetchSettings }] = createResource(
    () => (panelOpen() ? "settings" : null),
    fetchSettings,
    { initialValue: undefined as NetworkSettingsDto | undefined }
  );

  const [pendingSettings, setPendingSettings] =
    createSignal<Partial<NetworkSettingsDto> | null>(null);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    const pending = pendingSettings();
    if (!pending) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      const current = settings();
      if (!current) return;
      const merged: NetworkSettingsDto = {
        ...current,
        ...pending,
      };
      try {
        await invoke("set_network_settings_cmd", {
          settings: merged,
        });
        refetchSettings();
      } catch (e) {
        console.error("set_network_settings failed:", e);
      }
      setPendingSettings(null);
    }, 100);
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  function applySettings(updates: Partial<NetworkSettingsDto>) {
    setPendingSettings((prev) => ({ ...prev, ...updates }));
  }

  async function applySettingsImmediate(updates: Partial<NetworkSettingsDto>) {
    const current = settings();
    if (!current) return;
    const merged: NetworkSettingsDto = { ...current, ...updates };
    try {
      await invoke("set_network_settings_cmd", { settings: merged });
      refetchSettings();
    } catch (e) {
      console.error("set_network_settings failed:", e);
    }
  }

  return {
    interfaces: () => interfaces() ?? [],
    settings: () => settings(),
    refetchInterfaces,
    refetchSettings,
    applySettings,
    applySettingsImmediate,
  };
}
