import type { Component } from "solid-js";
import {
  createSignal,
  createMemo,
  createEffect,
  For,
  Show,
  Index,
  onCleanup,
} from "solid-js";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import type { IpProgReplyDto } from "./IpProgDialog";
import { useDiagLog, priorityColor, priorityLabel } from "../hooks/useDiagLog";
import type { PollReplyActivity } from "../hooks/useDevices";
import { reconcilePendingEdits, type PendingEdit } from "../lib/pendingEdits";

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
  primary_bind_index?: number;
  /** When set (e.g. 127.0.0.1:6457), management packets use this instead of ip_address:6454 (Docker NAT). */
  transport_addr?: string | null;
  mac_address: string;
  short_name: string;
  long_name: string;
  esta_man: number;
  oem_code: number;
  firmware_version: number;
  node_report: string;
  /** ArtPollReply Status1 (bits 7..6 = indicator mode). */
  status1?: number;
  /** ArtPollReply Status2 (bit 5 = squawking). */
  status2?: number;
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
  /** Per-product ArtPollReply activity (one pulse per bind bundle). */
  pollReplyActivity?: () => Record<string, PollReplyActivity>;
  /** D2: Manually added devices; merged with backend products. */
  manualDevices?: ManualDeviceEntry[];
  onAddManualDevice?: (ip: string, name?: string) => void;
  onRemoveManualDevice?: (ip: string) => void;
  onReadCurrent?: () => Promise<void> | void;
}

type ControllerSeenDto = {
  ip: string;
  /** Age since last seen (ms). */
  last_seen_at_ms: number;
  talk_to_me: number;
  diag_priority: number;
  target_port_bottom: number;
  target_port_top: number;
  esta_man: number;
  oem: number;
};

interface PollReplyPulseDotProps {
  activity?: PollReplyActivity | undefined;
  tooltip: string;
  testId?: string | undefined;
}

type EditableField = "ip" | "long_name" | "port_name" | "port_out" | "port_in";
type LedMode = "unknown" | "identify" | "mute" | "normal";
type LedCommand = "identify" | "mute" | "normal";
type LedUiState = "neutral" | "pending" | "confirmed" | "warning" | "error";

interface LedPendingIntent {
  productId: string;
  sentBundleCount: number;
  expected: LedMode;
  startedAtMs: number;
  timeoutMs: number;
  warningMessage: string;
}

interface LedButtonStatus {
  state: LedUiState;
  message?: string;
  expiresAtMs?: number;
}

interface GlobalLedPending {
  expectedById: Record<string, LedMode>;
  sentBundleById: Record<string, number>;
  startedAtMs: number;
  warningMessage: string;
}

const PollReplyPulseDot: Component<PollReplyPulseDotProps> = (props) => {
  const [burst, setBurst] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  createEffect(() => {
    const nonce = props.activity?.pulseNonce ?? 0;
    if (nonce <= 0) return;
    setBurst(false);
    queueMicrotask(() => setBurst(true));
    if (resetTimer !== undefined) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => setBurst(false), 460);
  });

  onCleanup(() => {
    if (resetTimer !== undefined) clearTimeout(resetTimer);
  });

  return (
    <span
      data-testid={props.testId}
      class="h-1.5 w-1.5 rounded-full bg-teal transition-all duration-150"
      classList={{
        "scale-150 shadow-[0_0_8px_#2DD4BF99]": burst(),
      }}
      title={props.tooltip}
    />
  );
};

/** Manual-only row (no ArtPollReply yet). */
function syntheticProduct(entry: ManualDeviceEntry): ArtNetProductDto {
  const ip = entry.ip.trim();
  const id = `manual|${ip}`;
  return {
    product_id: id,
    bind_ip: ip,
    ip_address: ip,
    primary_bind_index: 1,
    mac_address: "",
    short_name: entry.name ?? ip,
    long_name: "Manual entry",
    esta_man: 0,
    oem_code: 0,
    firmware_version: 0,
    node_report: "",
    status1: 0,
    status2: 0,
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

function parsePortAddress(input: string): { value?: number; error?: string } {
  const s = input.trim();
  if (!s) return { error: "Empty port address." };
  if (/^\d+$/.test(s)) {
    const v = Number(s);
    if (!Number.isFinite(v) || v < 0 || v > 0x7fff) {
      return { error: "Port address must be 0..32767." };
    }
    return { value: v };
  }
  const parts = s.split(":").map((p) => p.trim());
  if (parts.length !== 3)
    return { error: "Expected Net:SubNet:Universe (e.g. 0:0:1)." };
  const [netS, subS, uniS] = parts;
  const net = Number(netS);
  const sub = Number(subS);
  const uni = Number(uniS);
  if (![net, sub, uni].every((n) => Number.isInteger(n))) {
    return { error: "Net/SubNet/Universe must be integers." };
  }
  if (net < 0 || net > 127) return { error: "Net must be 0..127." };
  if (sub < 0 || sub > 15) return { error: "SubNet must be 0..15." };
  if (uni < 0 || uni > 15) return { error: "Universe must be 0..15." };
  return { value: (net << 8) | (sub << 4) | uni };
}

function hex(value: number, width = 2): string {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function decodeLedModeFromStatus1(status1?: number): LedMode {
  if (typeof status1 !== "number") return "unknown";
  const bits = (status1 >> 6) & 0x03;
  if (bits === 0x01) return "identify";
  if (bits === 0x02) return "mute";
  if (bits === 0x03) return "normal";
  return "unknown";
}

function ledModeToCommand(mode: LedMode): LedCommand {
  if (mode === "identify") return "identify";
  if (mode === "mute") return "mute";
  return "normal";
}

const DeviceList: Component<DeviceListProps> = (props) => {
  const [selectedProductId, setSelectedProductId] = createSignal<string | null>(
    null
  );
  const [filter, setFilter] = createSignal("");
  const [deviceFilter, setDeviceFilter] = createSignal<DeviceFilter>("all");
  const [detailTab, setDetailTab] = createSignal<DeviceTab>("overview");
  const [deviceUrls, setDeviceUrls] = createSignal<Record<string, DeviceUrls>>(
    {}
  );
  const [addDeviceOpen, setAddDeviceOpen] = createSignal(false);
  const [addDeviceIp, setAddDeviceIp] = createSignal("");
  const [addDeviceName, setAddDeviceName] = createSignal("");
  const [editingLongName, setEditingLongName] = createSignal(false);
  const [editingIp, setEditingIp] = createSignal(false);
  const [editingIpProgField, setEditingIpProgField] = createSignal<
    "subnet_mask" | "gateway" | "port" | null
  >(null);
  // One active inline editor in the ports table at a time:
  // - "port:<bind>:<slot>" for port label
  // - "out:<bind>:<slot>" for output universe
  // - "in:<bind>:<slot>" for input universe
  const [editingPortKey, setEditingPortKey] = createSignal<string | null>(null);
  const [editingValue, setEditingValue] = createSignal("");
  const [pendingEdits, setPendingEdits] = createSignal<
    Record<string, PendingEdit>
  >({});
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>(
    {}
  );
  const [fieldLoading, setFieldLoading] = createSignal<Record<string, boolean>>(
    {}
  );
  const [ipProgByProductId, setIpProgByProductId] = createSignal<
    Record<string, { reply: IpProgReplyDto; receivedAtMs: number }>
  >({});
  const [ledPendingByButton, setLedPendingByButton] = createSignal<
    Record<string, LedPendingIntent>
  >({});
  const [ledButtonStatusByKey, setLedButtonStatusByKey] = createSignal<
    Record<string, LedButtonStatus>
  >({});
  const [ledRestoreByDevice, setLedRestoreByDevice] = createSignal<
    Record<string, { identify?: LedMode; mute?: LedMode }>
  >({});
  const [globalIdentifySnapshot, setGlobalIdentifySnapshot] = createSignal<
    Record<string, LedMode> | null
  >(null);
  const [globalMuteSnapshot, setGlobalMuteSnapshot] = createSignal<
    Record<string, LedMode> | null
  >(null);
  const [globalIdentifyPending, setGlobalIdentifyPending] =
    createSignal<GlobalLedPending | null>(null);
  const [globalMutePending, setGlobalMutePending] =
    createSignal<GlobalLedPending | null>(null);
  const [controllersSeen, setControllersSeen] = createSignal<
    ControllerSeenDto[]
  >([]);
  const [nowTickMs, setNowTickMs] = createSignal(Date.now());
  const log = useDiagLog();
  const LED_CONFIRM_TIMEOUT_MS = 2600;
  const LED_STATUS_CONFIRM_MS = 900;
  const LED_STATUS_WARN_MS = 6500;
  const LED_STATUS_ERR_MS = 6500;

  createEffect(() => {
    const t = setInterval(() => setNowTickMs(Date.now()), 250);
    onCleanup(() => clearInterval(t));
  });

  createEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await invoke<ControllerSeenDto[]>("get_controllers");
        if (cancelled) return;
        setControllersSeen(Array.isArray(next) ? next : []);
      } catch {
        // Controllers list is best-effort.
      }
    };
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    onCleanup(() => {
      cancelled = true;
      clearInterval(t);
    });
  });

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
        if (deviceFilter() === "manual" && d.long_name !== "Manual entry")
          return false;
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

  const nodeOrdinalById = createMemo(() => {
    const stableOrder = [...mergedProducts()].sort((a, b) => {
      const aKey = `${a.mac_address || "ZZ:ZZ:ZZ:ZZ:ZZ:ZZ"}|${a.product_id}|${a.ip_address}`;
      const bKey = `${b.mac_address || "ZZ:ZZ:ZZ:ZZ:ZZ:ZZ"}|${b.product_id}|${b.ip_address}`;
      return aKey.localeCompare(bKey);
    });
    const map = new Map<string, number>();
    let next = 1;
    for (const d of stableOrder) {
      if (d.long_name === "Manual entry") continue;
      map.set(d.product_id, next);
      next += 1;
    }
    return map;
  });

  const connectedDevices = createMemo(() =>
    filteredDevices().filter((d) => d.online !== false)
  );
  const ledEligibleConnectedDevices = createMemo(() =>
    connectedDevices().filter((d) => d.long_name !== "Manual entry")
  );
  const previouslySeenDevices = createMemo(() =>
    filteredDevices().filter((d) => d.online === false)
  );

  const globalIdentifyActive = () => {
    const snapshot = globalIdentifySnapshot();
    if (!snapshot) return false;
    const ids = Object.keys(snapshot);
    if (ids.length === 0) return false;
    const byId = new Map(mergedProducts().map((d) => [d.product_id, d]));
    return ids.every((id) => {
      const d = byId.get(id);
      return d != null && deviceLedMode(d) === "identify";
    });
  };

  const globalMuteActive = () => {
    const snapshot = globalMuteSnapshot();
    if (!snapshot) return false;
    const ids = Object.keys(snapshot);
    if (ids.length === 0) return false;
    const byId = new Map(mergedProducts().map((d) => [d.product_id, d]));
    return ids.every((id) => {
      const d = byId.get(id);
      return d != null && deviceLedMode(d) === "mute";
    });
  };

  const toggleGlobalIdentify = async () => {
    const key = ledButtonKey("global", "connected", "identify");
    const targets = ledEligibleConnectedDevices();
    if (targets.length === 0) return;
    if (!globalIdentifySnapshot()) {
      const snapshot: Record<string, LedMode> = {};
      for (const d of targets) {
        const restore = deviceLedMode(d);
        snapshot[d.product_id] = restore === "unknown" ? "normal" : restore;
      }
      setGlobalIdentifySnapshot(snapshot);
      const expected: Record<string, LedMode> = {};
      for (const d of targets) {
        expected[d.product_id] = "identify";
      }
      let sendFailures = 0;
      for (const d of targets) {
        const perDeviceKey = ledButtonKey("device", d.product_id, "identify");
        try {
          await triggerLedCommand(
            d,
            "identify",
            perDeviceKey,
            "identify",
            "[Warning] LED identify not confirmed because Status1 indicator bits did not change within 2.6s. Next: verify panel LEDs physically and retry."
          );
        } catch {
          sendFailures += 1;
        }
      }
      if (sendFailures > 0) {
        setLedButtonStatus(
          key,
          "error",
          `Command failed for ${sendFailures} device(s).`,
          LED_STATUS_ERR_MS
        );
      } else {
        setLedButtonStatus(key, "pending");
        const expectedById: Record<string, LedMode> = {};
        const sentBundleById: Record<string, number> = {};
        for (const d of targets) expectedById[d.product_id] = "identify";
        for (const d of targets) {
          sentBundleById[d.product_id] =
            pollActivityFor(d.product_id)?.bundleCount ?? 0;
        }
        setGlobalIdentifyPending({
          expectedById,
          sentBundleById,
          startedAtMs: Date.now(),
          warningMessage:
            "[Warning] Global LED identify not fully confirmed because some devices did not report Status1 indicator changes within 2.6s. Next: verify physical LEDs and retry per device.",
        });
      }
      return;
    }
    const snapshot = globalIdentifySnapshot() ?? {};
    setGlobalIdentifySnapshot(null);
    for (const d of targets) {
      const restore = snapshot[d.product_id] ?? "normal";
      const perDeviceKey = ledButtonKey("device", d.product_id, "identify");
      await triggerLedCommand(
        d,
        ledModeToCommand(restore),
        perDeviceKey,
        restore,
        "[Warning] LED restore after identify was not confirmed because Status1 indicator bits did not change within 2.6s. Next: verify panel LEDs physically and retry."
      );
    }
    setLedButtonStatus(key, "pending");
    const expectedById: Record<string, LedMode> = {};
    const sentBundleById: Record<string, number> = {};
    for (const d of targets) {
      expectedById[d.product_id] = snapshot[d.product_id] ?? "normal";
      sentBundleById[d.product_id] = pollActivityFor(d.product_id)?.bundleCount ?? 0;
    }
    setGlobalIdentifyPending({
      expectedById,
      sentBundleById,
      startedAtMs: Date.now(),
      warningMessage:
        "[Warning] Global LED identify restore not fully confirmed because some devices did not report Status1 indicator changes within 2.6s. Next: verify physical LEDs and retry per device.",
    });
  };

  const toggleGlobalMute = async () => {
    const key = ledButtonKey("global", "connected", "mute");
    const targets = ledEligibleConnectedDevices();
    if (targets.length === 0) return;
    if (!globalMuteSnapshot()) {
      const snapshot: Record<string, LedMode> = {};
      for (const d of targets) {
        const restore = deviceLedMode(d);
        snapshot[d.product_id] = restore === "unknown" ? "normal" : restore;
      }
      setGlobalMuteSnapshot(snapshot);
      for (const d of targets) {
        const perDeviceKey = ledButtonKey("device", d.product_id, "mute");
        await triggerLedCommand(
          d,
          "mute",
          perDeviceKey,
          "mute",
          "[Warning] LED mute not confirmed because Status1 indicator bits did not change within 2.6s. Next: verify panel LEDs physically and retry."
        );
      }
      setLedButtonStatus(key, "pending");
      const expectedById: Record<string, LedMode> = {};
      const sentBundleById: Record<string, number> = {};
      for (const d of targets) expectedById[d.product_id] = "mute";
      for (const d of targets) {
        sentBundleById[d.product_id] =
          pollActivityFor(d.product_id)?.bundleCount ?? 0;
      }
      setGlobalMutePending({
        expectedById,
        sentBundleById,
        startedAtMs: Date.now(),
        warningMessage:
          "[Warning] Global LED mute not fully confirmed because some devices did not report Status1 indicator changes within 2.6s. Next: verify physical LEDs and retry per device.",
      });
      return;
    }
    const snapshot = globalMuteSnapshot() ?? {};
    setGlobalMuteSnapshot(null);
    for (const d of targets) {
      const restore = snapshot[d.product_id] ?? "normal";
      const perDeviceKey = ledButtonKey("device", d.product_id, "mute");
      await triggerLedCommand(
        d,
        ledModeToCommand(restore),
        perDeviceKey,
        restore,
        "[Warning] LED restore after mute was not confirmed because Status1 indicator bits did not change within 2.6s. Next: verify panel LEDs physically and retry."
      );
    }
    setLedButtonStatus(key, "pending");
    const expectedById: Record<string, LedMode> = {};
    const sentBundleById: Record<string, number> = {};
    for (const d of targets) {
      expectedById[d.product_id] = snapshot[d.product_id] ?? "normal";
      sentBundleById[d.product_id] = pollActivityFor(d.product_id)?.bundleCount ?? 0;
    }
    setGlobalMutePending({
      expectedById,
      sentBundleById,
      startedAtMs: Date.now(),
      warningMessage:
        "[Warning] Global LED mute restore not fully confirmed because some devices did not report Status1 indicator changes within 2.6s. Next: verify physical LEDs and retry per device.",
    });
  };

  const selectedDevice = createMemo(() => {
    const id = selectedProductId();
    if (!id) return undefined;
    return mergedProducts().find((d) => d.product_id === id);
  });

  const deviceLedMode = (device: ArtNetProductDto): LedMode =>
    decodeLedModeFromStatus1(device.status1);

  const ledButtonKey = (
    scope: "device" | "global",
    id: string,
    action: "identify" | "mute"
  ) => `${scope}:${id}:${action}`;

  const setLedButtonStatus = (
    key: string,
    state: LedUiState,
    message?: string,
    ttlMs?: number
  ) => {
    const expiresAtMs = ttlMs ? Date.now() + ttlMs : undefined;
    const nextStatus: LedButtonStatus = { state };
    if (message !== undefined) nextStatus.message = message;
    if (expiresAtMs !== undefined) nextStatus.expiresAtMs = expiresAtMs;
    setLedButtonStatusByKey((prev) => ({
      ...prev,
      [key]: nextStatus,
    }));
  };

  const triggerLedCommand = async (
    device: ArtNetProductDto,
    command: LedCommand,
    buttonKey: string,
    expectedMode: LedMode,
    warningMessage: string
  ) => {
    setLedButtonStatus(buttonKey, "pending");
    const sentBundleCount = pollActivityFor(device.product_id)?.bundleCount ?? 0;
    setLedPendingByButton((prev) => ({
      ...prev,
      [buttonKey]: {
        productId: device.product_id,
        sentBundleCount,
        expected: expectedMode,
        startedAtMs: Date.now(),
        timeoutMs: LED_CONFIRM_TIMEOUT_MS,
        warningMessage,
      },
    }));
    try {
      const bindIndex = device.primary_bind_index ?? 1;
      await invoke("send_art_address", {
        params: {
          target_ip: device.ip_address,
          transport: device.transport_addr ?? null,
          bind_index: bindIndex,
          long_name: null,
          port_name: null,
          led_command: command,
        },
      });
      props.onReadCurrent?.();
    } catch (e) {
      setLedPendingByButton((prev) => {
        const next = { ...prev };
        delete next[buttonKey];
        return next;
      });
      setLedButtonStatus(
        buttonKey,
        "error",
        `Command failed: ${e instanceof Error ? e.message : String(e)}`,
        LED_STATUS_ERR_MS
      );
    }
  };

  const sendPerDeviceIdentifyToggle = async (device: ArtNetProductDto) => {
    const mode = deviceLedMode(device);
    const restoreState = ledRestoreByDevice()[device.product_id]?.identify;
    const key = ledButtonKey("device", device.product_id, "identify");
    if (mode === "identify") {
      const restore = restoreState ?? "normal";
      await triggerLedCommand(
        device,
        ledModeToCommand(restore),
        key,
        restore,
        "[Warning] LED identify not confirmed because Status1 indicator bits did not change within 2.6s. Next: verify panel LEDs physically and retry."
      );
      return;
    }
    const restore = mode === "unknown" ? "normal" : mode;
    setLedRestoreByDevice((prev) => ({
      ...prev,
      [device.product_id]: { ...prev[device.product_id], identify: restore },
    }));
    await triggerLedCommand(
      device,
      "identify",
      key,
      "identify",
      "[Warning] LED identify not confirmed because Status1 indicator bits did not change within 2.6s. Next: verify panel LEDs physically and retry."
    );
  };

  const sendPerDeviceMuteToggle = async (device: ArtNetProductDto) => {
    const mode = deviceLedMode(device);
    const restoreState = ledRestoreByDevice()[device.product_id]?.mute;
    const key = ledButtonKey("device", device.product_id, "mute");
    if (mode === "mute") {
      const restore = restoreState ?? "normal";
      await triggerLedCommand(
        device,
        ledModeToCommand(restore),
        key,
        restore,
        "[Warning] LED mute/normal transition not confirmed because Status1 indicator bits did not change within 2.6s. Next: verify panel LEDs physically and retry."
      );
      return;
    }
    const restore = mode === "unknown" ? "normal" : mode;
    setLedRestoreByDevice((prev) => ({
      ...prev,
      [device.product_id]: { ...prev[device.product_id], mute: restore },
    }));
    await triggerLedCommand(
      device,
      "mute",
      key,
      "mute",
      "[Warning] LED mute not confirmed because Status1 indicator bits did not change within 2.6s. Next: verify panel LEDs physically and retry."
    );
  };

  const selectedPollBundleCount = () =>
    selectedDevice()
      ? (pollActivityFor(selectedDevice()!.product_id)?.bundleCount ?? 0)
      : 0;

  const beginEdit = (_key: string, currentValue: string) => {
    // Clear stale errors when starting a new edit, otherwise a prior failure (e.g. ArtIpProg)
    // can appear to be caused by the current action.
    setFieldErrors({});
    setEditingIp(false);
    setEditingLongName(false);
    setEditingIpProgField(null);
    setEditingPortKey(null);
    setEditingValue(currentValue);
  };

  const portFieldKey = (bindIndex: number, slot: number) =>
    `port:${bindIndex}:${slot}`;
  const outFieldKey = (bindIndex: number, slot: number) =>
    `out:${bindIndex}:${slot}`;
  const inFieldKey = (bindIndex: number, slot: number) =>
    `in:${bindIndex}:${slot}`;

  const markPendingEdit = (
    key: string,
    productId: string,
    field: EditableField,
    expectedValue: string,
    baselineValue: string
  ) => {
    setPendingEdits((prev) => ({
      ...prev,
      [key]: {
        productId,
        field,
        expectedValue,
        baselineValue,
        sentAtBundleCount: selectedPollBundleCount(),
      },
    }));
  };

  const setLoadingForField = (key: string, loading: boolean) => {
    setFieldLoading((prev) => ({ ...prev, [key]: loading }));
  };

  /**
   * True while the IPC call is in flight OR we are waiting for the next ArtPollReply
   * to verify a change (send_art_address returns immediately; verification is async).
   */
  const isFieldBusy = (key: string) => {
    if (fieldLoading()[key]) return true;
    const pending = pendingEdits()[key];
    if (!pending || pending.warning != null) return false;
    const d = selectedDevice();
    return d != null && d.product_id === pending.productId;
  };

  const fieldSpinner = (key: string, opts?: { inline?: boolean }) => (
    <Show when={isFieldBusy(key)}>
      <span
        class={
          opts?.inline
            ? "inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-teal/50 border-t-teal align-middle"
            : "ml-1 inline-block h-3 w-3 animate-spin rounded-full border border-teal/50 border-t-teal align-middle"
        }
        title="Waiting for device confirmation…"
        aria-hidden="true"
      />
    </Show>
  );

  const selectDevice = (device: ArtNetProductDto) => {
    setSelectedProductId(device.product_id);
    if (detailTab() === "comms") setDetailTab("overview");
    setEditingIp(false);
    setEditingLongName(false);
    setEditingPortKey(null);
    setEditingValue("");
    setFieldErrors({});
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
        fromCore
          .invoke<string>("request_device_url", {
            target_ip: ip,
            esta_man: device.esta_man,
            oem: device.oem_code,
            request_type: DR_URL_PRODUCT,
          })
          .catch(() => undefined),
        fromCore
          .invoke<string>("request_device_url", {
            target_ip: ip,
            esta_man: device.esta_man,
            oem: device.oem_code,
            request_type: DR_URL_USER_GUIDE,
          })
          .catch(() => undefined),
        fromCore
          .invoke<string>("request_device_url", {
            target_ip: ip,
            esta_man: device.esta_man,
            oem: device.oem_code,
            request_type: DR_URL_SUPPORT,
          })
          .catch(() => undefined),
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

  const isValidIpv4 = (value: string) => {
    const m = value.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (!m) return false;
    return value.split(".").every((part) => {
      const num = Number(part);
      return Number.isInteger(num) && num >= 0 && num <= 255;
    });
  };

  const submitIpEdit = async () => {
    const device = selectedDevice();
    if (!device) return;
    const key = "ip";
    const nextIp = editingValue().trim();
    if (!isValidIpv4(nextIp)) {
      setFieldErrors((prev) => ({ ...prev, [key]: "Invalid IPv4 address." }));
      return;
    }
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    setEditingIp(false);
    setLoadingForField(key, true);
    const baselineIp = device.ip_address;
    const productId = device.product_id;
    const transportAddr = device.transport_addr ?? null;
    void invoke("send_ip_prog", {
      params: {
        target_ip: baselineIp,
        transport: transportAddr,
        new_ip: nextIp,
        subnet_mask: null,
        gateway: null,
        port: null,
        enable_programming: true,
        enable_dhcp: false,
      },
    })
      .then(() => {
        markPendingEdit(key, productId, "ip", nextIp, baselineIp);
        props.onReadCurrent?.();
      })
      .catch((e) => {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: e instanceof Error ? e.message : String(e),
        }));
      })
      .finally(() => {
        setLoadingForField(key, false);
      });
  };

  const ipProgForSelected = () => {
    const d = selectedDevice();
    if (!d) return undefined;
    return ipProgByProductId()[d.product_id];
  };

  const readIpProg = async (device: ArtNetProductDto) => {
    const key = `ipprog_read:${device.product_id}`;
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    setLoadingForField(key, true);
    const transportAddr = device.transport_addr ?? null;
    const targetIp = device.ip_address;
    void invoke<IpProgReplyDto>("send_ip_prog", {
      params: {
        target_ip: targetIp,
        transport: transportAddr,
        new_ip: null,
        subnet_mask: null,
        gateway: null,
        port: null,
        enable_programming: false,
        enable_dhcp: false,
      },
    })
      .then((reply) => {
        setIpProgByProductId((prev) => ({
          ...prev,
          [device.product_id]: { reply, receivedAtMs: Date.now() },
        }));
      })
      .catch((e) => {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: e instanceof Error ? e.message : String(e),
        }));
      })
      .finally(() => setLoadingForField(key, false));
  };

  const submitIpProgField = async (
    device: ArtNetProductDto,
    field: "subnet_mask" | "gateway" | "port"
  ) => {
    const key = `ipprog_${field}:${device.product_id}`;
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    const nextRaw = editingValue().trim();
    if (!nextRaw) {
      setFieldErrors((prev) => ({ ...prev, [key]: "Value is required." }));
      return;
    }
    if (
      (field === "subnet_mask" || field === "gateway") &&
      !isValidIpv4(nextRaw)
    ) {
      setFieldErrors((prev) => ({ ...prev, [key]: "Invalid IPv4 address." }));
      return;
    }
    let portValue: number | null = null;
    if (field === "port") {
      const v = Number(nextRaw);
      if (!Number.isInteger(v) || v < 1 || v > 65535) {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: "Port must be 1..65535.",
        }));
        return;
      }
      portValue = v;
    }

    setLoadingForField(key, true);
    setEditingValue("");

    const transportAddr = device.transport_addr ?? null;
    const targetIp = device.ip_address;
    void invoke<IpProgReplyDto>("send_ip_prog", {
      params: {
        target_ip: targetIp,
        transport: transportAddr,
        new_ip: null,
        subnet_mask: field === "subnet_mask" ? nextRaw : null,
        gateway: field === "gateway" ? nextRaw : null,
        port: field === "port" ? portValue : null,
        enable_programming: true,
        enable_dhcp: false,
      },
    })
      .then((reply) => {
        // Backend returns IpProgReplyDto; treat as updated "last read" snapshot.
        setIpProgByProductId((prev) => ({
          ...prev,
          [device.product_id]: { reply, receivedAtMs: Date.now() },
        }));
      })
      .catch((e) => {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: e instanceof Error ? e.message : String(e),
        }));
      })
      .finally(() => setLoadingForField(key, false));
  };

  const submitLongNameEdit = async () => {
    const device = selectedDevice();
    if (!device) return;
    const key = "long_name";
    const nextLongName = editingValue().trim();
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    setEditingLongName(false);
    setLoadingForField(key, true);
    const baselineLongName = device.long_name;
    const productId = device.product_id;
    const targetIp = device.ip_address;
    const transportAddr = device.transport_addr ?? null;
    const bindIndex = device.primary_bind_index ?? 1;
    void invoke("send_art_address", {
      params: {
        target_ip: targetIp,
        transport: transportAddr,
        bind_index: bindIndex,
        long_name: nextLongName,
        port_name: null,
      },
    })
      .then(() => {
        markPendingEdit(
          key,
          productId,
          "long_name",
          nextLongName,
          baselineLongName
        );
        props.onReadCurrent?.();
      })
      .catch((e) => {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: e instanceof Error ? e.message : String(e),
        }));
      })
      .finally(() => {
        setLoadingForField(key, false);
      });
  };

  const submitPortNameEdit = async (
    bindIndex: number,
    slot: number,
    currentLabel: string
  ) => {
    const device = selectedDevice();
    if (!device) return;
    const key = portFieldKey(bindIndex, slot);
    const nextPortName = editingValue().trim();
    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    setEditingPortKey(null);
    setLoadingForField(key, true);
    const productId = device.product_id;
    const targetIp = device.ip_address;
    const transportAddr = device.transport_addr ?? null;
    void invoke("send_art_address", {
      params: {
        target_ip: targetIp,
        transport: transportAddr,
        bind_index: bindIndex,
        long_name: null,
        port_name: nextPortName,
      },
    })
      .then(() => {
        markPendingEdit(
          key,
          productId,
          "port_name",
          nextPortName,
          currentLabel
        );
        props.onReadCurrent?.();
      })
      .catch((e) => {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: e instanceof Error ? e.message : String(e),
        }));
      })
      .finally(() => {
        setLoadingForField(key, false);
      });
  };

  const submitPortOutEdit = async (
    bindIndex: number,
    slot: number,
    currentValue: number
  ) => {
    const device = selectedDevice();
    if (!device) return;
    const key = outFieldKey(bindIndex, slot);
    const parsed = parsePortAddress(editingValue());
    if (parsed.error) {
      setFieldErrors((prev) => ({ ...prev, [key]: parsed.error! }));
      return;
    }
    const nextAddr = parsed.value!;
    // Safety: only allow changing the universe nibble unless Net/SubNet match current.
    if (((nextAddr >> 4) & 0x7ff) !== ((currentValue >> 4) & 0x7ff)) {
      setFieldErrors((prev) => ({
        ...prev,
        [key]:
          "Changing Net/SubNet via ArtAddress is not supported yet. Keep Net/SubNet the same and adjust only Universe (last digit).",
      }));
      return;
    }

    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    setEditingPortKey(null);
    setLoadingForField(key, true);
    const productId = device.product_id;
    const targetIp = device.ip_address;
    const transportAddr = device.transport_addr ?? null;

    void invoke("send_art_address", {
      params: {
        target_ip: targetIp,
        transport: transportAddr,
        bind_index: bindIndex,
        long_name: null,
        port_name: null,
        set_output_universe: { slot, universe: nextAddr },
      },
    })
      .then(() => {
        markPendingEdit(
          key,
          productId,
          "port_out",
          String(nextAddr),
          String(currentValue)
        );
        props.onReadCurrent?.();
      })
      .catch((e) => {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: e instanceof Error ? e.message : String(e),
        }));
      })
      .finally(() => setLoadingForField(key, false));
  };

  const submitPortInEdit = async (
    bindIndex: number,
    slot: number,
    currentValue: number | null | undefined,
    outputUniverseForBaseline: number
  ) => {
    const device = selectedDevice();
    if (!device) return;
    const key = inFieldKey(bindIndex, slot);
    const parsed = parsePortAddress(editingValue());
    if (parsed.error) {
      setFieldErrors((prev) => ({ ...prev, [key]: parsed.error! }));
      return;
    }
    const nextAddr = parsed.value!;
    const baselineNetSub = (currentValue ?? outputUniverseForBaseline) >> 4;
    if (((nextAddr >> 4) & 0x7ff) !== (baselineNetSub & 0x7ff)) {
      setFieldErrors((prev) => ({
        ...prev,
        [key]:
          "Changing Net/SubNet via ArtAddress is not supported yet. Keep Net/SubNet the same and adjust only Universe (last digit).",
      }));
      return;
    }

    setFieldErrors((prev) => ({ ...prev, [key]: "" }));
    setEditingPortKey(null);
    setLoadingForField(key, true);
    const productId = device.product_id;
    const targetIp = device.ip_address;
    const transportAddr = device.transport_addr ?? null;

    void invoke("send_art_address", {
      params: {
        target_ip: targetIp,
        transport: transportAddr,
        bind_index: bindIndex,
        long_name: null,
        port_name: null,
        set_input_universe: { slot, universe: nextAddr },
      },
    })
      .then(() => {
        markPendingEdit(
          key,
          productId,
          "port_in",
          String(nextAddr),
          String(currentValue ?? "")
        );
        props.onReadCurrent?.();
      })
      .catch((e) => {
        setFieldErrors((prev) => ({
          ...prev,
          [key]: e instanceof Error ? e.message : String(e),
        }));
      })
      .finally(() => setLoadingForField(key, false));
  };

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
    return log.entries
      .filter((e) => e.sourceIp === ip)
      .slice(-120)
      .reverse();
  });

  const pollActivityFor = (productId: string) =>
    props.pollReplyActivity?.()[productId];

  const deviceDisplayTitle = (device: ArtNetProductDto): string => {
    if (device.long_name === "Manual entry") {
      return device.short_name || "Manual entry";
    }
    const base =
      device.long_name.trim() || device.short_name.trim() || "Unknown Device";
    const ordinal = nodeOrdinalById().get(device.product_id);
    return ordinal != null ? `${base} [${ordinal}]` : base;
  };

  const pulseTooltip = (device: ArtNetProductDto): string => {
    const activity = pollActivityFor(device.product_id);
    if (!activity) {
      return "No ArtPollReply activity observed yet for this node in the current session.";
    }
    const lastSeenIso = new Date(activity.lastReceivedAtMs).toLocaleTimeString(
      "en-GB",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }
    );
    return [
      "ArtPollReply activity indicator",
      "",
      `Node: ${activity.shortName || device.short_name || "Unknown Device"}`,
      `IP: ${activity.ipAddress}`,
      `Bind IP: ${activity.bindIp}`,
      `Last bundle: ${lastSeenIso}`,
      `Last bindIndex in bundle: ${activity.lastBindIndex}`,
      `Bundle dedup window: ${activity.bundleWindowMs} ms`,
      `PollReply bundles observed (deduped): ${activity.bundleCount}`,
      "",
      "Behavior: flash is triggered by deduped PollReply bundle events.",
    ].join("\n");
  };

  createEffect(() => {
    const allPending = pendingEdits();
    if (Object.keys(allPending).length === 0) return;
    const { next, changed } = reconcilePendingEdits({
      pending: allPending,
      products: mergedProducts(),
      activityById: props.pollReplyActivity?.() ?? {},
    });
    if (changed) setPendingEdits(next);
  });

  createEffect(() => {
    const products = mergedProducts();
    const pending = ledPendingByButton();
    const now = nowTickMs();
    if (Object.keys(pending).length === 0) return;
    const byId = new Map(products.map((d) => [d.product_id, d]));
    let pendingChanged = false;
    const nextPending = { ...pending };
    for (const [buttonKey, wait] of Object.entries(pending)) {
      const parts = buttonKey.split(":");
      const scope = parts[0];
      const productId = parts[1];
      if (scope !== "device") continue;
      if (!productId) continue;
      const d = byId.get(productId);
      if (!d) continue;
      const mode = deviceLedMode(d);
      const bundleCount =
        pollActivityFor(wait.productId)?.bundleCount ?? wait.sentBundleCount;
      const hasFreshPollReply = bundleCount > wait.sentBundleCount;
      if (hasFreshPollReply && mode === wait.expected) {
        delete nextPending[buttonKey];
        setLedButtonStatus(buttonKey, "confirmed", undefined, LED_STATUS_CONFIRM_MS);
        pendingChanged = true;
        continue;
      }
      if (now - wait.startedAtMs >= wait.timeoutMs) {
        delete nextPending[buttonKey];
        setLedButtonStatus(
          buttonKey,
          "warning",
          wait.warningMessage,
          LED_STATUS_WARN_MS
        );
        pendingChanged = true;
      }
    }
    if (pendingChanged) setLedPendingByButton(nextPending);
  });

  createEffect(() => {
    const statuses = ledButtonStatusByKey();
    const now = nowTickMs();
    const next = { ...statuses };
    let changed = false;
    for (const [key, status] of Object.entries(statuses)) {
      if (!status.expiresAtMs) continue;
      if (status.expiresAtMs <= now) {
        next[key] = { state: "neutral" };
        changed = true;
      }
    }
    if (changed) setLedButtonStatusByKey(next);
  });

  createEffect(() => {
    const now = nowTickMs();
    const products = mergedProducts();
    const byId = new Map(products.map((d) => [d.product_id, d]));

    const identifyPending = globalIdentifyPending();
    if (identifyPending) {
      const done = Object.entries(identifyPending.expectedById).every(
        ([id, expected]) => {
          const d = byId.get(id);
          const freshBundle =
            (pollActivityFor(id)?.bundleCount ?? 0) >
            (identifyPending.sentBundleById[id] ?? 0);
          return d != null && freshBundle && deviceLedMode(d) === expected;
        }
      );
      if (done) {
        setLedButtonStatus(
          ledButtonKey("global", "connected", "identify"),
          "confirmed",
          undefined,
          LED_STATUS_CONFIRM_MS
        );
        setGlobalIdentifyPending(null);
      } else if (now - identifyPending.startedAtMs >= LED_CONFIRM_TIMEOUT_MS) {
        setLedButtonStatus(
          ledButtonKey("global", "connected", "identify"),
          "warning",
          identifyPending.warningMessage,
          LED_STATUS_WARN_MS
        );
        setGlobalIdentifyPending(null);
      }
    }

    const mutePending = globalMutePending();
    if (mutePending) {
      const done = Object.entries(mutePending.expectedById).every(
        ([id, expected]) => {
          const d = byId.get(id);
          const freshBundle =
            (pollActivityFor(id)?.bundleCount ?? 0) >
            (mutePending.sentBundleById[id] ?? 0);
          return d != null && freshBundle && deviceLedMode(d) === expected;
        }
      );
      if (done) {
        setLedButtonStatus(
          ledButtonKey("global", "connected", "mute"),
          "confirmed",
          undefined,
          LED_STATUS_CONFIRM_MS
        );
        setGlobalMutePending(null);
      } else if (now - mutePending.startedAtMs >= LED_CONFIRM_TIMEOUT_MS) {
        setLedButtonStatus(
          ledButtonKey("global", "connected", "mute"),
          "warning",
          mutePending.warningMessage,
          LED_STATUS_WARN_MS
        );
        setGlobalMutePending(null);
      }
    }
  });

  const ledStatusFor = (key: string): LedButtonStatus =>
    ledButtonStatusByKey()[key] ?? { state: "neutral" };

  const ledIndicator = (state: LedUiState) => (
    <span
      class="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
      classList={{
        "bg-teal/25 border border-teal/50 animate-pulse": state === "pending",
        "bg-teal/20 border border-teal text-teal text-[10px]": state === "confirmed",
        "bg-amber/20 border border-amber text-amber text-[10px]": state === "warning",
        "bg-red-500/20 border border-red-400 text-red-400 text-[10px]":
          state === "error",
      }}
      aria-hidden="true"
    >
      <Show when={state === "confirmed"}>✓</Show>
      <Show when={state === "warning"}>!</Show>
      <Show when={state === "error"}>x</Show>
    </span>
  );

  return (
    <div
      data-testid="device-list"
      class="rounded-lg border border-edge bg-surface p-4"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-medium tracking-wide uppercase text-secondary">
          Devices
        </h2>
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
                "border-edge text-muted hover:border-edge-active hover:text-secondary":
                  deviceFilter() !== f,
              }}
            >
              {f}
            </button>
          )}
        </For>
        <span class="ml-auto text-[10px] text-muted font-mono">
          {filteredDevices().length} node
          {filteredDevices().length !== 1 ? "s" : ""}
        </span>
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
        <div class="space-y-3">
          <Show when={controllersSeen().length > 0}>
            <div class="rounded-md border border-edge bg-obsidian p-2">
              <div class="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                Controllers seen (ArtPoll senders)
              </div>
              <div class="space-y-1">
                <For each={controllersSeen()}>
                  {(c) => (
                    <div class="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span class="text-secondary">{c.ip}</span>
                      <span class="text-muted">
                        {Math.round(c.last_seen_at_ms / 100) / 10}s ago
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show
            when={filteredDevices().length > 0}
            fallback={
              <div class="flex h-24 items-center justify-center text-xs text-muted">
                No Art-Net devices discovered
              </div>
            }
          >
            <Show when={connectedDevices().length > 0}>
              <div class="flex items-center justify-between gap-2">
                <div class="text-[10px] font-medium uppercase tracking-wider text-muted">
                  Connected
                </div>
                <div class="flex items-center gap-1">
                  {(() => {
                    const key = ledButtonKey("global", "connected", "identify");
                    const status = ledStatusFor(key);
                    return (
                      <button
                        type="button"
                        onClick={() => void toggleGlobalIdentify()}
                        data-testid="led-global-identify"
                        class="inline-flex min-w-[7.25rem] items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors"
                        classList={{
                          "border-teal/40 bg-teal/10 text-teal":
                            globalIdentifyActive(),
                          "border-edge bg-surface text-secondary hover:text-primary":
                            !globalIdentifyActive(),
                        }}
                      >
                        <Show when={status.state !== "neutral"}>
                          {ledIndicator(status.state)}
                        </Show>
                        <Show
                          when={status.state === "neutral"}
                          fallback={<span class="invisible">Identify</span>}
                        >
                          <span>Identify</span>
                        </Show>
                      </button>
                    );
                  })()}
                  {(() => {
                    const key = ledButtonKey("global", "connected", "mute");
                    const status = ledStatusFor(key);
                    return (
                      <button
                        type="button"
                        onClick={() => void toggleGlobalMute()}
                        data-testid="led-global-mute"
                        class="inline-flex min-w-[7.25rem] items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors"
                        classList={{
                          "border-teal/40 bg-teal/10 text-teal": globalMuteActive(),
                          "border-edge bg-surface text-secondary hover:text-primary":
                            !globalMuteActive(),
                        }}
                      >
                        <Show when={status.state !== "neutral"}>
                          {ledIndicator(status.state)}
                        </Show>
                        <Show
                          when={status.state === "neutral"}
                          fallback={<span class="invisible">Mute LED</span>}
                        >
                          <span>Mute LED</span>
                        </Show>
                      </button>
                    );
                  })()}
                </div>
              </div>
            </Show>
            <Show
              when={
                ledStatusFor(ledButtonKey("global", "connected", "identify"))
                  .message ||
                ledStatusFor(ledButtonKey("global", "connected", "mute")).message
              }
            >
              <div class="min-h-[1rem] text-[10px] text-amber">
                {ledStatusFor(ledButtonKey("global", "connected", "identify"))
                  .message ||
                  ledStatusFor(ledButtonKey("global", "connected", "mute")).message}
              </div>
            </Show>
            <For each={connectedDevices()}>
              {(device) => {
                const selected = () =>
                  selectedProductId() === device.product_id;
                return (
                  <div
                    class="rounded-md border bg-obsidian p-2 transition-colors"
                    classList={{
                      "border-teal/30 ring-1 ring-teal/40": selected(),
                      "border-edge hover:border-edge-active": !selected(),
                    }}
                  >
                    <div class="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => selectDevice(device)}
                        class="min-w-0 flex-1 text-left"
                      >
                        <div class="flex items-center gap-2">
                          <PollReplyPulseDot
                            activity={pollActivityFor(device.product_id)}
                            tooltip={pulseTooltip(device)}
                            testId={`poll-reply-dot-${device.product_id}`}
                          />
                          <span class="truncate text-sm text-primary">
                            {deviceDisplayTitle(device)}
                          </span>
                          <span class="rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-mono text-teal">
                            {device.ports.length}p
                          </span>
                        </div>
                        <div class="mt-0.5 flex items-center gap-2 text-[11px] text-muted font-mono">
                          <span>{device.ip_address}</span>
                          <span>FW {hex(device.firmware_version, 4)}</span>
                        </div>
                      </button>
                      <div class="flex items-center gap-1">
                        {(() => {
                          const key = ledButtonKey(
                            "device",
                            device.product_id,
                            "identify"
                          );
                          const status = ledStatusFor(key);
                          return (
                            <button
                              type="button"
                              onClick={() => void sendPerDeviceIdentifyToggle(device)}
                              data-testid={`led-device-identify-${device.product_id}`}
                              class="inline-flex min-w-[6.6rem] items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors"
                              classList={{
                                "border-teal/40 bg-teal/10 text-teal":
                                  deviceLedMode(device) === "identify",
                                "border-edge bg-surface text-secondary hover:text-primary":
                                  deviceLedMode(device) !== "identify",
                              }}
                            >
                              <Show when={status.state !== "neutral"}>
                                {ledIndicator(status.state)}
                              </Show>
                              <Show
                                when={status.state === "neutral"}
                                fallback={<span class="invisible">Identify</span>}
                              >
                                <span>Identify</span>
                              </Show>
                            </button>
                          );
                        })()}
                        {(() => {
                          const key = ledButtonKey(
                            "device",
                            device.product_id,
                            "mute"
                          );
                          const status = ledStatusFor(key);
                          return (
                            <button
                              type="button"
                              onClick={() => void sendPerDeviceMuteToggle(device)}
                              data-testid={`led-device-mute-${device.product_id}`}
                              class="inline-flex min-w-[6.6rem] items-center justify-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors"
                              classList={{
                                "border-teal/40 bg-teal/10 text-teal":
                                  deviceLedMode(device) === "mute",
                                "border-edge bg-surface text-secondary hover:text-primary":
                                  deviceLedMode(device) !== "mute",
                              }}
                            >
                              <Show when={status.state !== "neutral"}>
                                {ledIndicator(status.state)}
                              </Show>
                              <Show
                                when={status.state === "neutral"}
                                fallback={<span class="invisible">Mute LED</span>}
                              >
                                <span>Mute LED</span>
                              </Show>
                            </button>
                          );
                        })()}
                        <Show when={props.onReadCurrent}>
                          <button
                            type="button"
                            onClick={() => props.onReadCurrent?.()}
                            class="rounded border border-edge bg-surface px-2 py-1 text-[10px] text-secondary hover:text-teal"
                          >
                            Read current
                          </button>
                        </Show>
                        <button
                          type="button"
                          onClick={() => fetchDeviceUrls(device)}
                          class="rounded border border-edge bg-surface px-2 py-1 text-[10px] text-secondary hover:text-primary"
                        >
                          URLs
                        </button>
                      </div>
                    </div>
                    <div class="min-h-[1rem] pt-1 text-[10px] text-amber">
                      {ledStatusFor(
                        ledButtonKey("device", device.product_id, "identify")
                      ).message ||
                        ledStatusFor(
                          ledButtonKey("device", device.product_id, "mute")
                        ).message ||
                        ""}
                    </div>
                  </div>
                );
              }}
            </For>

            <Show when={previouslySeenDevices().length > 0}>
              <div class="border-t border-edge pt-3 text-[10px] font-medium uppercase tracking-wider text-muted">
                Previously seen
              </div>
            </Show>
            <For each={previouslySeenDevices()}>
              {(device) => (
                <div
                  class="rounded-md border border-edge bg-obsidian/80 p-2 transition-colors"
                  classList={{
                    "border-teal/30 ring-1 ring-teal/40":
                      selectedProductId() === device.product_id,
                    "hover:border-edge-active":
                      selectedProductId() !== device.product_id,
                  }}
                >
                  <div class="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => selectDevice(device)}
                      class="min-w-0 flex-1 text-left"
                    >
                      <div class="flex items-center gap-2">
                        <span class="h-1.5 w-1.5 rounded-full bg-amber" />
                        <span class="truncate text-sm text-secondary">
                          {deviceDisplayTitle(device)}
                        </span>
                        <Show when={device.long_name === "Manual entry"}>
                          <span class="rounded bg-amber/10 px-1.5 py-0.5 text-[10px] text-amber">
                            Manual
                          </span>
                        </Show>
                      </div>
                      <div class="mt-0.5 text-[11px] text-muted font-mono">
                        {device.ip_address}
                      </div>
                    </button>
                    <div class="flex items-center gap-1">
                      <Show when={props.onReadCurrent}>
                        <button
                          type="button"
                          onClick={() => props.onReadCurrent?.()}
                          class="rounded border border-edge bg-surface px-2 py-1 text-[10px] text-secondary hover:text-teal"
                        >
                          Read current
                        </button>
                      </Show>
                      <Show
                        when={
                          device.long_name === "Manual entry" &&
                          props.onRemoveManualDevice
                        }
                      >
                        <button
                          type="button"
                          onClick={() =>
                            props.onRemoveManualDevice?.(device.ip_address)
                          }
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

        <div
          class="rounded-lg border border-edge bg-obsidian p-3"
          data-testid="device-detail-panel"
        >
          <Show
            when={selectedDevice()}
            fallback={
              <div class="flex h-full min-h-[16rem] items-center justify-center text-xs text-muted">
                Select a device to view full diagnostics and protocol details.
              </div>
            }
          >
            {(device) => (
              <>
                <div class="mb-2">
                  <div class="text-sm text-primary truncate">
                    {deviceDisplayTitle(device())}
                  </div>
                  <div class="text-[11px] font-mono text-muted">
                    {device().ip_address}
                  </div>
                </div>

                <div class="mb-3 flex flex-wrap gap-1.5">
                  <For
                    each={
                      [
                        "overview",
                        "ports",
                        "diagnostics",
                        "comms",
                        "protocol",
                      ] as DeviceTab[]
                    }
                  >
                    {(tab) => (
                      <button
                        type="button"
                        onClick={() => setDetailTab(tab)}
                        class="rounded border px-2 py-1 text-[10px] uppercase tracking-wide"
                        classList={{
                          "border-teal/40 bg-teal/10 text-teal":
                            detailTab() === tab,
                          "border-edge text-muted hover:border-edge-active hover:text-secondary":
                            detailTab() !== tab,
                        }}
                      >
                        {tab}
                      </button>
                    )}
                  </For>
                </div>

                <Show when={detailTab() === "overview"}>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <span class="text-muted">IP</span>
                    <div class="min-w-0">
                      <Show
                        when={editingIp()}
                        fallback={
                          <button
                            type="button"
                            class="w-full truncate text-left font-mono text-secondary hover:text-teal"
                            title="Double-click to edit IP"
                            onDblClick={() => {
                              beginEdit("ip", device().ip_address);
                              setEditingIp(true);
                            }}
                          >
                            {device().ip_address}
                          </button>
                        }
                      >
                        <input
                          autofocus
                          value={editingValue()}
                          onInput={(e) =>
                            setEditingValue(e.currentTarget.value)
                          }
                          onBlur={() => setEditingIp(false)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingIp(false);
                            if (e.key === "Enter") void submitIpEdit();
                          }}
                          class="w-full rounded border border-edge-active bg-surface px-2 py-1 font-mono text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                        />
                      </Show>
                      <Show when={editingIp()}>
                        <div class="mt-1 text-[10px] text-amber">
                          Warning: IP changes can disconnect the node from the
                          rig network.
                        </div>
                      </Show>
                      <div class="text-[10px] text-teal">
                        {fieldSpinner("ip")}
                      </div>
                      <Show when={pendingEdits()["ip"]?.warning}>
                        <div class="mt-1 text-[10px] text-amber">
                          {pendingEdits()["ip"]?.warning}
                        </div>
                      </Show>
                      <Show when={fieldErrors()["ip"]}>
                        <div class="mt-1 text-[10px] text-error">
                          {fieldErrors()["ip"]}
                        </div>
                      </Show>
                    </div>
                    <span class="text-muted">IP cfg</span>
                    <div class="min-w-0">
                      <div class="flex items-center justify-between gap-2">
                        <div class="text-[10px] uppercase tracking-wide text-muted">
                          ArtIpProgReply
                          <Show when={ipProgForSelected()}>
                            <span class="ml-2 normal-case text-muted">
                              (last read{" "}
                              {new Date(
                                ipProgForSelected()!.receivedAtMs
                              ).toLocaleTimeString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                              })}
                              )
                            </span>
                          </Show>
                        </div>
                        <button
                          type="button"
                          class="rounded border border-edge px-2 py-1 text-[10px] uppercase tracking-wide text-muted hover:border-edge-active hover:text-secondary"
                          onClick={() => void readIpProg(device())}
                        >
                          Read
                        </button>
                      </div>

                      <Show
                        when={ipProgForSelected()}
                        fallback={
                          <div class="mt-1 text-[11px] text-secondary">
                            Not read yet.
                          </div>
                        }
                      >
                        <div class="mt-1 grid grid-cols-4 gap-x-2 gap-y-1 text-[11px]">
                          <span class="text-muted">mask</span>
                          <Show
                            when={editingIpProgField() === "subnet_mask"}
                            fallback={
                              <button
                                type="button"
                                class="truncate text-left font-mono text-secondary hover:text-teal"
                                title="Double-click to edit subnet mask"
                                onDblClick={() => {
                                  beginEdit(
                                    `ipprog_subnet_mask:${device().product_id}`,
                                    ipProgForSelected()!.reply.subnet_mask
                                  );
                                  setEditingIpProgField("subnet_mask");
                                }}
                              >
                                {ipProgForSelected()!.reply.subnet_mask}
                              </button>
                            }
                          >
                            <input
                              autofocus
                              value={editingValue()}
                              onInput={(e) =>
                                setEditingValue(e.currentTarget.value)
                              }
                              onBlur={() => setEditingIpProgField(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape")
                                  setEditingIpProgField(null);
                                if (e.key === "Enter")
                                  void submitIpProgField(
                                    device(),
                                    "subnet_mask"
                                  );
                              }}
                              class="w-full rounded border border-edge-active bg-surface px-2 py-1 font-mono text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                            />
                          </Show>
                          <span class="text-muted">gw</span>
                          <Show
                            when={editingIpProgField() === "gateway"}
                            fallback={
                              <button
                                type="button"
                                class="truncate text-left font-mono text-secondary hover:text-teal"
                                title="Double-click to edit gateway"
                                onDblClick={() => {
                                  beginEdit(
                                    `ipprog_gateway:${device().product_id}`,
                                    ipProgForSelected()!.reply.gateway
                                  );
                                  setEditingIpProgField("gateway");
                                }}
                              >
                                {ipProgForSelected()!.reply.gateway}
                              </button>
                            }
                          >
                            <input
                              autofocus
                              value={editingValue()}
                              onInput={(e) =>
                                setEditingValue(e.currentTarget.value)
                              }
                              onBlur={() => setEditingIpProgField(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape")
                                  setEditingIpProgField(null);
                                if (e.key === "Enter")
                                  void submitIpProgField(device(), "gateway");
                              }}
                              class="w-full rounded border border-edge-active bg-surface px-2 py-1 font-mono text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                            />
                          </Show>

                          <span class="text-muted">port</span>
                          <Show
                            when={editingIpProgField() === "port"}
                            fallback={
                              <button
                                type="button"
                                class="truncate text-left font-mono text-secondary hover:text-teal"
                                title="Double-click to edit port"
                                onDblClick={() => {
                                  beginEdit(
                                    `ipprog_port:${device().product_id}`,
                                    String(ipProgForSelected()!.reply.port)
                                  );
                                  setEditingIpProgField("port");
                                }}
                              >
                                {ipProgForSelected()!.reply.port}
                              </button>
                            }
                          >
                            <input
                              autofocus
                              value={editingValue()}
                              onInput={(e) =>
                                setEditingValue(e.currentTarget.value)
                              }
                              onBlur={() => setEditingIpProgField(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape")
                                  setEditingIpProgField(null);
                                if (e.key === "Enter")
                                  void submitIpProgField(device(), "port");
                              }}
                              class="w-full rounded border border-edge-active bg-surface px-2 py-1 font-mono text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                            />
                          </Show>
                          <span class="text-muted">dhcp</span>
                          <span class="font-mono text-secondary">
                            {ipProgForSelected()!.reply.dhcp_enabled
                              ? "on"
                              : "off"}
                          </span>
                        </div>
                      </Show>
                      <div class="text-[10px] text-teal">
                        {fieldSpinner(`ipprog_read:${device().product_id}`)}
                      </div>
                      <Show
                        when={
                          fieldErrors()[`ipprog_read:${device().product_id}`]
                        }
                      >
                        <div class="mt-1 text-[10px] text-error">
                          {fieldErrors()[`ipprog_read:${device().product_id}`]}
                        </div>
                      </Show>
                      <Show
                        when={
                          fieldErrors()[
                            `ipprog_subnet_mask:${device().product_id}`
                          ]
                        }
                      >
                        <div class="mt-1 text-[10px] text-error">
                          {
                            fieldErrors()[
                              `ipprog_subnet_mask:${device().product_id}`
                            ]
                          }
                        </div>
                      </Show>
                      <Show
                        when={
                          fieldErrors()[`ipprog_gateway:${device().product_id}`]
                        }
                      >
                        <div class="mt-1 text-[10px] text-error">
                          {
                            fieldErrors()[
                              `ipprog_gateway:${device().product_id}`
                            ]
                          }
                        </div>
                      </Show>
                      <Show
                        when={
                          fieldErrors()[`ipprog_port:${device().product_id}`]
                        }
                      >
                        <div class="mt-1 text-[10px] text-error">
                          {fieldErrors()[`ipprog_port:${device().product_id}`]}
                        </div>
                      </Show>
                    </div>
                    <span class="text-muted">Long Name</span>
                    <div
                      class="min-w-0"
                      aria-busy={isFieldBusy("long_name") ? "true" : "false"}
                    >
                      <Show
                        when={editingLongName()}
                        fallback={
                          <button
                            type="button"
                            class="w-full truncate text-left text-secondary hover:text-teal"
                            title={device().long_name}
                            onDblClick={() => {
                              beginEdit("long_name", device().long_name);
                              setEditingLongName(true);
                            }}
                          >
                            {device().long_name}
                          </button>
                        }
                      >
                        <input
                          autofocus
                          value={editingValue()}
                          onInput={(e) =>
                            setEditingValue(e.currentTarget.value)
                          }
                          onBlur={() => setEditingLongName(false)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingLongName(false);
                            if (e.key === "Enter") void submitLongNameEdit();
                          }}
                          class="w-full rounded border border-edge-active bg-surface px-2 py-1 text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                        />
                      </Show>
                      <div class="mt-0.5 flex min-h-[1rem] flex-wrap items-center gap-2 text-[10px] text-teal">
                        {fieldSpinner("long_name")}
                        <Show when={isFieldBusy("long_name")}>
                          <span class="text-muted">
                            Waiting for ArtPollReply…
                          </span>
                        </Show>
                      </div>
                      <Show when={pendingEdits()["long_name"]?.warning}>
                        <div class="mt-1 text-[10px] text-amber">
                          {pendingEdits()["long_name"]?.warning}
                        </div>
                      </Show>
                      <Show when={fieldErrors()["long_name"]}>
                        <div class="mt-1 text-[10px] text-error">
                          {fieldErrors()["long_name"]}
                        </div>
                      </Show>
                    </div>
                    <span class="text-muted">MAC</span>
                    <span class="font-mono text-secondary">
                      {device().mac_address || "Not reported"}
                    </span>
                    <span class="text-muted">Firmware</span>
                    <span class="font-mono text-secondary">
                      {hex(device().firmware_version, 4)}
                    </span>
                    <span class="text-muted">OEM / ESTA</span>
                    <span class="font-mono text-secondary">
                      {hex(device().oem_code, 4)} / {hex(device().esta_man, 4)}
                    </span>
                    <span class="text-muted">Node Report</span>
                    <span
                      class="text-secondary truncate"
                      title={device().node_report || "Not reported"}
                    >
                      {device().node_report || "Not reported"}
                    </span>
                    <span class="text-muted">Bind IP</span>
                    <span class="font-mono text-secondary">
                      {device().bind_ip || "-"}
                    </span>
                    <span class="text-muted">Output universes</span>
                    <span class="font-mono text-secondary text-[11px]">
                      {device().ports.length
                        ? device()
                            .ports.map((p) =>
                              formatPortAddress(p.output_universe)
                            )
                            .join(", ")
                        : "None"}
                    </span>
                  </div>

                  <div class="mt-3 border-t border-edge pt-3">
                    <div class="mb-2 flex items-center justify-between">
                      <span class="text-xs text-muted">Device URLs</span>
                      <div class="flex items-center gap-2">
                        <Show when={props.onReadCurrent}>
                          <button
                            type="button"
                            onClick={() => props.onReadCurrent?.()}
                            class="rounded-md border border-edge bg-surface px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover"
                          >
                            Read current
                          </button>
                        </Show>
                        <button
                          type="button"
                          onClick={() => fetchDeviceUrls(device())}
                          disabled={urlsFor(device().ip_address)?.loading}
                          class="rounded-md border border-edge bg-surface px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover disabled:opacity-50"
                        >
                          {urlsFor(device().ip_address)?.loading
                            ? "Fetching…"
                            : "Fetch URLs"}
                        </button>
                      </div>
                    </div>
                    <Show when={urlsFor(device().ip_address)?.error}>
                      <div class="mb-1 text-[11px] text-error">
                        {urlsFor(device().ip_address)?.error}
                      </div>
                    </Show>
                    <div class="flex flex-col gap-1 text-[11px]">
                      <Show when={urlsFor(device().ip_address)?.product_url}>
                        {(url) => (
                          <button
                            type="button"
                            onClick={() => open(url())}
                            class="truncate text-left text-teal hover:text-teal-dim"
                          >
                            Product: {url()}
                          </button>
                        )}
                      </Show>
                      <Show when={urlsFor(device().ip_address)?.user_guide}>
                        {(url) => (
                          <button
                            type="button"
                            onClick={() => open(url())}
                            class="truncate text-left text-teal hover:text-teal-dim"
                          >
                            Guide: {url()}
                          </button>
                        )}
                      </Show>
                      <Show when={urlsFor(device().ip_address)?.support}>
                        {(url) => (
                          <button
                            type="button"
                            onClick={() => open(url())}
                            class="truncate text-left text-teal hover:text-teal-dim"
                          >
                            Support: {url()}
                          </button>
                        )}
                      </Show>
                      <Show
                        when={
                          !urlsFor(device().ip_address)?.loading &&
                          !urlsFor(device().ip_address)?.error &&
                          !urlsFor(device().ip_address)?.product_url &&
                          !urlsFor(device().ip_address)?.user_guide &&
                          !urlsFor(device().ip_address)?.support &&
                          urlsFor(device().ip_address) !== undefined
                        }
                      >
                        <span class="text-muted">
                          No URLs returned by device
                        </span>
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
                          <Index each={device().ports}>
                            {(p) => (
                              <tr class="border-b border-edge/40">
                                <td class="px-2 py-1 font-mono text-secondary">
                                  {p().bind_index}
                                </td>
                                <td
                                  class="px-2 py-1 text-primary"
                                  aria-busy={
                                    isFieldBusy(
                                      portFieldKey(p().bind_index, p().slot)
                                    )
                                      ? "true"
                                      : "false"
                                  }
                                >
                                  <Show
                                    when={
                                      editingPortKey() ===
                                      portFieldKey(p().bind_index, p().slot)
                                    }
                                    fallback={
                                      <button
                                        type="button"
                                        class="w-full truncate text-left text-primary hover:text-teal"
                                        title="Double-click to edit port name"
                                        onDblClick={() => {
                                          beginEdit(
                                            portFieldKey(
                                              p().bind_index,
                                              p().slot
                                            ),
                                            p().label
                                          );
                                          setEditingPortKey(
                                            portFieldKey(
                                              p().bind_index,
                                              p().slot
                                            )
                                          );
                                        }}
                                      >
                                        {p().label}
                                      </button>
                                    }
                                  >
                                    <input
                                      autofocus
                                      maxlength={17}
                                      value={editingValue()}
                                      onInput={(e) =>
                                        setEditingValue(e.currentTarget.value)
                                      }
                                      onBlur={() => setEditingPortKey(null)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape")
                                          setEditingPortKey(null);
                                        if (e.key === "Enter") {
                                          void submitPortNameEdit(
                                            p().bind_index,
                                            p().slot,
                                            p().label
                                          );
                                        }
                                      }}
                                      class="w-full rounded border border-edge-active bg-surface px-2 py-1 text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                                    />
                                  </Show>
                                  <div class="mt-0.5 flex min-h-[1rem] flex-wrap items-center gap-1.5 text-[10px] text-teal">
                                    {fieldSpinner(
                                      portFieldKey(p().bind_index, p().slot)
                                    )}
                                    <Show
                                      when={isFieldBusy(
                                        portFieldKey(p().bind_index, p().slot)
                                      )}
                                    >
                                      <span class="text-muted">Waiting…</span>
                                    </Show>
                                  </div>
                                  <Show
                                    when={
                                      pendingEdits()[
                                        portFieldKey(p().bind_index, p().slot)
                                      ]?.warning
                                    }
                                  >
                                    <div class="mt-1 text-[10px] text-amber">
                                      {
                                        pendingEdits()[
                                          portFieldKey(p().bind_index, p().slot)
                                        ]?.warning
                                      }
                                    </div>
                                  </Show>
                                  <Show
                                    when={
                                      fieldErrors()[
                                        portFieldKey(p().bind_index, p().slot)
                                      ]
                                    }
                                  >
                                    <div class="mt-1 text-[10px] text-error">
                                      {
                                        fieldErrors()[
                                          portFieldKey(p().bind_index, p().slot)
                                        ]
                                      }
                                    </div>
                                  </Show>
                                </td>
                                <td class="px-2 py-1 font-mono text-secondary">
                                  <Show
                                    when={
                                      editingPortKey() ===
                                      outFieldKey(p().bind_index, p().slot)
                                    }
                                    fallback={
                                      <button
                                        type="button"
                                        class="w-full truncate text-left font-mono text-secondary hover:text-teal"
                                        title="Double-click to edit output port address"
                                        onDblClick={() => {
                                          beginEdit(
                                            outFieldKey(
                                              p().bind_index,
                                              p().slot
                                            ),
                                            formatPortAddress(
                                              p().output_universe
                                            )
                                          );
                                          setEditingPortKey(
                                            outFieldKey(
                                              p().bind_index,
                                              p().slot
                                            )
                                          );
                                        }}
                                      >
                                        {formatPortAddress(p().output_universe)}
                                      </button>
                                    }
                                  >
                                    <input
                                      autofocus
                                      value={editingValue()}
                                      onInput={(e) =>
                                        setEditingValue(e.currentTarget.value)
                                      }
                                      onBlur={() => setEditingPortKey(null)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape")
                                          setEditingPortKey(null);
                                        if (e.key === "Enter") {
                                          void submitPortOutEdit(
                                            p().bind_index,
                                            p().slot,
                                            p().output_universe
                                          );
                                        }
                                      }}
                                      class="w-full rounded border border-edge-active bg-surface px-2 py-1 font-mono text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                                    />
                                  </Show>
                                  <div class="text-[10px] text-teal">
                                    {fieldSpinner(
                                      outFieldKey(p().bind_index, p().slot)
                                    )}
                                  </div>
                                  <Show
                                    when={
                                      pendingEdits()[
                                        outFieldKey(p().bind_index, p().slot)
                                      ]?.warning
                                    }
                                  >
                                    <div class="mt-1 text-[10px] text-amber">
                                      {
                                        pendingEdits()[
                                          outFieldKey(p().bind_index, p().slot)
                                        ]?.warning
                                      }
                                    </div>
                                  </Show>
                                  <Show
                                    when={
                                      fieldErrors()[
                                        outFieldKey(p().bind_index, p().slot)
                                      ]
                                    }
                                  >
                                    <div class="mt-1 text-[10px] text-error">
                                      {
                                        fieldErrors()[
                                          outFieldKey(p().bind_index, p().slot)
                                        ]
                                      }
                                    </div>
                                  </Show>
                                </td>
                                <td class="px-2 py-1 font-mono text-secondary">
                                  <Show
                                    when={
                                      editingPortKey() ===
                                      inFieldKey(p().bind_index, p().slot)
                                    }
                                    fallback={
                                      <button
                                        type="button"
                                        class="w-full truncate text-left font-mono text-secondary hover:text-teal"
                                        title="Double-click to edit input port address"
                                        onDblClick={() => {
                                          const inputUniverse =
                                            p().input_universe ?? null;
                                          beginEdit(
                                            inFieldKey(
                                              p().bind_index,
                                              p().slot
                                            ),
                                            inputUniverse != null
                                              ? formatPortAddress(inputUniverse)
                                              : ""
                                          );
                                          setEditingPortKey(
                                            inFieldKey(p().bind_index, p().slot)
                                          );
                                        }}
                                      >
                                        {(() => {
                                          const inputUniverse =
                                            p().input_universe ?? null;
                                          return inputUniverse != null
                                            ? formatPortAddress(inputUniverse)
                                            : "—";
                                        })()}
                                      </button>
                                    }
                                  >
                                    <input
                                      autofocus
                                      value={editingValue()}
                                      onInput={(e) =>
                                        setEditingValue(e.currentTarget.value)
                                      }
                                      onBlur={() => setEditingPortKey(null)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape")
                                          setEditingPortKey(null);
                                        if (e.key === "Enter") {
                                          void submitPortInEdit(
                                            p().bind_index,
                                            p().slot,
                                            p().input_universe,
                                            p().output_universe
                                          );
                                        }
                                      }}
                                      class="w-full rounded border border-edge-active bg-surface px-2 py-1 font-mono text-[11px] text-primary focus:border-teal/40 focus:outline-none"
                                    />
                                  </Show>
                                  <div class="text-[10px] text-teal">
                                    {fieldSpinner(
                                      inFieldKey(p().bind_index, p().slot)
                                    )}
                                  </div>
                                  <Show
                                    when={
                                      pendingEdits()[
                                        inFieldKey(p().bind_index, p().slot)
                                      ]?.warning
                                    }
                                  >
                                    <div class="mt-1 text-[10px] text-amber">
                                      {
                                        pendingEdits()[
                                          inFieldKey(p().bind_index, p().slot)
                                        ]?.warning
                                      }
                                    </div>
                                  </Show>
                                  <Show
                                    when={
                                      fieldErrors()[
                                        inFieldKey(p().bind_index, p().slot)
                                      ]
                                    }
                                  >
                                    <div class="mt-1 text-[10px] text-error">
                                      {
                                        fieldErrors()[
                                          inFieldKey(p().bind_index, p().slot)
                                        ]
                                      }
                                    </div>
                                  </Show>
                                </td>
                              </tr>
                            )}
                          </Index>
                        </tbody>
                      </table>
                    </div>
                    <Show when={device().ports.length === 0}>
                      <div class="text-[11px] text-muted">
                        No ports reported (e.g. manual entry or controller with
                        no DMX outputs).
                      </div>
                    </Show>
                  </div>
                </Show>

                <Show when={detailTab() === "diagnostics"}>
                  <div class="space-y-2 text-xs">
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <span class="text-muted">Online</span>
                      <span class="text-secondary">
                        {device().online === false ? "No" : "Yes"}
                      </span>
                      <span class="text-muted">Ports</span>
                      <span class="font-mono text-secondary">
                        {device().ports.length}
                      </span>
                    </div>
                    <div class="rounded border border-edge bg-surface p-2 text-[11px] text-muted">
                      Per-bind status flags are available in the flat
                      `get_devices` API; the product view focuses on merged
                      ports.
                    </div>
                  </div>
                </Show>

                <Show when={detailTab() === "comms"}>
                  <div class="max-h-[18rem] overflow-auto rounded border border-edge bg-surface text-xs font-mono">
                    <Show
                      when={filteredComms().length > 0}
                      fallback={
                        <div class="p-3 text-muted">
                          No diagnostic entries for this device yet.
                        </div>
                      }
                    >
                      <For each={filteredComms()}>
                        {(entry) => (
                          <div class="flex gap-2 border-b border-edge/50 px-2 py-1">
                            <span class="text-muted">
                              {new Date(entry.receivedAt).toLocaleTimeString(
                                "en-GB",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                  hour12: false,
                                }
                              )}
                            </span>
                            <span
                              class={`w-10 ${priorityColor(entry.priority)}`}
                            >
                              {priorityLabel(entry.priority)}
                            </span>
                            <span class="text-primary break-words">
                              {entry.message}
                            </span>
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
                    <div>
                      node_report: {device().node_report || "Not reported"}
                    </div>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </div>
      </div>

      {/* D2: Add device manually dialog */}
      <Show when={addDeviceOpen()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80"
          role="dialog"
          aria-label="Add device manually"
          onClick={(e) =>
            e.target === e.currentTarget && setAddDeviceOpen(false)
          }
          onKeyDown={(e) => e.key === "Escape" && setAddDeviceOpen(false)}
        >
          <div
            class="w-full max-w-sm rounded-lg border border-edge bg-surface p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="mb-3 text-sm font-medium text-primary">
              Add device manually
            </h3>
            <p class="mb-3 text-[11px] text-muted">
              Enter an IP address to add a device without discovery (e.g. static
              IP, firewall).
            </p>
            <div class="mb-4 space-y-2">
              <label class="block text-[11px] text-secondary">
                IP address <span class="text-amber">*</span>
              </label>
              <input
                type="text"
                value={addDeviceIp()}
                onInput={(e) => setAddDeviceIp(e.currentTarget.value)}
                placeholder="e.g. 192.168.1.100"
                class="w-full rounded border border-edge bg-obsidian px-2 py-1.5 text-[11px] text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
                data-testid="add-device-ip"
              />
              <label class="block text-[11px] text-secondary">
                Name (optional)
              </label>
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
