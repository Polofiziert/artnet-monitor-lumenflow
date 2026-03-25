import type { ArtNetProductDto } from "../components/DeviceList";
import type { PollReplyActivity } from "../hooks/useDevices";

type EditableField = "ip" | "long_name" | "port_name" | "port_out" | "port_in";

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

export function reconcilePendingEdits(args: {
  pending: Record<string, PendingEdit>;
  products: ArtNetProductDto[];
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
      const port = device.ports.find(
        (x) => x.bind_index === Number(bind) && x.slot === Number(slot),
      );
      actual = port?.label ?? "";
    } else if (p.field === "port_out") {
      const [_, bind, slot] = key.split(":");
      const port = device.ports.find(
        (x) => x.bind_index === Number(bind) && x.slot === Number(slot),
      );
      actual = port ? String(port.output_universe) : "";
    } else if (p.field === "port_in") {
      const [_, bind, slot] = key.split(":");
      const port = device.ports.find(
        (x) => x.bind_index === Number(bind) && x.slot === Number(slot),
      );
      actual = port?.input_universe != null ? String(port.input_universe) : "";
    }

    const bundleCount = activityById[p.productId]?.bundleCount ?? 0;

    if (actual === p.expectedValue) {
      delete next[key];
      changed = true;
      continue;
    }

    if (bundleCount > p.sentAtBundleCount && actual === p.baselineValue) {
      const warning = "Node did not take the new value (latest ArtPollReply is unchanged).";
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

