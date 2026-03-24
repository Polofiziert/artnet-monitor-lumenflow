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
type DeviceFilter = "all" | "online" | "offline" | "manual";

export interface ProductPortDto {
  bind_index: number;
  slot: number;
  output_universe: number;
  input_universe?: number | null;
  label: string;
}

/** One physical Art-Net node (merged BindIndex pages). */
export interface ArtNetProductDto {
  product_id: string;
  bind_ip: string;
  ip_address: string;
  /** When set (e.g. 127.0.0.1:6457), management packets use this instead of ip_address:6454 (Docker NAT). */
  transport_addr?: string | null;
  mac_address: string;
  short_name: string;
  long_name: string;
  esta_man: number;
  oem_code: number;
  firmware_version: number;
  node_report: string;
  ports: ProductPortDto[];
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
  mockProducts?: ArtNetProductDto[] | undefined;
  /** D5: shared product store from useDevices (`get_artnet_products`). */
  products?: () => ArtNetProductDto[];
  /** D2: Manually added devices; merged with backend products. */
  manualDevices?: ManualDeviceEntry[];
  onAddManualDevice?: (ip: string, name?: string) => void;
  onRemoveManualDevice?: (ip: string) => void;
}

/** Manual-only row (no ArtPollReply yet). */
function syntheticProduct(entry: ManualDeviceEntry): ArtNetProductDto {
  const ip = entry.ip.trim();
  const id = `manual|${ip}`;
  return {
    product_id: id,
    bind_ip: ip,
    ip_address: ip,
    mac_address: "",
    short_name: entry.name ?? ip,
    long_name: "Manual entry",
    esta_man: 0,
    oem_code: 0,
    firmware_version: 0,
    node_report: "",
    ports: [],
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
  const [selectedProductId, setSelectedProductId] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal("");
  const [deviceFilter, setDeviceFilter] = createSignal<DeviceFilter>("all");
  const [detailTab, setDetailTab] = createSignal<DeviceTab>("overview");
  const [ipProgTarget, setIpProgTarget] = createSignal<string | null>(null);
  /** UDP path for ArtIpProg when discovered via port mapping (e.g. Docker). */
  const [ipProgTransport, setIpProgTransport] = createSignal<string | null>(null);
  const [deviceUrls, setDeviceUrls] = createSignal<Record<string, DeviceUrls>>({});
  const [addDeviceOpen, setAddDeviceOpen] = createSignal(false);
  const [addDeviceIp, setAddDeviceIp] = createSignal("");
  const [addDeviceName, setAddDeviceName] = createSignal("");
  const log = useDiagLog();

  /** Merge backend products with manual-only entries (by IP). */
  const mergedProducts = createMemo(() => {
    const backend = props.mockProducts ?? props.products?.() ?? [];
    const manual = props.manualDevices ?? [];
    const backendIps = new Set(backend.map((d) => d.ip_address));
    const manualOnly = manual
      .filter((m) => !backendIps.has(m.ip))
      .map(syntheticProduct);
    return [...backend, ...manualOnly];
  });

  const filteredDevices = createMemo(() => {
    const q = filter().toLowerCase().trim();
    return mergedProducts()
      .filter((d) => {
        if (deviceFilter() === "online" && d.online === false) return false;
        if (deviceFilter() === "offline" && d.online !== false) return false;
        if (deviceFilter() === "manual" && d.long_name !== "Manual entry") return false;
        if (!q) return true;
        return (
          d.short_name.toLowerCase().includes(q) ||
          d.long_name.toLowerCase().includes(q) ||
          d.ip_address.includes(q) ||
          d.mac_address.toLowerCase().includes(q) ||
          d.product_id.toLowerCase().includes(q)
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
    const id = selectedProductId();
    if (!id) return undefined;
    return mergedProducts().find((d) => d.product_id === id);
  });

  const selectDevice = (device: ArtNetProductDto) => {
    setSelectedProductId(device.product_id);
    if (detailTab() === "comms") setDetailTab("overview");
  };

  const fetchDeviceUrls = async (device: ArtNetProductDto) => {
    const ip = device.ip_address;
    setDeviceUrls((prev) => ({
      ...prev,
      [ip]: { ...prev[ip], loading: true },
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

      const urls: DeviceUrls = { loading: false };
      if (product_url) urls.product_url = product_url;
      if (user_guide) urls.user_guide = user_guide;
      if (support) urls.support = support;
      setDeviceUrls((prev) => ({
        ...prev,
        [ip]: urls,
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
    const ip = selectedDevice()?.ip_address;
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
        <For each={["all", "online", "offline", "manual"] as DeviceFilter[]}>
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
                const selected = () => selectedProductId() === device.product_id;
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
                          <span class="rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-mono text-teal">{device.ports.length}p</span>
                        </div>
                        <div class="mt-0.5 flex items-center gap-2 text-[11px] text-muted font-mono">
                          <span>{device.ip_address}</span>
                          <span>FW {hex(device.firmware_version, 4)}</span>
                        </div>
                      </button>
                      <div class="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIpProgTarget(device.ip_address);
                            setIpProgTransport(device.transport_addr ?? null);
                          }}
                          class="rounded border border-edge bg-surface px-2 py-1 text-[10px] text-secondary hover:text-teal"
                        >
                          IP
                        </button>
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
                    "border-teal/30 ring-1 ring-teal/40": selectedProductId() === device.product_id,
                    "hover:border-edge-active": selectedProductId() !== device.product_id,
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
                    <span class="text-muted">Bind IP</span><span class="font-mono text-secondary">{device().bind_ip || "-"}</span>
                    <span class="text-muted">Output universes</span>
                    <span class="font-mono text-secondary text-[11px]">{device().ports.length ? device().ports.map((p) => formatPortAddress(p.output_universe)).join(", ") : "None"}</span>
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
                    <div class="max-h-[14rem] overflow-auto rounded border border-edge">
                      <table class="w-full text-left text-[11px]">
                        <thead class="sticky top-0 border-b border-edge bg-surface text-[10px] uppercase tracking-wide text-muted">
                          <tr>
                            <th class="px-2 py-1">Bind</th>
                            <th class="px-2 py-1">Label</th>
                            <th class="px-2 py-1">Out</th>
                            <th class="px-2 py-1">In</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={device().ports}>
                            {(p) => (
                              <tr class="border-b border-edge/40">
                                <td class="px-2 py-1 font-mono text-secondary">{p.bind_index}</td>
                                <td class="px-2 py-1 text-primary">{p.label}</td>
                                <td class="px-2 py-1 font-mono text-secondary">{formatPortAddress(p.output_universe)}</td>
                                <td class="px-2 py-1 font-mono text-secondary">{p.input_universe != null ? formatPortAddress(p.input_universe) : "—"}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                    <Show when={device().ports.length === 0}>
                      <div class="text-[11px] text-muted">No ports reported (e.g. manual entry or controller with no DMX outputs).</div>
                    </Show>
                  </div>
                </Show>

                <Show when={detailTab() === "diagnostics"}>
                  <div class="space-y-2 text-xs">
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <span class="text-muted">Online</span><span class="text-secondary">{device().online === false ? "No" : "Yes"}</span>
                      <span class="text-muted">Ports</span><span class="font-mono text-secondary">{device().ports.length}</span>
                    </div>
                    <div class="rounded border border-edge bg-surface p-2 text-[11px] text-muted">
                      Per-bind status flags are available in the flat `get_devices` API; the product view focuses on merged ports.
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
                    <div>product_id: {device().product_id}</div>
                    <div>ip_address: {device().ip_address}</div>
                    <div>bind_ip: {device().bind_ip}</div>
                    <div>mac_address: {device().mac_address || "—"}</div>
                    <div>ports_merged: {device().ports.length}</div>
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
        onClose={() => {
          setIpProgTarget(null);
          setIpProgTransport(null);
        }}
        targetIp={ipProgTarget() ?? ""}
        transportAddr={ipProgTransport()}
        deviceName={
          mergedProducts().find((d) => d.ip_address === (ipProgTarget() ?? ""))
            ?.short_name ?? ""
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
