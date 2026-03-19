import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import {
  useDiagLog,
  priorityLabel,
  priorityColor,
  type DiagEntry,
} from "../hooks/useDiagLog";

interface DiagLogPanelProps {
  class?: string;
  maxHeight?: string;
}

const DiagLogPanel: Component<DiagLogPanelProps> = (props) => {
  const log = useDiagLog();

  function formatTime(nanos: number): string {
    const ms = Math.floor(nanos / 1_000_000);
    const d = new Date(ms);
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  return (
    <div
      class={`rounded-lg border border-edge bg-surface overflow-hidden ${props.class ?? ""}`}
    >
      <div class="border-b border-edge px-3 py-2">
        <h3 class="text-xs font-medium tracking-wide text-secondary uppercase">
          Diagnostics
        </h3>
      </div>
      <div
        class="overflow-y-auto font-mono text-xs"
        style={{ "max-height": props.maxHeight ?? "200px" }}
      >
        <Show
          when={log.entries.length > 0}
          fallback={
            <div class="p-4 text-muted text-center">
              No diagnostic messages yet. Enable diagnostics in ArtPoll.
            </div>
          }
        >
          <For each={log.entries}>
            {(entry: DiagEntry) => (
              <div
                class="flex gap-2 border-b border-edge/50 px-3 py-1.5 hover:bg-surface-hover/50"
                role="listitem"
              >
                <span class="shrink-0 text-muted tabular-nums">
                  {formatTime(entry.receivedAt)}
                </span>
                <span
                  class={`shrink-0 w-10 font-semibold ${priorityColor(entry.priority)}`}
                >
                  {priorityLabel(entry.priority)}
                </span>
                <span class="flex-1 text-primary break-words">
                  {entry.message}
                </span>
                <Show when={entry.sourceIp}>
                  <span class="shrink-0 text-muted">{entry.sourceIp}</span>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default DiagLogPanel;
