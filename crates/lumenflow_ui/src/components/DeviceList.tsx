import type { Component } from "solid-js";
import { createSignal, createMemo, For, Show } from "solid-js";
import IpProgDialog from "./IpProgDialog";
import { open } from "@tauri-apps/plugin-shell";
import { useDiagLog, priorityColor, priorityLabel } from "../hooks/useDiagLog";

/** Art-Net 4 DataRequest types for URL fetching */
const DR_URL_PRODUCT = 0x0001;
const DR_URL_USER_GUIDE = 0x0002;
const DR_URL_SUPPORT = 0x0003;

type DeviceTab = "overview" | "ports" | "diagnostics" | "comms" | "protocol";
type DeviceFilter = "all" | "online" | "offline" | "manual" | "warnings";

export interface DeviceInfoDto {
  ip_address: string;
  bind_ip?: string;
  bind_index?: number;
  port?: number;
  mac_address: string;
  short_name: string;
  long_name: string;
  node_report?: string;
  firmware_version: number;
  ubea_version?: number;
  esta_man: number;
  oem_code: number;
  net_switch?: number;
  sub_switch?: number;
  num_ports?: number;
  port_types?: number[];
  good_input?: number[];
  good_output?: number[];
  good_output_b?: number[];
  sw_in?: number[];
  sw_out?: number[];
  status1?: number;
  status2?: number;
  status3?: number;
  acn_priority?: number;
  sw_macro?: number;
  sw_remote?: number;
  style?: number;
  def_resp?: string;
  user?: string;
  refresh_rate?: number;
  port_addresses: number[];
  input_port_addresses?: number[];
  /** True if device sent ArtPollReply within the last 3 seconds. Omit for mock devices. */
  online?: boolean;
}

interface DeviceUrls {
  product_url?: string;
  user_guide?: string;
  support?: string;
  loading?: boolean;
  error?: string;
}

/** D2: Manual entry (no ArtPollReply yet). */
export interface ManualDeviceEntry {
  ip: string;
  name?: string;
}

interface DeviceListProps {
  mockDevices?: DeviceInfoDto[] | undefined;
  /** D5: shared devices store accessor from useDevices hook. */
  devices?: () => DeviceInfoDto[];
  /** D2: Manually added devices; merged with get_devices. */
  manualDevices?: ManualDeviceEntry[];
  onAddManualDevice?: (ip: string, name?: string) => void;
  onRemoveManualDevice?: (ip: string) => void;
}

/** Build a synthetic DeviceInfoDto for a manual-only entry. */
function syntheticDevice(entry: ManualDeviceEntry): DeviceInfoDto {
  return {
    ip_address: entry.ip,
    mac_address: "",
    short_name: entry.name ?? entry.ip,
    long_name: "Manual entry",
    firmware_version: 0,
    esta_man: 0,
    oem_code: 0,
    port_addresses: [],
    input_port_addresses: [],
    online: false,
  };
}

function formatPortAddress(p: number): string {
  const net = (p >> 8) & 0x7f;
  const sub = (p >> 4) & 0x0f;
  const uni = p & 0x0f;
  return `${net}:${sub}:${uni}`;
}

function hex(value: number, width = 2): string {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

const DeviceList: Component<DeviceListProps> = (props) => {
  const [selectedIp, setSelectedIp] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal("");
  const [deviceFilter, setDeviceFilter] = createSignal<DeviceFilter>("all");
  const [detailTab, setDetailTab] = createSignal<DeviceTab>("overview");
  const [ipProgTarget, setIpProgTarget] = createSignal<string | null>(null);
  const [deviceUrls, setDeviceUrls] = createSignal<Record<string, DeviceUrls>>({});
  const [addDeviceOpen, setAddDeviceOpen] = createSignal(false);
  const [addDeviceIp, setAddDeviceIp] = createSignal("");
  const [addDeviceName, setAddDeviceName] = createSignal("");
  const log = useDiagLog();

  /** D2: Merge backend devices with manual-only entries (by IP). */
  const mergedDevices = createMemo(() => {
    const backend = props.mockDevices ?? props.devices?.() ?? [];
    const manual = props.manualDevices ?? [];
    const backendIps = new Set(backend.map((d) => d.ip_address));
    const manualOnly = manual
      .filter((m) => !backendIps.has(m.ip))
      .map(syntheticDevice);
    return [...backend, ...manualOnly];
  });

  const filteredDevices = createMemo(() => {
    const q = filter().toLowerCase().trim();
    return mergedDevices()
      .filter((d) => {
        if (deviceFilter() === "online" && d.online === false) return false;
        if (deviceFilter() === "offline" && d.online !== false) return false;
        if (deviceFilter() === "manual" && d.long_name !== "Manual entry") return false;
        if (deviceFilter() === "warnings") {
          const hasWarning = (d.status1 ?? 0) !== 0 || (d.status2 ?? 0) !== 0 || (d.status3 ?? 0) !== 0;
          if (!hasWarning) return false;
        }
        if (!q) return true;
        return (
          d.short_name.toLowerCase().includes(q) ||
          d.long_name.toLowerCase().includes(q) ||
          d.ip_address.includes(q) ||
          d.mac_address.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aOnline = a.online !== false ? 0 : 1;
        const bOnline = b.online !== false ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return a.ip_address.localeCompare(b.ip_address);
      });
  });

  const connectedDevices = createMemo(() => filteredDevices().filter((d) => d.online !== false));
  const previouslySeenDevices = createMemo(() => filteredDevices().filter((d) => d.online === false));

  const selectedDevice = createMemo(() => {
    const ip = selectedIp();
    if (!ip) return undefined;
    return mergedDevices().find((d) => d.ip_address === ip);
  });

  const selectDevice = (device: DeviceInfoDto) => {
    setSelectedIp(device.ip_address);
    if (detailTab() === "comms") setDetailTab("overview");
  };

  const fetchDeviceUrls = async (device: DeviceInfoDto) => {
    const ip = device.ip_address;
    setDeviceUrls((prev) => ({
      ...prev,
      [ip]: { ...prev[ip], loading: true, error: undefined },
    }));

    const fromCore = await import("@tauri-apps/api/core");
    try {
      const [product_url, user_guide, support] = await Promise.all([
        fromCore.invoke<string>("request_device_url", {
          target_ip: ip,
          esta_man: device.esta_man,
          oem: device.oem_code,
          request_type: DR_URL_PRODUCT,
        }).catch(() => undefined),
        fromCore.invoke<string>("request_device_url", {
          target_ip: ip,
          esta_man: device.esta_man,
          oem: device.oem_code,
          request_type: DR_URL_USER_GUIDE,
        }).catch(() => undefined),
        fromCore.invoke<string>("request_device_url", {
          target_ip: ip,
          esta_man: device.esta_man,
          oem: device.oem_code,
          request_type: DR_URL_SUPPORT,
        }).catch(() => undefined),
      ]);

      setDeviceUrls((prev) => ({
        ...prev,
        [ip]: {
          product_url: product_url || undefined,
          user_guide: user_guide || undefined,
          support: support || undefined,
          loading: false,
        },
      }));
    } catch (e) {
      setDeviceUrls((prev) => ({
        ...prev,
        [ip]: {
          ...prev[ip],
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  };

  const urlsFor = (ip: string) => deviceUrls()[ip];

  const submitAddDevice = () => {
    const ip = addDeviceIp().trim();
    if (!ip || !props.onAddManualDevice) return;
    props.onAddManualDevice(ip, addDeviceName().trim() || undefined);
    setAddDeviceOpen(false);
    setAddDeviceIp("");
    setAddDeviceName("");
  };

  const filteredComms = createMemo(() => {
    const ip = selectedIp();
    if (!ip) return [];
    return log.entries.filter((e) => e.sourceIp === ip).slice(-120).reverse();
  });

  return (
    <div data-testid="device-list" class="rounded-lg border border-edge bg-surface p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-medium tracking-wide uppercase text-secondary">Devices</h2>
        <div class="flex items-center gap-2">
          <Show when={props.onAddManualDevice}>
            <button
              type="button"
              onClick={() => setAddDeviceOpen(true)}
              class="rounded border border-edge bg-obsidian px-2 py-1 text-[11px] text-teal hover:border-teal/40 transition-colors"
              data-testid="add-device-manually"
            >
              Add device manually
            </button>
          </Show>
          <input
            type="text"
            placeholder="Filter devices..."
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            class="h-7 w-44 rounded border border-edge bg-obsidian px-2 text-[11px] text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
          />
        </div>
      </div>

      <div class="mb-3 flex flex-wrap gap-1.5">
        <For each={["all", "online", "offline", "manual", "warnings"] as DeviceFilter[]}>
          {(f) => (
            <button
              type="button"
              onClick={() => setDeviceFilter(f)}
              class="rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors"
              classList={{
                "border-teal/40 bg-teal/10 text-teal": deviceFilter() === f,
                "border-edge text-muted hover:border-edge-active hover:text-secondary": deviceFilter() !== f,
              }}
            >
              {f}
            </button>
          )}
        </For>
        <span class="ml-auto text-[10px] text-muted font-mono">
          {filteredDevices().length} node{filteredDevices().length !== 1 ? "s" : ""}
        </span>
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
        <div class="space-y-3">
          <Show when={filteredDevices().length > 0} fallback={<div class="flex h-24 items-center justify-center text-xs text-muted">No Art-Net devices discovered</div>}>
            <Show when={connectedDevices().length > 0}>
              <div class="text-[10px] font-medium uppercase tracking-wider text-muted">Connected</div>
            </Show>
            <For each={connectedDevices()}>
              {(device) => {
                const selected = () => selectedIp() === device.ip_address;
                return (
                  <div
                    class="rounded-md border bg-obsidian p-2 transition-colors"
                    classList={{
                      "border-teal/30 ring-1 ring-teal/40": selected(),
                      "border-edge hover:border-edge-active": !selected(),
                    }}
                  >
                    <div class="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => selectDevice(device)} class="min-w-0 flex-1 text-left">
                        <div class="flex items-center gap-2">
                          <span class="h-1.5 w-1.5 rounded-full bg-teal" />
                          <span class="truncate text-sm text-primary">{device.short_name || "Unknown Device"}</span>
                          <span class="rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-mono text-teal">{device.port_addresses.length}p</span>
                        </div>
                        <div class="mt-0.5 flex items-center gap-2 text-[11px] text-muted font-mono">
                          <span>{device.ip_address}</span>
                          <span>FW {hex(device.firmware_version, 4)}</span>
                          <Show when={device.bind_index !== undefined}><span>Bind {device.bind_index}</span></Show>
                        </div>
                      </button>
                      <div class="flex items-center gap-1">
                        <button type="button" onClick={() => setIpProgTarget(device.ip_address)} class="rounded border border-edge bg-surface px-2 py-1 text-[10px] text-secondary hover:text-teal">IP</button>
                        <button type="button" onClick={() => fetchDeviceUrls(device)} class="rounded border border-edge bg-surface px-2 py-1 text-[10px] text-secondary hover:text-primary">URLs</button>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>

            <Show when={previouslySeenDevices().length > 0}>
              <div class="border-t border-edge pt-3 text-[10px] font-medium uppercase tracking-wider text-muted">Previously seen</div>
            </Show>
            <For each={previouslySeenDevices()}>
              {(device) => (
                <div
                  class="rounded-md border border-edge bg-obsidian/80 p-2 transition-colors"
                  classList={{
                    "border-teal/30 ring-1 ring-teal/40": selectedIp() === device.ip_address,
                    "hover:border-edge-active": selectedIp() !== device.ip_address,
                  }}
                >
                  <div class="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => selectDevice(device)} class="min-w-0 flex-1 text-left">
                      <div class="flex items-center gap-2">
                        <span class="h-1.5 w-1.5 rounded-full bg-amber" />
                        <span class="truncate text-sm text-secondary">{device.short_name || "Unknown Device"}</span>
                        <Show when={device.long_name === "Manual entry"}>
                          <span class="rounded bg-amber/10 px-1.5 py-0.5 text-[10px] text-amber">Manual</span>
                        </Show>
                      </div>
                      <div class="mt-0.5 text-[11px] text-muted font-mono">{device.ip_address}</div>
                    </button>
                    <div class="flex items-center gap-1">
                      <button type="button" onClick={() => setIpProgTarget(device.ip_address)} class="rounded border border-edge bg-surface px-2 py-1 text-[10px] text-secondary hover:text-teal">IP</button>
                      <Show when={device.long_name === "Manual entry" && props.onRemoveManualDevice}>
                        <button
                          type="button"
                          onClick={() => props.onRemoveManualDevice?.(device.ip_address)}
                          class="rounded border border-edge bg-surface px-2 py-1 text-[10px] text-muted hover:text-amber"
                        >
                          Remove
                        </button>
                      </Show>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="rounded-lg border border-edge bg-obsidian p-3" data-testid="device-detail-panel">
          <Show
            when={selectedDevice()}
            fallback={<div class="flex h-full min-h-[16rem] items-center justify-center text-xs text-muted">Select a device to view full diagnostics and protocol details.</div>}
          >
            {(device) => (
              <>
                <div class="mb-2">
                  <div class="text-sm text-primary truncate">{device().short_name || "Unknown Device"}</div>
                  <div class="text-[11px] font-mono text-muted">{device().ip_address}</div>
                </div>

                <div class="mb-3 flex flex-wrap gap-1.5">
                  <For each={["overview", "ports", "diagnostics", "comms", "protocol"] as DeviceTab[]}>
                    {(tab) => (
                      <button
                        type="button"
                        onClick={() => setDetailTab(tab)}
                        class="rounded border px-2 py-1 text-[10px] uppercase tracking-wide"
                        classList={{
                          "border-teal/40 bg-teal/10 text-teal": detailTab() === tab,
                          "border-edge text-muted hover:border-edge-active hover:text-secondary": detailTab() !== tab,
                        }}
                      >
                        {tab}
                      </button>
                    )}
                  </For>
                </div>

                <Show when={detailTab() === "overview"}>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <span class="text-muted">Long Name</span><span class="text-secondary truncate" title={device().long_name}>{device().long_name}</span>
                    <span class="text-muted">MAC</span><span class="font-mono text-secondary">{device().mac_address || "Not reported"}</span>
                    <span class="text-muted">Firmware</span><span class="font-mono text-secondary">{hex(device().firmware_version, 4)}</span>
                    <span class="text-muted">OEM / ESTA</span><span class="font-mono text-secondary">{hex(device().oem_code, 4)} / {hex(device().esta_man, 4)}</span>
                    <span class="text-muted">Node Report</span><span class="text-secondary truncate" title={device().node_report || "Not reported"}>{device().node_report || "Not reported"}</span>
                    <span class="text-muted">Bind</span><span class="font-mono text-secondary">{device().bind_ip || "-"} · {device().bind_index ?? "-"}</span>
                    <span class="text-muted">Port Addresses</span>
                    <span class="font-mono text-secondary text-[11px]">{device().port_addresses.length ? device().port_addresses.map(formatPortAddress).join(", ") : "None"}</span>
                  </div>

                  <div class="mt-3 border-t border-edge pt-3">
                    <div class="mb-2 flex items-center justify-between">
                      <span class="text-xs text-muted">Device URLs</span>
                      <button
                        type="button"
                        onClick={() => fetchDeviceUrls(device())}
                        disabled={urlsFor(device().ip_address)?.loading}
                        class="rounded-md border border-edge bg-surface px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover disabled:opacity-50"
                      >
                        {urlsFor(device().ip_address)?.loading ? "Fetching…" : "Fetch URLs"}
                      </button>
                    </div>
                    <Show when={urlsFor(device().ip_address)?.error}><div class="mb-1 text-[11px] text-error">{urlsFor(device().ip_address)?.error}</div></Show>
                    <div class="flex flex-col gap-1 text-[11px]">
                      <Show when={urlsFor(device().ip_address)?.product_url}>{(url) => <button type="button" onClick={() => open(url())} class="truncate text-left text-teal hover:text-teal-dim">Product: {url()}</button>}</Show>
                      <Show when={urlsFor(device().ip_address)?.user_guide}>{(url) => <button type="button" onClick={() => open(url())} class="truncate text-left text-teal hover:text-teal-dim">Guide: {url()}</button>}</Show>
                      <Show when={urlsFor(device().ip_address)?.support}>{(url) => <button type="button" onClick={() => open(url())} class="truncate text-left text-teal hover:text-teal-dim">Support: {url()}</button>}</Show>
                      <Show when={!urlsFor(device().ip_address)?.loading && !urlsFor(device().ip_address)?.error && !urlsFor(device().ip_address)?.product_url && !urlsFor(device().ip_address)?.user_guide && !urlsFor(device().ip_address)?.support && urlsFor(device().ip_address) !== undefined}>
                        <span class="text-muted">No URLs returned by device</span>
                      </Show>
                    </div>
                  </div>
                </Show>

                <Show when={detailTab() === "ports"}>
                  <div class="space-y-2 text-xs">
                    <div class="grid grid-cols-2 gap-2">
                      <div class="rounded border border-edge bg-surface p-2">
                        <div class="mb-1 text-[10px] uppercase tracking-wide text-muted">Outputs</div>
                        <div class="font-mono text-secondary text-[11px]">{device().port_addresses.length ? device().port_addresses.map(formatPortAddress).join(", ") : "None"}</div>
                      </div>
                      <div class="rounded border border-edge bg-surface p-2">
                        <div class="mb-1 text-[10px] uppercase tracking-wide text-muted">Inputs</div>
                        <div class="font-mono text-secondary text-[11px]">{(device().input_port_addresses ?? []).length ? (device().input_port_addresses ?? []).map(formatPortAddress).join(", ") : "None"}</div>
                      </div>
                    </div>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <span class="text-muted">Num ports</span><span class="font-mono text-secondary">{device().num_ports ?? device().port_addresses.length}</span>
                      <span class="text-muted">SwOut / SwIn</span><span class="font-mono text-secondary text-[11px]">{(device().sw_out ?? []).map((x) => hex(x)).join(" ") || "-"} / {(device().sw_in ?? []).map((x) => hex(x)).join(" ") || "-"}</span>
                      <span class="text-muted">PortTypes</span><span class="font-mono text-secondary text-[11px]">{(device().port_types ?? []).map((x) => hex(x)).join(" ") || "Not reported"}</span>
                      <span class="text-muted">GoodOut / GoodIn</span><span class="font-mono text-secondary text-[11px]">{(device().good_output ?? []).map((x) => hex(x)).join(" ") || "-"} / {(device().good_input ?? []).map((x) => hex(x)).join(" ") || "-"}</span>
                    </div>
                  </div>
                </Show>

                <Show when={detailTab() === "diagnostics"}>
                  <div class="space-y-2 text-xs">
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <span class="text-muted">Online</span><span class="text-secondary">{device().online === false ? "No" : "Yes"}</span>
                      <span class="text-muted">Status1/2/3</span><span class="font-mono text-secondary">{hex(device().status1 ?? 0)} / {hex(device().status2 ?? 0)} / {hex(device().status3 ?? 0)}</span>
                      <span class="text-muted">sACN priority</span><span class="font-mono text-secondary">{device().acn_priority ?? "Not reported"}</span>
                      <span class="text-muted">Refresh rate</span><span class="font-mono text-secondary">{device().refresh_rate ?? "Not reported"}</span>
                    </div>
                    <div class="rounded border border-edge bg-surface p-2 text-[11px] text-muted">
                      Diagnostics are protocol hints from ArtPollReply bitfields and may vary by manufacturer.
                    </div>
                  </div>
                </Show>

                <Show when={detailTab() === "comms"}>
                  <div class="max-h-[18rem] overflow-auto rounded border border-edge bg-surface text-xs font-mono">
                    <Show when={filteredComms().length > 0} fallback={<div class="p-3 text-muted">No diagnostic entries for this device yet.</div>}>
                      <For each={filteredComms()}>
                        {(entry) => (
                          <div class="flex gap-2 border-b border-edge/50 px-2 py-1">
                            <span class="text-muted">{new Date(entry.receivedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
                            <span class={`w-10 ${priorityColor(entry.priority)}`}>{priorityLabel(entry.priority)}</span>
                            <span class="text-primary break-words">{entry.message}</span>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </Show>

                <Show when={detailTab() === "protocol"}>
                  <div class="max-h-[18rem] overflow-auto rounded border border-edge bg-surface p-2 text-[11px] font-mono text-secondary">
                    <div>ip_address: {device().ip_address}</div>
                    <div>bind_ip: {device().bind_ip ?? "Not reported"}</div>
                    <div>bind_index: {device().bind_index ?? "Not reported"}</div>
                    <div>port: {device().port ?? "Not reported"}</div>
                    <div>net_switch/sub_switch: {device().net_switch ?? "-"}/{device().sub_switch ?? "-"}</div>
                    <div>style: {device().style ?? "Not reported"}</div>
                    <div>ubea_version: {device().ubea_version ?? "Not reported"}</div>
                    <div>sw_macro/sw_remote: {device().sw_macro ?? "-"}/{device().sw_remote ?? "-"}</div>
                    <div>def_resp: {device().def_resp ?? "Not reported"}</div>
                    <div>user: {device().user ?? "Not reported"}</div>
                    <div>good_output_b: {(device().good_output_b ?? []).map((x) => hex(x)).join(" ") || "Not reported"}</div>
                    <div>node_report: {device().node_report || "Not reported"}</div>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </div>
      </div>

      <IpProgDialog
        isOpen={() => ipProgTarget() !== null}
        onClose={() => setIpProgTarget(null)}
        targetIp={ipProgTarget() ?? ""}
        deviceName={
          ipProgTarget()
            ? mergedDevices().find((d) => d.ip_address === ipProgTarget())?.short_name
            : undefined
        }
      />

      {/* D2: Add device manually dialog */}
      <Show when={addDeviceOpen()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80"
          role="dialog"
          aria-label="Add device manually"
          onClick={(e) => e.target === e.currentTarget && setAddDeviceOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setAddDeviceOpen(false)}
        >
          <div
            class="w-full max-w-sm rounded-lg border border-edge bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="mb-3 text-sm font-medium text-primary">Add device manually</h3>
            <p class="mb-3 text-[11px] text-muted">
              Enter an IP address to add a device without discovery (e.g. static IP, firewall).
            </p>
            <div class="mb-4 space-y-2">
              <label class="block text-[11px] text-secondary">IP address <span class="text-amber">*</span></label>
              <input
                type="text"
                value={addDeviceIp()}
                onInput={(e) => setAddDeviceIp(e.currentTarget.value)}
                placeholder="e.g. 192.168.1.100"
                class="w-full rounded border border-edge bg-obsidian px-2 py-1.5 text-[11px] text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
                data-testid="add-device-ip"
              />
              <label class="block text-[11px] text-secondary">Name (optional)</label>
              <input
                type="text"
                value={addDeviceName()}
                onInput={(e) => setAddDeviceName(e.currentTarget.value)}
                placeholder="Display name"
                class="w-full rounded border border-edge bg-obsidian px-2 py-1.5 text-[11px] text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
                data-testid="add-device-name"
              />
            </div>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddDeviceOpen(false)}
                class="rounded border border-edge px-2 py-1 text-[11px] text-muted hover:border-edge-active"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAddDevice}
                disabled={!addDeviceIp().trim()}
                class="rounded border border-teal/40 bg-teal/10 px-2 py-1 text-[11px] text-teal hover:bg-teal/20 disabled:pointer-events-none disabled:opacity-50"
                data-testid="add-device-submit"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default DeviceList;
