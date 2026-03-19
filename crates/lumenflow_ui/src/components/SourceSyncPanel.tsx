import type { Component } from "solid-js";
import { For } from "solid-js";

interface SourceSyncPanelProps {
  sourceIps: () => { ip: string; role: "master" | "backup" | "secondary" }[];
  artSyncActive: () => boolean;
}

const ROLE_CONFIG: Record<string, { dot: string; label: string }> = {
  master: { dot: "bg-teal", label: "Master" },
  backup: { dot: "bg-amber", label: "Backup (Standby)" },
  secondary: { dot: "bg-muted", label: "Secondary" },
};

const SourceSyncPanel: Component<SourceSyncPanelProps> = (props) => {
  return (
    <div class="rounded-lg border border-edge bg-surface p-3">
      <h3 class="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">
        Source IPs
      </h3>
      <div class="flex flex-col gap-1.5">
        <For each={props.sourceIps()}>
          {(source) => {
            const cfg = ROLE_CONFIG[source.role] ?? ROLE_CONFIG["secondary"]!;
            return (
              <div class="flex items-center gap-2">
                <span
                  class="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  classList={{
                    "bg-teal": source.role === "master",
                    "bg-amber": source.role === "backup",
                    "bg-muted": source.role === "secondary",
                  }}
                />
                <span class="font-mono text-xs tabular-nums text-secondary">
                  {source.ip}
                </span>
                <span class="ml-auto text-[10px] text-muted">{cfg.label}</span>
              </div>
            );
          }}
        </For>
      </div>

      <div class="mt-3 flex items-center gap-2 border-t border-edge pt-2">
        <span
          class="h-2 w-2 rounded-full transition-colors"
          classList={{
            "bg-green-400 animate-pulse shadow-[0_0_6px_#4ade80]":
              props.artSyncActive(),
            "bg-muted": !props.artSyncActive(),
          }}
        />
        <span class="text-xs text-secondary">
          ArtSync:{" "}
          <span
            class="font-mono"
            classList={{
              "text-green-400 font-medium": props.artSyncActive(),
              "text-muted": !props.artSyncActive(),
            }}
          >
            {props.artSyncActive() ? "ACTIVE" : "INACTIVE"}
          </span>
        </span>
      </div>
    </div>
  );
};

export default SourceSyncPanel;
