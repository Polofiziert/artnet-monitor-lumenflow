import type { Component } from "solid-js";
import { Show, createSignal } from "solid-js";
import type {
  NetworkInterfaceDto,
  NetworkSettingsDto,
} from "../hooks/useNetworkSettings";

interface NetworkSectionProps {
  interfaces: () => NetworkInterfaceDto[];
  settings: () => NetworkSettingsDto | undefined;
  onApply: (updates: Partial<NetworkSettingsDto>) => void;
  onApplyImmediate: (updates: Partial<NetworkSettingsDto>) => void;
}

const NetworkSection: Component<NetworkSectionProps> = (props) => {
  const [advancedOpen, setAdvancedOpen] = createSignal(false);

  const settings = () => props.settings();
  const interfaces = () => props.interfaces();

  const isAllInterfaces = () =>
    settings()?.interface_mode === "auto" &&
    (settings()?.preferred_ip_cidr === "0.0.0.0/0" ||
      !settings()?.preferred_ip_cidr);

  const isSelected = (iface: NetworkInterfaceDto) => {
    const s = settings();
    if (!s) return false;
    if (s.interface_mode === "manual" && s.primary_nic) {
      return s.primary_nic === iface.name || s.primary_nic === iface.ip;
    }
    if (s.interface_mode === "auto" && s.preferred_ip_cidr) {
      const cidr = s.preferred_ip_cidr;
      if (cidr === "0.0.0.0/0") return false;
      return false;
    }
    return false;
  };

  const selectAllInterfaces = () => {
    props.onApplyImmediate({
      interface_mode: "auto",
      preferred_ip_cidr: "0.0.0.0/0",
      primary_nic: null,
    });
  };

  const selectInterface = (iface: NetworkInterfaceDto) => {
    props.onApplyImmediate({
      interface_mode: "manual",
      primary_nic: iface.name,
      preferred_ip_cidr: "0.0.0.0/0",
    });
  };

  const customTargetsText = () =>
    settings()?.custom_broadcast_targets?.join("\n") ?? "";
  const unicastTargetsText = () =>
    settings()?.unicast_targets?.join(", ") ?? "";

  const setCustomTargets = (text: string) => {
    const addrs = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    props.onApply({ custom_broadcast_targets: addrs });
  };

  const setUnicastTargets = (text: string) => {
    const addrs = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    props.onApply({ unicast_targets: addrs });
  };

  const statusLine = () => {
    const s = settings();
    if (!s) return "Loading…";
    if (isAllInterfaces()) {
      return "Listening on all interfaces · 6454";
    }
    const iface = interfaces().find(
      (i) => i.name === s.primary_nic || i.ip === s.primary_nic
    );
    if (iface) {
      return `Listening on ${iface.ip}:6454`;
    }
    if (s.interface_mode === "auto" && s.preferred_ip_cidr !== "0.0.0.0/0") {
      return `Auto · ${s.preferred_ip_cidr}`;
    }
    return "Listening on 0.0.0.0:6454";
  };

  return (
    <section>
      <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
        Network
      </h3>

      <div class="mb-1 flex items-center gap-2 text-xs font-mono tabular-nums text-secondary">
        <span class="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
        {statusLine()}
      </div>

      <div class="mt-2 flex flex-col gap-2">
        <span
          class="text-[10px] font-medium uppercase tracking-wider text-muted"
          title="S1: Primary NIC for Art-Net send/receive"
        >
          Primary Art-Net NIC
        </span>
        <button
          onClick={selectAllInterfaces}
          class="flex flex-col items-start rounded-lg border p-3 text-left transition-colors"
          classList={{
            "border-edge bg-obsidian hover:bg-surface-hover":
              !isAllInterfaces(),
            "border-teal/40 bg-obsidian ring-1 ring-teal/40 shadow-[0_0_8px_#2DD4BF26]":
              isAllInterfaces(),
          }}
        >
          <span class="text-sm text-primary">All interfaces</span>
          <span class="text-[11px] text-muted">Listen on every NIC</span>
        </button>

        {interfaces().map((iface) => (
          <button
            onClick={() => selectInterface(iface)}
            class="flex flex-col items-start rounded-lg border p-3 text-left transition-colors"
            classList={{
              "border-edge bg-obsidian hover:bg-surface-hover":
                !isSelected(iface),
              "border-teal/40 bg-obsidian ring-1 ring-teal/40 shadow-[0_0_8px_#2DD4BF26]":
                isSelected(iface),
            }}
          >
            <span class="text-sm font-mono text-primary">
              {iface.name} · {iface.ip}
            </span>
            {iface.subnet && (
              <span class="text-[11px] text-muted">Subnet {iface.subnet}</span>
            )}
          </button>
        ))}
        <div
          class="flex flex-col items-start rounded-lg border border-dashed border-edge p-3 opacity-60"
          title="Future: secondary NIC for redundant or separate Art-Net segment"
        >
          <span class="text-sm text-muted">Secondary (optional)</span>
          <span class="text-[11px] text-muted">Not yet implemented</span>
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-2">
        <label class="flex items-center justify-between rounded-md border border-edge bg-obsidian p-3">
          <div>
            <div class="text-sm text-primary">Spec-compliant targets</div>
            <div class="text-[11px] text-muted">
              2.x, 10.x, loopback broadcast
            </div>
          </div>
          <button
            onClick={() =>
              props.onApplyImmediate({
                spec_targets: !settings()?.spec_targets,
              })
            }
            class="relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200"
            classList={{
              "bg-teal": settings()?.spec_targets ?? true,
              "bg-edge-active": !(settings()?.spec_targets ?? true),
            }}
            aria-checked={settings()?.spec_targets ?? true}
          >
            <span
              class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
              classList={{
                "translate-x-0": settings()?.spec_targets ?? true,
                "-translate-x-4": !(settings()?.spec_targets ?? true),
              }}
            />
          </button>
        </label>

        <Show when={!isAllInterfaces()}>
          <label class="flex items-center justify-between rounded-md border border-edge bg-obsidian p-3">
            <div>
              <div class="text-sm text-primary">Include subnet broadcast</div>
              <div class="text-[11px] text-muted">
                Add NIC subnet to discovery
              </div>
            </div>
            <button
              onClick={() =>
                props.onApplyImmediate({
                  subnet_broadcast: !settings()?.subnet_broadcast,
                })
              }
              class="relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200"
              classList={{
                "bg-teal": settings()?.subnet_broadcast ?? false,
                "bg-edge-active": !(settings()?.subnet_broadcast ?? false),
              }}
              aria-checked={settings()?.subnet_broadcast ?? false}
            >
              <span
                class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                classList={{
                  "translate-x-0": settings()?.subnet_broadcast ?? false,
                  "-translate-x-4": !(settings()?.subnet_broadcast ?? false),
                }}
              />
            </button>
          </label>
        </Show>
      </div>

      <div class="mt-4">
        <button
          onClick={() => setAdvancedOpen((o) => !o)}
          class="flex items-center gap-1 text-xs text-muted hover:text-secondary transition-colors"
        >
          <span
            class="transition-transform"
            classList={{ "rotate-90": advancedOpen() }}
          >
            ▶
          </span>
          Advanced
        </button>

        <Show when={advancedOpen()}>
          <div class="mt-2 flex flex-col gap-2">
            <div>
              <label class="mb-1 block text-[11px] text-muted">
                Custom broadcast targets
              </label>
              <textarea
                value={customTargetsText()}
                onInput={(e) => setCustomTargets(e.currentTarget.value)}
                placeholder="One address per line, e.g. 192.168.255.255"
                class="w-full rounded border border-edge bg-obsidian p-2 font-mono text-xs text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
                rows={3}
              />
            </div>
            <div>
              <label class="mb-1 block text-[11px] text-muted">
                Unicast targets
              </label>
              <input
                type="text"
                value={unicastTargetsText()}
                onInput={(e) => setUnicastTargets(e.currentTarget.value)}
                placeholder="host:port, comma-separated"
                class="w-full rounded border border-edge bg-obsidian p-2 font-mono text-xs text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
              />
            </div>
          </div>
        </Show>
      </div>
    </section>
  );
};

export default NetworkSection;
