import type { Component } from "solid-js";
import { Show } from "solid-js";
import { useNetworkSettings } from "../hooks/useNetworkSettings";
import NetworkSection from "./NetworkSection";

export type ChannelValueFormat = "decimal" | "hex" | "binary" | "percent";

interface SettingsPanelProps {
  isOpen: () => boolean;
  onClose: () => void;
  isMockMode: () => boolean;
  onToggleMockMode: (enabled: boolean) => void;
  gridColumns: () => 16 | 32;
  onGridColumnsChange: (cols: 16 | 32) => void;
  emitRate: () => number;
  onEmitRateChange: (rate: number) => void;
  channelValueFormat?: () => ChannelValueFormat;
  onChannelValueFormatChange?: (format: ChannelValueFormat) => void;
}

const SettingsPanel: Component<SettingsPanelProps> = (props) => {
  const network = useNetworkSettings(props.isOpen);

  return (
    <Show when={props.isOpen()}>
      <div
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={props.onClose}
      />
      <div class="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-edge bg-surface shadow-2xl">
        <div class="flex items-center justify-between border-b border-edge p-4">
          <h2 class="text-sm font-medium text-primary">Settings</h2>
          <button
            onClick={props.onClose}
            class="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-secondary transition-colors"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="flex-1 overflow-auto p-4">
          <div class="flex flex-col gap-6">
            {/* Development */}
            <section>
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                Development
              </h3>
              <label class="flex items-center justify-between rounded-md border border-edge bg-obsidian p-3">
                <div>
                  <div class="text-sm text-primary">Mock Data Mode</div>
                  <div class="text-[11px] text-muted">
                    Simulate Art-Net data for UI development
                  </div>
                </div>
                <button
                  onClick={() => props.onToggleMockMode(!props.isMockMode())}
                  class="relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200"
                  classList={{
                    "bg-teal": props.isMockMode(),
                    "bg-edge-active": !props.isMockMode(),
                  }}
                  aria-checked={props.isMockMode()}
                >
                  <span
                    class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                    classList={{
                      "translate-x-0": props.isMockMode(),
                      "-translate-x-4": !props.isMockMode(),
                    }}
                  />
                </button>
              </label>
            </section>

            {/* Display */}
            <section>
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                Display
              </h3>
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between rounded-md border border-edge bg-obsidian p-3">
                  <div class="text-sm text-primary">Grid Columns</div>
                  <div class="flex items-center gap-1 rounded border border-edge bg-surface">
                    <button
                      onClick={() => props.onGridColumnsChange(16)}
                      class="rounded-l px-2 py-0.5 text-[11px] font-mono transition-colors"
                      classList={{
                        "bg-teal/10 text-teal": props.gridColumns() === 16,
                        "text-muted hover:text-secondary":
                          props.gridColumns() !== 16,
                      }}
                    >
                      16
                    </button>
                    <button
                      onClick={() => props.onGridColumnsChange(32)}
                      class="rounded-r px-2 py-0.5 text-[11px] font-mono transition-colors"
                      classList={{
                        "bg-teal/10 text-teal": props.gridColumns() === 32,
                        "text-muted hover:text-secondary":
                          props.gridColumns() !== 32,
                      }}
                    >
                      32
                    </button>
                  </div>
                </div>

                <div class="flex items-center justify-between rounded-md border border-edge bg-obsidian p-3">
                  <div>
                    <div class="text-sm text-primary">Emit Rate</div>
                    <div class="text-[11px] text-muted">
                      IPC update frequency
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="5"
                      value={props.emitRate()}
                      onInput={(e) =>
                        props.onEmitRateChange(parseInt(e.currentTarget.value))
                      }
                      class="h-1 w-20 appearance-none rounded bg-edge accent-teal"
                    />
                    <span class="w-10 text-right font-mono text-[11px] tabular-nums text-secondary">
                      {props.emitRate()} Hz
                    </span>
                  </div>
                </div>

                <Show
                  when={
                    props.channelValueFormat && props.onChannelValueFormatChange
                  }
                >
                  <div class="flex items-center justify-between rounded-md border border-edge bg-obsidian p-3">
                    <div>
                      <div class="text-sm text-primary">
                        Channel value format
                      </div>
                      <div class="text-[11px] text-muted">
                        How values appear in channel detail
                      </div>
                    </div>
                    <div class="flex flex-wrap gap-1 rounded border border-edge bg-surface p-0.5">
                      {(["decimal", "hex", "binary", "percent"] as const).map(
                        (fmt) => (
                          <button
                            type="button"
                            onClick={() =>
                              props.onChannelValueFormatChange?.(fmt)
                            }
                            class="rounded px-2 py-0.5 text-[11px] font-mono transition-colors"
                            classList={{
                              "bg-teal/10 text-teal":
                                props.channelValueFormat?.() === fmt,
                              "text-muted hover:text-secondary":
                                props.channelValueFormat?.() !== fmt,
                            }}
                          >
                            {fmt === "decimal"
                              ? "Dec"
                              : fmt === "binary"
                                ? "Bin"
                                : fmt === "percent"
                                  ? "%"
                                  : "Hex"}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </Show>
              </div>
            </section>

            {/* Network */}
            <NetworkSection
              interfaces={network.interfaces}
              settings={network.settings}
              onApply={network.applySettings}
              onApplyImmediate={network.applySettingsImmediate}
            />

            {/* About */}
            <section>
              <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
                About
              </h3>
              <div class="rounded-md border border-edge bg-obsidian p-3 text-xs text-muted">
                <div class="mb-1 text-sm text-primary">LumenFlow</div>
                <div>Professional Art-Net 4 Monitoring & Control</div>
                <div class="mt-2 font-mono text-[10px]">
                  v0.2.0-alpha &middot; Tauri 2 + SolidJS + Rust
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default SettingsPanel;
