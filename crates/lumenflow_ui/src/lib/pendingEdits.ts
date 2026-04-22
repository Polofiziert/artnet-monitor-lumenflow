import type { PollReplyActivity } from "../hooks/useDevices";

/** Fields tracked for PollReply verification after `send_art_address`. */
export type EditableField =
  | "ip"
  | "long_name"
  | "port_name"
  | "port_out"
  | "port_in"
  | "port_wire_rdm"
  | "port_wire_merge_ltp"
  | "port_wire_sacn"
  | "port_wire_style_continuous"
  | "port_direction_tx"
  | "port_direction_rx";

/** Minimal port shape for reconcile (avoids importing `DeviceList`). */
export type PortWirePendingSlice = {
  bind_index: number;
  slot: number;
  label: string;
  output_universe: number;
  input_universe?: number | null;
  port_type: number;
  good_output_b: number;
  wire: {
    rdm_active_on_port: boolean;
    merge_ltp: boolean;
    output_sacn_selected: boolean;
    input_sacn_selected: boolean;
    artnet_output_capable: boolean;
  };
};

export type ProductPendingSlice = {
  product_id: string;
  ip_address: string;
  long_name: string;
  ports: PortWirePendingSlice[];
};

export type PendingEdit = {
  productId: string;
  field: EditableField;
  expectedValue: string;
  baselineValue: string;
  sentAtBundleCount: number;
  warning?: string;
  /** When set, warning is shown until this timestamp (ms since epoch). */
  warningExpiresAtMs?: number;
};

function findPort(
  device: ProductPendingSlice,
  bind: number,
  slot: number
): PortWirePendingSlice | undefined {
  return device.ports.find((x) => x.bind_index === bind && x.slot === slot);
}

/** PollReply PortTypes: transmit-only (bit7 set, bit6 clear). */
function portDirTxWire(pt: number): boolean {
  return (pt & 0x80) !== 0 && (pt & 0x40) === 0;
}

/** PollReply PortTypes: receive-only (bit6 set, bit7 clear). */
function portDirRxWire(pt: number): boolean {
  return (pt & 0x40) !== 0 && (pt & 0x80) === 0;
}

export function reconcilePendingEdits(args: {
  pending: Record<string, PendingEdit>;
  products: ProductPendingSlice[];
  activityById: Record<string, PollReplyActivity>;
  nowMs?: number;
}): { next: Record<string, PendingEdit>; changed: boolean } {
  const { pending, products, activityById } = args;
  const keys = Object.keys(pending);
  if (keys.length === 0) return { next: pending, changed: false };

  const nowMs = args.nowMs ?? Date.now();
  const deviceById = new Map(products.map((d) => [d.product_id, d]));
  const next: Record<string, PendingEdit> = { ...pending };
  let changed = false;

  for (const key of keys) {
    const p = next[key];
    if (!p) continue;

    if (p.warningExpiresAtMs != null && nowMs >= p.warningExpiresAtMs) {
      delete next[key];
      changed = true;
      continue;
    }

    const device = deviceById.get(p.productId);
    if (!device) continue;

    let actual = "";
    if (p.field === "ip") {
      actual = device.ip_address;
    } else if (p.field === "long_name") {
      actual = device.long_name;
    } else if (p.field === "port_name") {
      const [_, bind, slot] = key.split(":");
      const port = findPort(device, Number(bind), Number(slot));
      actual = port?.label ?? "";
    } else if (p.field === "port_out") {
      const [_, bind, slot] = key.split(":");
      const port = findPort(device, Number(bind), Number(slot));
      actual = port ? String(port.output_universe) : "";
    } else if (p.field === "port_in") {
      const [_, bind, slot] = key.split(":");
      const port = findPort(device, Number(bind), Number(slot));
      actual = port?.input_universe != null ? String(port.input_universe) : "";
    } else if (p.field === "port_wire_rdm") {
      const parts = key.split(":");
      const bind = Number(parts[1]);
      const slot = Number(parts[2]);
      const port = findPort(device, bind, slot);
      actual = port?.wire.rdm_active_on_port ? "1" : "0";
    } else if (p.field === "port_wire_merge_ltp") {
      const parts = key.split(":");
      const bind = Number(parts[1]);
      const slot = Number(parts[2]);
      const port = findPort(device, bind, slot);
      actual = port?.wire.merge_ltp ? "1" : "0";
    } else if (p.field === "port_wire_sacn") {
      const parts = key.split(":");
      const bind = Number(parts[1]);
      const slot = Number(parts[2]);
      const port = findPort(device, bind, slot);
      if (!port) actual = "";
      else {
        const sacn = port.wire.artnet_output_capable
          ? port.wire.output_sacn_selected
          : port.wire.input_sacn_selected;
        actual = sacn ? "1" : "0";
      }
    } else if (p.field === "port_wire_style_continuous") {
      const parts = key.split(":");
      const bind = Number(parts[1]);
      const slot = Number(parts[2]);
      const port = findPort(device, bind, slot);
      actual =
        port != null && (port.good_output_b & 0x40) !== 0 ? "1" : "0";
    } else if (p.field === "port_direction_tx") {
      const parts = key.split(":");
      const bind = Number(parts[1]);
      const slot = Number(parts[2]);
      const port = findPort(device, bind, slot);
      actual = port != null && portDirTxWire(port.port_type) ? "1" : "0";
    } else if (p.field === "port_direction_rx") {
      const parts = key.split(":");
      const bind = Number(parts[1]);
      const slot = Number(parts[2]);
      const port = findPort(device, bind, slot);
      actual = port != null && portDirRxWire(port.port_type) ? "1" : "0";
    }

    const bundleCount = activityById[p.productId]?.bundleCount ?? 0;

    if (actual === p.expectedValue) {
      delete next[key];
      changed = true;
      continue;
    }

    if (bundleCount > p.sentAtBundleCount && actual === p.baselineValue) {
      const warning =
        "Node did not take the new value (latest ArtPollReply is unchanged). Next: trigger ArtPoll (or wait for the device's reply cycle) and compare the relevant PollReply fields to your intent.";
      if (p.warning !== warning) {
        // Long enough to read, short enough to not annoy.
        const WARNING_TTL_MS = 8000;
        next[key] = {
          ...p,
          warning,
          warningExpiresAtMs: nowMs + WARNING_TTL_MS,
        };
        changed = true;
      }
    }
  }

  return { next, changed };
}
