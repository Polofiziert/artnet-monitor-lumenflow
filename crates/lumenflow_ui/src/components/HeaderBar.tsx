import type { Component } from "solid-js";
import { createSignal, onCleanup, For, Show } from "solid-js";
import TimeCodeClock from "./TimeCodeClock";
import { useTimeSync } from "../hooks/useTimeSync";
import type { ViewId } from "../lib/menuEvents";

interface HeaderBarProps {
  isConnected: () => boolean;
  activeUniverseCount: () => number;
  searchQuery: () => string;
  onSearchChange: (query: string) => void;
  onSettingsClick: () => void;
  activeView: () => string;
  onViewChange: (view: string) => void;
  systemStatus: () => "ok" | "warning" | "error";
}

const tabs: { id: ViewId; label: string; shortcut: string }[] = [
  { id: "dashboard", label: "Dashboard", shortcut: "1" },
  { id: "inspector", label: "Inspector", shortcut: "2" },
  { id: "routing", label: "Routing Matrix", shortcut: "3" },
  { id: "devices", label: "Devices", shortcut: "4" },
];

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const HeaderBar: Component<HeaderBarProps> = (props) => {
  const [clock, setClock] = createSignal(formatTime(new Date()));
  const clockTimer = setInterval(() => setClock(formatTime(new Date())), 1000);
  onCleanup(() => clearInterval(clockTimer));

  const isTimeSynced = useTimeSync();

  const statusLabel = () => {
    const s = props.systemStatus();
    if (s === "ok") return "SYSTEM OK";
    if (s === "warning") return "WARNING";
    return "ERROR";
  };

  const statusColor = () => {
    const s = props.systemStatus();
    if (s === "ok") return "text-teal";
    if (s === "warning") return "text-amber";
    return "text-error";
  };

  return (
    <header
      data-testid="header-bar"
      class="flex h-11 items-center justify-between border-b border-edge bg-surface px-4 select-none"
      data-tauri-drag-region
    >
      {/* Left: Logo + version */}
      <div class="flex items-center gap-3 min-w-[160px]" data-tauri-drag-region>
        <div class="flex items-center gap-2">
          <div class="h-4 w-4 rounded-sm bg-teal/20 flex items-center justify-center">
            <div class="h-2 w-2 rounded-full bg-teal" />
          </div>
          <span class="text-sm font-semibold tracking-tight text-primary">
            LumenFlow
          </span>
          <span class="rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-mono text-teal">
            v0.2
          </span>
        </div>
      </div>

      {/* Center: Tab navigation */}
      <nav class="flex items-center gap-1" data-testid="header-tabs">
        <For each={tabs}>
          {(tab) => (
            <button
              data-testid={`tab-${tab.id}`}
              onClick={() => props.onViewChange(tab.id)}
              class="rounded-full px-3 py-1 text-xs font-medium transition-all duration-150"
              classList={{
                "bg-teal/10 text-teal": props.activeView() === tab.id,
                "text-muted hover:text-secondary":
                  props.activeView() !== tab.id,
              }}
              title={`${tab.label} (${tab.shortcut})`}
            >
              {tab.label}
            </button>
          )}
        </For>
      </nav>

      {/* Right: Search + status + clock + settings */}
      <div class="flex items-center gap-2 min-w-[160px] justify-end">
        <div class="relative">
          <input
            id="lf-search"
            data-testid="search-input"
            type="text"
            placeholder="Search... ⌘K"
            value={props.searchQuery()}
            onInput={(e) => props.onSearchChange(e.currentTarget.value)}
            class="h-7 w-44 rounded-md border border-edge bg-obsidian px-3 pl-7 text-xs text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20 transition-colors"
          />
          <svg
            class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        <div class="mx-1 h-4 w-px bg-edge" />

        {/* Connection indicator */}
        <div class="flex items-center gap-1.5 text-xs">
          <Show
            when={props.isConnected()}
            fallback={
              <span class="flex items-center gap-1.5 text-muted">
                <span class="h-1.5 w-1.5 rounded-full bg-muted" />
                Offline
              </span>
            }
          >
            <span class="flex items-center gap-1.5 text-teal-dim">
              <span class="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
              {props.activeUniverseCount()} uni
            </span>
          </Show>
        </div>

        <TimeCodeClock />

        <div class="mx-1 h-4 w-px bg-edge" />

        {/* System status badge — fixed width to prevent layout shift (B3) */}
        <span
          class={`inline-block min-w-[5.5rem] max-w-[5.5rem] truncate text-right text-[10px] font-mono font-medium tracking-wide ${statusColor()}`}
          data-testid="system-status"
          title={statusLabel()}
        >
          {statusLabel()}
        </span>

        {/* Clock + TimeSync indicator */}
        <div class="flex items-center gap-1.5">
          <span
            class="font-mono text-[11px] tabular-nums text-muted"
            data-testid="header-clock"
          >
            {clock()}
          </span>
          <Show when={isTimeSynced()}>
            <span
              class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-teal bg-teal/10 transition-opacity duration-300"
              title="ArtTimeSync received — clock sync signal active"
              data-testid="time-sync-badge"
            >
              <span class="h-1 w-1 rounded-full bg-teal" />
              SYNC
            </span>
          </Show>
        </div>

        {/* Settings */}
        <button
          data-testid="settings-button"
          onClick={props.onSettingsClick}
          class="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-secondary transition-colors"
          title="Settings"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a7.723 7.723 0 0 1 0 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default HeaderBar;
