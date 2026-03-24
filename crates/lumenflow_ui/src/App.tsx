import type { Component } from "solid-js";
import {
  createSignal,
  createEffect,
  For,
  Show,
  onMount,
  onCleanup,
  batch,
} from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import ChannelInspector from "./components/ChannelInspector";
import UniverseMap from "./components/UniverseMap";
import DeviceList from "./components/DeviceList";
import RoutingMatrix, { type RouteInfo } from "./components/RoutingMatrix";
import HeaderBar from "./components/HeaderBar";
import StatusBar, { type ConnectionState } from "./components/StatusBar";
import SettingsPanel from "./components/SettingsPanel";
import AppErrorBoundary from "./components/ErrorBoundary";
import ToastContainer from "./components/Toast";
import NetworkDiagnostics from "./components/NetworkDiagnostics";
import SourceSyncPanel from "./components/SourceSyncPanel";
import DiagLogPanel from "./components/DiagLogPanel";
import { toast } from "./lib/toast";
import { globalHistory } from "./lib/channelHistory";
import {
  createMockUniverses,
  tickMockUniverses,
  createMockProducts,
  createMockNetworkStats,
  createEmptyNetworkStats,
  tickMockNetworkStats,
  snapshotChannels,
  GRANDMA3_MASTER_IP,
  GRANDMA3_BACKUP_IP,
  type MockUniverse,
  type NetworkStats,
} from "./lib/mockData";
import { useDmxStream, getAvailableUniverses } from "./hooks/useDmxStream";
import { useUniverseMetrics } from "./hooks/useUniverseMetrics";
import { useRouteInfo } from "./hooks/useRouteInfo";
import { useNetworkStats } from "./hooks/useNetworkStats";
import { useDevices } from "./hooks/useDevices";
import { useAppMenu } from "./hooks/useAppMenu";
import { useTheme } from "./hooks/useTheme";
import type { ArtNetProductDto } from "./components/DeviceList";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import HelpPanel from "./components/HelpPanel";
import {
  LUMENFLOW_MENU_EVENT,
  ARTNET_SPEC_URL,
  isMenuPayload,
  type HelpSection,
  type ViewId,
} from "./lib/menuEvents";

function focusHeaderSearch() {
  (document.getElementById("lf-search") as HTMLInputElement | null)?.focus();
}

async function openArtNetSpecUrl() {
  try {
    await open(ARTNET_SPEC_URL);
  } catch (e) {
    console.warn("Failed to open Art-Net specification URL:", e);
  }
}

const App: Component = () => {
  const theme = useTheme();
  useAppMenu();
  const [isMockMode, setIsMockMode] = createSignal(true);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [helpOpen, setHelpOpen] = createSignal(false);
  const [helpSection, setHelpSection] = createSignal<HelpSection>("overview");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [gridColumns, setGridColumns] = createSignal<16 | 32>(32);
  const [emitRate, setEmitRate] = createSignal(30);
  const [channelValueFormat, setChannelValueFormat] = createSignal<
    "decimal" | "hex" | "binary" | "percent"
  >("decimal", {
    equals: (a, b) => a === b,
  });
  // Persist channel value format (C1)
  createEffect(() => {
    const v = channelValueFormat();
    try {
      localStorage.setItem("lumenflow_channel_value_format", v);
    } catch {}
  });
  onMount(() => {
    try {
      const s = localStorage.getItem("lumenflow_channel_value_format");
      if (s === "hex" || s === "binary" || s === "percent" || s === "decimal")
        setChannelValueFormat(s);
    } catch {}
  });

  // D2: Manual devices (persisted); merged with get_artnet_products in DeviceList
  const MANUAL_DEVICES_KEY = "lumenflow_manual_devices";
  function loadManualDevices(): { ip: string; name?: string }[] {
    try {
      const raw = localStorage.getItem(MANUAL_DEVICES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed))
          return parsed.filter(
            (e): e is { ip: string; name?: string } =>
              !!e && typeof (e as { ip: string }).ip === "string"
          );
      }
    } catch {}
    return [];
  }
  const [manualDevices, setManualDevices] =
    createSignal<{ ip: string; name?: string }[]>(loadManualDevices());
  const persistManualDevices = (list: { ip: string; name?: string }[]) => {
    try {
      localStorage.setItem(MANUAL_DEVICES_KEY, JSON.stringify(list));
    } catch {}
  };
  const addManualDevice = (ip: string, name?: string) => {
    const trimmed = ip.trim();
    if (!trimmed) return;
    setManualDevices((prev) => {
      if (prev.some((m) => m.ip === trimmed)) return prev;
      const entry = name?.trim()
        ? { ip: trimmed, name: name.trim() }
        : { ip: trimmed };
      const next = [...prev, entry];
      persistManualDevices(next);
      return next;
    });
  };
  const removeManualDevice = (ip: string) => {
    setManualDevices((prev) => {
      const next = prev.filter((m) => m.ip !== ip);
      persistManualDevices(next);
      return next;
    });
  };

  const [availableUniverses, setAvailableUniverses] = createSignal<number[]>(
    []
  );
  const [selectedUniverse, setSelectedUniverse] = createSignal<number | null>(
    null
  );
  const [activeView, setActiveView] = createSignal<ViewId>("dashboard");
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  const [universeData, setUniverseData] = createStore<
    Record<number, Uint8Array | number[]>
  >({});

  const universeMetrics = useUniverseMetrics();
  const routeInfo = useRouteInfo();
  const [windowVisible, setWindowVisible] = createSignal(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );
  const realDevicesStore = useDevices({
    enabled: () => !isMockMode(),
    shouldPoll: () =>
      windowVisible() &&
      (activeView() === "devices" || activeView() === "routing"),
    pollMs: 2000,
    staleMs: 5000,
  });
  const [routes, setRoutes] = createSignal<RouteInfo[]>([]);
  const [mockProducts, setMockProducts] = createSignal<ArtNetProductDto[]>([]);
  const [packetRate, setPacketRate] = createSignal(0);
  const chartStats = useNetworkStats({
    isMockMode,
    routeInfo: () => Array.from(routeInfo),
    availableUniverses,
    emitRate,
    packetRate,
  });
  const [clearTrigger, setClearTrigger] = createSignal(0);
  const [lastDataTime, setLastDataTime] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const [networkStats, setNetworkStats] = createSignal<NetworkStats>(
    createEmptyNetworkStats()
  );

  const heartbeatTimer = setInterval(() => setNow(Date.now()), 1000);

  // --- Mock data engine ---
  let mockUniverses: MockUniverse[] = [];
  let mockTimer: ReturnType<typeof setInterval> | undefined;
  let mockTime = 0;
  let mockNetStats: NetworkStats = createMockNetworkStats();

  function updateMockState() {
    batch(() => {
      for (const mu of mockUniverses) {
        const snap = snapshotChannels(mu);
        const data = new Uint8Array(snap);
        setUniverseData(
          produce((state) => {
            state[mu.id] = data;
          })
        );
        globalHistory.push(mu.id, data);
      }

      setRoutes(
        mockUniverses.flatMap((mu) => [
          {
            universeId: mu.id,
            sourceIp: GRANDMA3_MASTER_IP,
            packetsPerSecond: mu.packetsPerSecond,
            lastSeen: mu.lastSeen,
          },
          {
            universeId: mu.id,
            sourceIp: GRANDMA3_BACKUP_IP,
            packetsPerSecond: mu.packetsPerSecond,
            lastSeen: mu.lastSeen,
          },
        ])
      );

      setPacketRate(
        Math.round(
          mockUniverses.reduce((sum, u) => sum + u.packetsPerSecond, 0) /
            mockUniverses.length
        )
      );

      setNetworkStats({ ...mockNetStats });
    });
  }

  function startMock() {
    mockUniverses = createMockUniverses(8);
    setMockProducts(createMockProducts());
    mockNetStats = createMockNetworkStats();
    setNetworkStats({ ...mockNetStats });

    const ids = mockUniverses.map((u) => u.id);
    setAvailableUniverses(ids);
    if (selectedUniverse() === null && ids.length > 0) {
      setSelectedUniverse(ids[0] ?? null);
    }
    toast("Mock data mode enabled", "info", 2000);

    mockTimer = setInterval(() => {
      mockTime += 16;
      tickMockUniverses(mockUniverses, mockTime);
      tickMockNetworkStats(mockNetStats, mockTime);
      updateMockState();
    }, 1000 / emitRate());
  }

  function stopMock() {
    if (mockTimer !== undefined) {
      clearInterval(mockTimer);
      mockTimer = undefined;
    }
    mockUniverses = [];
    mockTime = 0;
    setMockProducts([]);
    globalHistory.clear();
    toast("Mock data mode disabled", "info", 2000);
  }

  // --- Real backend connection ---
  const activeIds = () => {
    if (isMockMode()) {
      const sel = selectedUniverse();
      return sel !== null ? [sel] : [];
    }
    return availableUniverses();
  };

  const realData = useDmxStream(activeIds, isMockMode);
  let backendPoll: ReturnType<typeof setInterval> | undefined;

  createEffect(() => {
    if (isMockMode()) return;
    let hasData = false;
    batch(() => {
      for (const [idStr, channelData] of Object.entries(realData)) {
        if (channelData) {
          hasData = true;
          const id = Number(idStr);
          setUniverseData(
            produce((state) => {
              state[id] = channelData;
            })
          );
          globalHistory.push(id, channelData);
        }
      }
      if (hasData) setLastDataTime(Date.now());
    });
  });

  function startBackend() {
    backendPoll = setInterval(async () => {
      try {
        const universes = await getAvailableUniverses();
        setAvailableUniverses(universes);
        if (universes.length > 0) setLastDataTime(Date.now());
        if (selectedUniverse() === null && universes.length > 0) {
          setSelectedUniverse(universes[0] ?? null);
        }
      } catch {
        /* backend not ready */
      }
    }, 1000);
  }

  function stopBackend() {
    if (backendPoll !== undefined) {
      clearInterval(backendPoll);
      backendPoll = undefined;
    }
  }

  // --- Mode switching ---
  createEffect(() => {
    if (isMockMode()) {
      stopBackend();
      startMock();
    } else {
      stopMock();
      setUniverseData(reconcile({}));
      globalHistory.clear();
      setNetworkStats(createEmptyNetworkStats());
      startBackend();
    }
  });

  onMount(() => {
    let unlisten: (() => void) | null = null;
    listen(LUMENFLOW_MENU_EVENT, (ev) => {
      if (!isMenuPayload(ev.payload)) return;
      const p = ev.payload;
      switch (p.kind) {
        case "view":
          setActiveView(p.view);
          break;
        case "settings":
          setSettingsOpen(true);
          break;
        case "focus-search":
          focusHeaderSearch();
          break;
        case "help":
          batch(() => {
            setHelpSection(p.section);
            setHelpOpen(true);
          });
          break;
        case "open-artnet-spec":
          void openArtNetSpecUrl();
          break;
      }
    }).then((fn) => {
      unlisten = fn;
    });
    onCleanup(() => {
      unlisten?.();
    });
  });

  onMount(() => {
    const onVisibility = () =>
      setWindowVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    onCleanup(() => document.removeEventListener("visibilitychange", onVisibility));
  });

  onCleanup(() => {
    stopMock();
    stopBackend();
    clearInterval(heartbeatTimer);
  });

  createEffect(() => {
    const rate = emitRate();
    if (isMockMode() && mockTimer !== undefined) {
      clearInterval(mockTimer);
      mockTimer = setInterval(() => {
        mockTime += 16;
        tickMockUniverses(mockUniverses, mockTime);
        tickMockNetworkStats(mockNetStats, mockTime);
        updateMockState();
      }, 1000 / rate);
    }
  });

  const connectionState = (): ConnectionState => {
    if (isMockMode()) {
      return availableUniverses().length > 0 ? "connected" : "connecting";
    }
    const last = lastDataTime();
    if (last === 0) return "connecting";
    if (now() - last > 5000) return "disconnected";
    return "connected";
  };

  const isConnected = () => connectionState() === "connected";

  const systemStatus = (): "ok" | "warning" | "error" => {
    if (connectionState() === "disconnected") return "error";
    const stats = networkStats();
    if (stats.flickerChannels.length > 4) return "warning";
    const lastJitter = stats.jitterSamples[stats.jitterSamples.length - 1] ?? 0;
    if (lastJitter > 30) return "warning";
    return "ok";
  };

  const systemStatusTooltip = (): string => {
    const status = systemStatus();
    const connection = connectionState();
    const stats = networkStats();
    const flickerCount = stats.flickerChannels.length;
    const lastJitter = stats.jitterSamples[stats.jitterSamples.length - 1] ?? 0;

    if (status === "error") {
      return [
        "System status: ERROR",
        "",
        "Reason:",
        "- No Art-Net data has been received for more than 5 seconds.",
        "- Source may be offline, or the network path is interrupted.",
        "",
        "Warning criteria:",
        "- Flickering channels > 4",
        "- Last jitter sample > 30 ms",
      ].join("\n");
    }

    if (status === "warning") {
      const reasons: string[] = [];
      if (flickerCount > 4) reasons.push(`- Flickering channels: ${flickerCount} (> 4)`);
      if (lastJitter > 30)
        reasons.push(`- Last inter-packet jitter: ${lastJitter.toFixed(1)} ms (> 30 ms)`);

      return [
        "System status: WARNING",
        "",
        "Triggered by:",
        ...reasons,
        "",
        "OK criteria:",
        "- Connection is active",
        "- Flickering channels <= 4",
        "- Last jitter sample <= 30 ms",
      ].join("\n");
    }

    return [
      "System status: OK",
      "",
      "No warning/error condition is active:",
      `- Connection state: ${connection === "connected" ? "active" : "initializing (not disconnected)"}`,
      `- Flickering channels: ${flickerCount} (<= 4)`,
      `- Last inter-packet jitter: ${lastJitter.toFixed(1)} ms (<= 30 ms)`,
    ].join("\n");
  };

  const showSidebar = () =>
    sidebarOpen() &&
    (activeView() === "dashboard" || activeView() === "inspector");

  // --- Keyboard shortcuts ---
  createEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        (
          document.getElementById("lf-search") as HTMLInputElement | null
        )?.focus();
        return;
      }

      if (isInput) return;

      switch (e.key) {
        case "1":
          setActiveView("dashboard");
          break;
        case "2":
          setActiveView("inspector");
          break;
        case "3":
          setActiveView("routing");
          break;
        case "4":
          setActiveView("devices");
          break;
        case "Escape":
          setSettingsOpen(false);
          setHelpOpen(false);
          setClearTrigger((c) => c + 1);
          break;
      }
    };

    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });

  return (
    <div class="flex h-screen w-screen flex-col bg-obsidian text-primary">
      {/* Header */}
      <HeaderBar
        isConnected={isConnected}
        activeUniverseCount={() => availableUniverses().length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSettingsClick={() => setSettingsOpen(true)}
        activeView={activeView}
        onViewChange={(v) => setActiveView(v as ViewId)}
        systemStatus={systemStatus}
        systemStatusTooltip={systemStatusTooltip}
      />

      {/* Body */}
      <div class="flex flex-1 overflow-hidden">
        {/* Collapsible sidebar — only on Dashboard & Inspector */}
        <Show when={showSidebar()}>
          <aside
            data-testid="sidebar"
            class="flex w-44 flex-shrink-0 flex-col border-r border-edge bg-surface"
          >
            <div class="flex items-center justify-between px-3 pt-3 pb-1">
              <h3 class="text-[10px] font-medium uppercase tracking-widest text-muted">
                Universes
              </h3>
              <button
                onClick={() => setSidebarOpen(false)}
                class="rounded p-0.5 text-muted hover:text-secondary hover:bg-surface-hover transition-colors"
                title="Collapse sidebar"
              >
                <svg
                  class="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            <div class="flex-1 overflow-auto px-3 pb-3">
              <Show
                when={availableUniverses().length > 0}
                fallback={
                  <div class="py-6 text-center text-xs text-muted">
                    <div class="mb-1 text-sm">Waiting...</div>
                    <p class="text-[10px]">Send Art-Net to :6454</p>
                  </div>
                }
              >
                <div class="flex flex-col gap-0.5">
                  <For each={availableUniverses()}>
                    {(uni) => {
                      const activity = () => {
                        const ch = universeData[uni];
                        if (!ch) return 0;
                        let sum = 0;
                        for (let i = 0; i < ch.length; i++) sum += ch[i] ?? 0;
                        return sum / (ch.length * 255);
                      };

                      const m = () =>
                        !isMockMode()
                          ? universeMetrics.metrics[uni]
                          : undefined;
                      const staleness = () => m()?.staleness ?? 0;
                      const sourceCount = () => m()?.sourceCount ?? 0;
                      const seqErrors = () => m()?.sequenceErrors ?? 0;

                      return (
                        <button
                          data-testid={`universe-${uni}`}
                          onClick={() => {
                            setSelectedUniverse(uni);
                            if (activeView() === "dashboard") {
                              /* stay on dashboard */
                            } else {
                              setActiveView("inspector");
                            }
                          }}
                          class="group flex items-center justify-between gap-1 rounded-md px-2 py-1 text-left text-xs transition-all duration-100"
                          classList={{
                            "bg-teal/10 text-teal border border-teal/20":
                              selectedUniverse() === uni,
                            "text-secondary hover:bg-surface-hover hover:text-primary border border-transparent":
                              selectedUniverse() !== uni,
                          }}
                        >
                          <span class="font-mono tabular-nums truncate">
                            Uni {uni}
                          </span>
                          <div class="flex items-center gap-1 flex-shrink-0">
                            <Show when={!isMockMode() && sourceCount() >= 2}>
                              <span
                                class="rounded px-1 text-[9px] font-medium bg-amber/20 text-amber"
                                title="Merge: 2 sources"
                              >
                                2 SRC
                              </span>
                            </Show>
                            <Show when={!isMockMode() && seqErrors() > 0}>
                              <span
                                class="rounded px-1 text-[9px] font-medium bg-red-500/20 text-red-400"
                                title={`${seqErrors()} sequence errors`}
                              >
                                {seqErrors()}
                              </span>
                            </Show>
                            <Show
                              when={
                                !isMockMode() &&
                                (staleness() === 1 || staleness() === 2)
                              }
                            >
                              <span
                                class="h-1.5 w-1.5 rounded-full"
                                classList={{
                                  "bg-amber": staleness() === 1,
                                  "bg-red-500": staleness() === 2,
                                }}
                                title={
                                  staleness() === 1 ? "Stale" : "Disconnected"
                                }
                              />
                            </Show>
                            <Show when={isMockMode() && activity() > 0}>
                              <span
                                class="h-1.5 w-1.5 rounded-full"
                                classList={{
                                  "bg-teal": activity() > 0.3,
                                  "bg-teal/50":
                                    activity() > 0 && activity() <= 0.3,
                                }}
                              />
                            </Show>
                            <Show
                              when={
                                !isMockMode() &&
                                activity() > 0 &&
                                staleness() === 0
                              }
                            >
                              <span
                                class="h-1.5 w-1.5 rounded-full"
                                classList={{
                                  "bg-teal": activity() > 0.3,
                                  "bg-teal/50":
                                    activity() > 0 && activity() <= 0.3,
                                }}
                              />
                            </Show>
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </aside>
        </Show>

        {/* Sidebar reopen button when collapsed */}
        <Show
          when={
            !sidebarOpen() &&
            (activeView() === "dashboard" || activeView() === "inspector")
          }
        >
          <button
            onClick={() => setSidebarOpen(true)}
            class="flex-shrink-0 border-r border-edge bg-surface px-1.5 py-2 text-muted hover:text-secondary hover:bg-surface-hover transition-colors"
            title="Expand sidebar"
          >
            <svg
              class="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </Show>

        {/* Main content */}
        <main class="flex-1 overflow-auto">
          <AppErrorBoundary>
            {/* Dashboard View */}
            <Show when={activeView() === "dashboard"}>
              <div class="flex h-full flex-col" data-testid="dashboard-view">
                {/* Top row: Heatmap + Channel grid */}
                <div
                  class="flex flex-1 min-h-0"
                  style={{ "flex-basis": "65%" }}
                >
                  {/* Universe Heatmap */}
                  <div class="w-2/5 flex-shrink-0 overflow-auto border-r border-edge p-4">
                    <Show when={availableUniverses().length > 0}>
                      <UniverseMap
                        universes={availableUniverses}
                        selectedUniverse={selectedUniverse}
                        onSelect={(id) => setSelectedUniverse(id)}
                        universeData={universeData}
                        resolvedTheme={theme.effective}
                        warningUniverses={() =>
                          !isMockMode()
                            ? Object.entries(universeMetrics.metrics)
                                .filter(
                                  ([_, m]) =>
                                    m.staleness === 1 || m.staleness === 2
                                )
                                .map(([id]) => Number(id))
                            : []
                        }
                      />
                    </Show>
                  </div>

                  {/* Channel grid preview */}
                  <div class="flex-1 overflow-auto p-4">
                    <Show
                      when={selectedUniverse() !== null}
                      fallback={
                        <div class="flex h-full flex-col items-center justify-center text-center">
                          <h2 class="text-lg font-semibold text-primary mb-2">
                            LumenFlow
                          </h2>
                          <p class="text-xs text-secondary max-w-sm mb-4">
                            Select a universe from the heatmap or sidebar to
                            preview channel data.
                          </p>
                          <div class="rounded-lg border border-edge bg-surface p-4">
                            <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-left text-xs">
                              <span class="text-muted">Protocol</span>
                              <span class="font-mono text-secondary">
                                Art-Net 4
                              </span>
                              <span class="text-muted">Port</span>
                              <span class="font-mono text-secondary">
                                UDP 6454
                              </span>
                              <span class="text-muted">Universes</span>
                              <span class="font-mono text-secondary">
                                0 — 32,767
                              </span>
                              <span class="text-muted">Channels</span>
                              <span class="font-mono text-secondary">
                                512 / uni
                              </span>
                            </div>
                          </div>
                        </div>
                      }
                    >
                      <ChannelInspector
                        universeId={selectedUniverse()!}
                        channels={() => universeData[selectedUniverse()!]}
                        clearTrigger={clearTrigger}
                        channelValueFormat={channelValueFormat}
                        dataOrigin={() => {
                          if (isMockMode())
                            return { sourceIp: GRANDMA3_MASTER_IP };
                          const r = Array.from(routeInfo).find(
                            (x) => x.universeId === selectedUniverse()!
                          );
                          return r ? { sourceIp: r.sourceIp } : undefined;
                        }}
                        hasNzs={() =>
                          !isMockMode()
                            ? (universeMetrics.metrics[selectedUniverse()!]
                                ?.hasNzs ?? false)
                            : false
                        }
                      />
                    </Show>
                  </div>
                </div>

                {/* Bottom row: Network diagnostics */}
                <div
                  class="flex-shrink-0 border-t border-edge p-4"
                  style={{ "flex-basis": "35%", "min-height": "200px" }}
                >
                  <NetworkDiagnostics
                    jitterSamples={() => chartStats().jitterSamples}
                    networkLoadMbps={() => chartStats().networkLoadMbps}
                    resolvedTheme={theme.effective}
                  />
                </div>
              </div>
            </Show>

            {/* Inspector View */}
            <Show when={activeView() === "inspector"}>
              <div
                class="flex h-full flex-col p-5"
                data-testid="inspector-view"
              >
                <Show when={availableUniverses().length > 0}>
                  <div class="mb-4">
                    <UniverseMap
                      universes={availableUniverses}
                      selectedUniverse={selectedUniverse}
                      onSelect={(id) => setSelectedUniverse(id)}
                      universeData={universeData}
                      resolvedTheme={theme.effective}
                      warningUniverses={() =>
                        !isMockMode()
                          ? Object.entries(universeMetrics.metrics)
                              .filter(
                                ([_, m]) =>
                                  m.staleness === 1 || m.staleness === 2
                              )
                              .map(([id]) => Number(id))
                          : []
                      }
                    />
                  </div>
                </Show>

                <Show
                  when={selectedUniverse() !== null}
                  fallback={
                    <div class="flex h-[60vh] flex-col items-center justify-center text-center">
                      <h2 class="text-xl font-semibold text-primary mb-2">
                        Channel Inspector
                      </h2>
                      <p class="text-sm text-secondary max-w-md">
                        Select a universe to inspect its 512 DMX channels.
                      </p>
                    </div>
                  }
                >
                  <div class="flex flex-1 gap-4 min-h-0">
                    <div class="flex-1 overflow-auto">
                      <ChannelInspector
                        universeId={selectedUniverse()!}
                        channels={() => universeData[selectedUniverse()!]}
                        clearTrigger={clearTrigger}
                        channelValueFormat={channelValueFormat}
                        dataOrigin={() => {
                          if (isMockMode())
                            return { sourceIp: GRANDMA3_MASTER_IP };
                          const r = Array.from(routeInfo).find(
                            (x) => x.universeId === selectedUniverse()!
                          );
                          return r ? { sourceIp: r.sourceIp } : undefined;
                        }}
                        hasNzs={() =>
                          !isMockMode()
                            ? (universeMetrics.metrics[selectedUniverse()!]
                                ?.hasNzs ?? false)
                            : false
                        }
                      />
                    </div>
                    <div class="w-64 flex-shrink-0 overflow-auto flex flex-col gap-4">
                      <SourceSyncPanel
                        sourceIps={() => {
                          if (isMockMode()) return networkStats().sourceIps;
                          const ips = new Map<
                            string,
                            "master" | "backup" | "secondary"
                          >();
                          const syncIp =
                            universeMetrics.syncSourceIp !== 0
                              ? `${(universeMetrics.syncSourceIp >>> 24) & 0xff}.${(universeMetrics.syncSourceIp >>> 16) & 0xff}.${(universeMetrics.syncSourceIp >>> 8) & 0xff}.${universeMetrics.syncSourceIp & 0xff}`
                              : null;
                          for (const r of Array.from(routeInfo)) {
                            if (!ips.has(r.sourceIp)) {
                              ips.set(
                                r.sourceIp,
                                syncIp === r.sourceIp ? "master" : "secondary"
                              );
                            }
                          }
                          return [...ips.entries()].map(([ip, role]) => ({
                            ip,
                            role,
                          }));
                        }}
                        artSyncActive={() =>
                          isMockMode()
                            ? networkStats().artSyncActive
                            : universeMetrics.syncActive
                        }
                      />
                      <Show when={!isMockMode()}>
                        <DiagLogPanel maxHeight="180px" />
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Routing View */}
            <Show when={activeView() === "routing"}>
              <div class="p-5" data-testid="routing-view">
                <RoutingMatrix
                  universes={availableUniverses}
                  routes={() =>
                    isMockMode() ? routes() : Array.from(routeInfo)
                  }
                  products={() =>
                    isMockMode() ? mockProducts() : realDevicesStore.products()
                  }
                />
              </div>
            </Show>

            {/* Devices View */}
            <Show when={activeView() === "devices"}>
              <div class="p-5" data-testid="devices-view">
                <DeviceList
                  mockProducts={isMockMode() ? mockProducts() : undefined}
                  {...(!isMockMode() && {
                    products: realDevicesStore.products,
                    manualDevices: manualDevices(),
                    onAddManualDevice: addManualDevice,
                    onRemoveManualDevice: removeManualDevice,
                  })}
                />
              </div>
            </Show>
          </AppErrorBoundary>
        </main>
      </div>

      {/* Status Bar */}
      <StatusBar
        connectionState={connectionState}
        packetRate={() => {
          if (isMockMode()) return packetRate();
          const byUni = new Map<number, number>();
          for (const r of Array.from(routeInfo)) {
            if (!byUni.has(r.universeId))
              byUni.set(r.universeId, r.packetsPerSecond);
          }
          return [...byUni.values()].reduce((a, b) => a + b, 0);
        }}
        activeUniverseCount={() => (selectedUniverse() !== null ? 1 : 0)}
        totalUniverseCount={() => availableUniverses().length}
        selectedUniverse={selectedUniverse}
        isMockMode={isMockMode}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isMockMode={isMockMode}
        onToggleMockMode={(enabled) => setIsMockMode(enabled)}
        gridColumns={gridColumns}
        onGridColumnsChange={setGridColumns}
        emitRate={emitRate}
        onEmitRateChange={setEmitRate}
        channelValueFormat={channelValueFormat}
        onChannelValueFormatChange={setChannelValueFormat}
      />

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Help panel (native Help menu) */}
      <Show when={helpOpen()}>
        <HelpPanel
          section={helpSection}
          onClose={() => setHelpOpen(false)}
        />
      </Show>
    </div>
  );
};

export default App;
