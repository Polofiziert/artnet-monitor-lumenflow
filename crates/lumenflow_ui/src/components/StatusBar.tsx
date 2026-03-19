import type { Component } from "solid-js";
import { Show } from "solid-js";

export type ConnectionState = "connecting" | "connected" | "disconnected";

interface StatusBarProps {
  connectionState: () => ConnectionState;
  packetRate: () => number;
  activeUniverseCount: () => number;
  totalUniverseCount: () => number;
  selectedUniverse: () => number | null;
  isMockMode: () => boolean;
}

const statusConfig: Record<
  ConnectionState,
  { dot: string; text: string; label: string }
> = {
  connected: { dot: "bg-teal", text: "text-secondary", label: "UDP :6454" },
  connecting: {
    dot: "bg-amber animate-pulse",
    text: "text-muted",
    label: "Connecting...",
  },
  disconnected: { dot: "bg-error", text: "text-muted", label: "Disconnected" },
};

const StatusBar: Component<StatusBarProps> = (props) => {
  const status = () => statusConfig[props.connectionState()];

  return (
    <footer
      data-testid="status-bar"
      class="flex h-6 items-center justify-between border-t border-edge bg-surface px-3 text-[11px] select-none"
    >
      <div class="flex items-center gap-4">
        <span
          class={`flex items-center gap-1.5 ${status().text}`}
          title="Art-Net UDP listener status on port 6454"
        >
          <span class={`h-1.5 w-1.5 rounded-full ${status().dot}`} />
          {status().label}
        </span>

        <span
          class="text-muted"
          title="Total universes with data in the current session"
        >
          {props.totalUniverseCount()} universe
          {props.totalUniverseCount() !== 1 ? "s" : ""}
        </span>

        <Show when={props.packetRate() > 0}>
          <span class="font-mono tabular-nums text-secondary">
            {props.packetRate()} pkt/s
          </span>
        </Show>
      </div>

      <div class="flex items-center gap-4">
        <Show when={props.selectedUniverse() !== null}>
          <span class="font-mono tabular-nums text-secondary">
            Uni {props.selectedUniverse()}
          </span>
        </Show>

        <Show when={props.isMockMode()}>
          <span
            data-testid="mock-mode-badge"
            class="rounded bg-amber/10 px-1.5 py-0.5 text-[10px] font-medium text-amber"
          >
            MOCK
          </span>
        </Show>
      </div>
    </footer>
  );
};

export default StatusBar;
