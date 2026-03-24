import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface IpProgReplyDto {
  ip: string;
  subnet_mask: string;
  gateway: string;
  port: number;
  dhcp_enabled: boolean;
}

interface IpProgDialogProps {
  isOpen: () => boolean;
  onClose: () => void;
  targetIp: string;
  /** When set (e.g. 127.0.0.1:6457), ArtIpProg is sent here instead of targetIp:6454 (Docker NAT). */
  transportAddr?: string | null;
  deviceName?: string;
}

const IpProgDialog: Component<IpProgDialogProps> = (props) => {
  const [ip, setIp] = createSignal("");
  const [subnetMask, setSubnetMask] = createSignal("");
  const [gateway, setGateway] = createSignal("");
  const [port, setPort] = createSignal("6454");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [showProgramConfirm, setShowProgramConfirm] = createSignal(false);

  const readCurrent = async () => {
    setError(null);
    setLoading(true);
    try {
      // Tauri 2 passes args by parameter name; Rust handler is send_ip_prog(params: IpProgParams).
      const reply = await invoke<IpProgReplyDto>("send_ip_prog", {
        params: {
          target_ip: props.targetIp,
          transport: props.transportAddr?.trim() || null,
          new_ip: null,
          subnet_mask: null,
          gateway: null,
          port: null,
          enable_programming: false,
          enable_dhcp: false,
        },
      });
      setIp(reply.ip);
      setSubnetMask(reply.subnet_mask);
      setGateway(reply.gateway);
      setPort(String(reply.port));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const programDevice = async () => {
    setError(null);
    setLoading(true);
    try {
      await invoke<IpProgReplyDto>("send_ip_prog", {
        params: {
          target_ip: props.targetIp,
          transport: props.transportAddr?.trim() || null,
          new_ip: ip() || null,
          subnet_mask: subnetMask() || null,
          gateway: gateway() || null,
          port: port() ? parseInt(port(), 10) : null,
          enable_programming: true,
          enable_dhcp: false,
        },
      });
      setShowProgramConfirm(false);
      props.onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleProgramClick = () => {
    setShowProgramConfirm(true);
  };

  const cancelProgramConfirm = () => {
    setShowProgramConfirm(false);
  };

  return (
    <Show when={props.isOpen()}>
      <div
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (!showProgramConfirm()) props.onClose();
        }}
      />
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          class="w-full max-w-md rounded-lg border border-edge bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-center justify-between border-b border-edge px-4 py-3">
            <h2 class="text-sm font-medium tracking-wide text-primary">
              Configure IP — {props.deviceName ?? props.targetIp}
            </h2>
            <button
              onClick={props.onClose}
              class="rounded-md p-1 text-muted transition-colors hover:bg-surface-hover hover:text-secondary"
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

          <div class="flex flex-col gap-4 p-4">
            <p class="text-[11px] text-muted">
              Advertised IP:{" "}
              <span class="font-mono text-secondary">{props.targetIp}</span>
            </p>
            <Show when={props.transportAddr?.trim()}>
              <p class="text-[11px] text-muted">
                UDP transport:{" "}
                <span class="font-mono text-teal">{props.transportAddr}</span>
              </p>
            </Show>

            <div class="flex flex-col gap-2">
              <label class="text-[11px] font-medium uppercase tracking-wide text-muted">
                IP Address
              </label>
              <input
                type="text"
                value={ip()}
                onInput={(e) => setIp(e.currentTarget.value)}
                placeholder="192.168.1.100"
                class="rounded-md border border-edge bg-obsidian px-3 py-2 font-mono text-sm text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
              />
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-[11px] font-medium uppercase tracking-wide text-muted">
                Subnet Mask
              </label>
              <input
                type="text"
                value={subnetMask()}
                onInput={(e) => setSubnetMask(e.currentTarget.value)}
                placeholder="255.255.255.0"
                class="rounded-md border border-edge bg-obsidian px-3 py-2 font-mono text-sm text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
              />
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-[11px] font-medium uppercase tracking-wide text-muted">
                Gateway
              </label>
              <input
                type="text"
                value={gateway()}
                onInput={(e) => setGateway(e.currentTarget.value)}
                placeholder="192.168.1.1"
                class="rounded-md border border-edge bg-obsidian px-3 py-2 font-mono text-sm text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
              />
            </div>

            <div class="flex flex-col gap-2">
              <label class="text-[11px] font-medium uppercase tracking-wide text-muted">
                Port
              </label>
              <input
                type="text"
                value={port()}
                onInput={(e) => setPort(e.currentTarget.value)}
                placeholder="6454"
                class="rounded-md border border-edge bg-obsidian px-3 py-2 font-mono text-sm text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none"
              />
            </div>

            <Show when={error()}>
              <div class="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                {error()}
              </div>
            </Show>

            <div class="flex gap-2 pt-2">
              <button
                onClick={readCurrent}
                disabled={loading()}
                class="rounded-md border border-edge bg-surface px-3 py-1.5 text-sm text-secondary transition-all hover:bg-surface-hover hover:text-primary disabled:opacity-50"
              >
                {loading() ? "..." : "Read current"}
              </button>
              <button
                onClick={handleProgramClick}
                disabled={loading()}
                class="rounded-md border border-amber/30 bg-amber/10 px-3 py-1.5 text-sm text-amber transition-all hover:bg-amber/20 disabled:opacity-50"
              >
                Program
              </button>
            </div>
          </div>
        </div>

        {/* Safety confirmation modal */}
        <Show when={showProgramConfirm()}>
          <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div class="mx-4 max-w-sm rounded-lg border border-edge bg-surface p-4 shadow-2xl">
              <h3 class="mb-2 text-sm font-medium text-amber">
                Confirm IP programming
              </h3>
              <p class="mb-4 text-xs text-secondary">
                This will change the device's IP. The device may become
                unreachable. Continue?
              </p>
              <div class="flex justify-end gap-2">
                <button
                  onClick={cancelProgramConfirm}
                  class="rounded-md border border-edge bg-surface px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={programDevice}
                  disabled={loading()}
                  class="rounded-md border border-amber/50 bg-amber/20 px-3 py-1.5 text-sm text-amber transition-colors hover:bg-amber/30 disabled:opacity-50"
                >
                  {loading() ? "..." : "Yes, program"}
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
};

export default IpProgDialog;
