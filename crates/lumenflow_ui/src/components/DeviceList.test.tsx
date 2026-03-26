import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import DeviceList, { type ArtNetProductDto } from "./DeviceList";
import type { PollReplyActivity } from "../hooks/useDevices";
import { reconcilePendingEdits } from "../lib/pendingEdits";
import type { PendingEdit } from "../lib/pendingEdits";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

describe("DeviceList poll-reply pulse", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flashes one visible pulse cycle per activity event for a device row", async () => {
    vi.useFakeTimers();

    const product: ArtNetProductDto = {
      product_id: "10.0.0.20|001122334455",
      bind_ip: "10.0.0.20",
      ip_address: "10.0.0.20",
      transport_addr: null,
      mac_address: "00:11:22:33:44:55",
      short_name: "Node A",
      long_name: "Node A Long",
      esta_man: 0x7a70,
      oem_code: 0x1234,
      firmware_version: 0x0100,
      node_report: "#0001 [0000] OK",
      ports: [],
      online: true,
    };

    const [products] = createSignal<ArtNetProductDto[]>([product]);
    const [activity, setActivity] = createSignal<
      Record<string, PollReplyActivity>
    >({});

    render(() => (
      <DeviceList products={products} pollReplyActivity={activity} />
    ));

    const dot = await screen.findByTestId(
      `poll-reply-dot-${product.product_id}`
    );
    expect(dot.classList.contains("scale-150")).toBe(false);

    setActivity({
      [product.product_id]: {
        pulseNonce: 1,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 2,
        ipAddress: product.ip_address,
        bindIp: product.bind_ip,
        shortName: product.short_name,
        bundleWindowMs: 180,
        bundleCount: 1,
      },
    });

    await Promise.resolve();
    expect(dot.classList.contains("scale-150")).toBe(true);

    vi.advanceTimersByTime(500);
    expect(dot.classList.contains("scale-150")).toBe(false);

    setActivity({
      [product.product_id]: {
        pulseNonce: 2,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: product.ip_address,
        bindIp: product.bind_ip,
        shortName: product.short_name,
        bundleWindowMs: 180,
        bundleCount: 2,
      },
    });

    await Promise.resolve();
    expect(dot.classList.contains("scale-150")).toBe(true);
    vi.advanceTimersByTime(500);
    expect(dot.classList.contains("scale-150")).toBe(false);
  });

  it("uses long node name with ascending node index for row title", async () => {
    const products: ArtNetProductDto[] = [
      {
        product_id: "10.0.0.21|001122334455",
        bind_ip: "10.0.0.21",
        ip_address: "10.0.0.21",
        transport_addr: null,
        mac_address: "00:11:22:33:44:55",
        short_name: "Port 2",
        long_name: "Swisson XND-8",
        esta_man: 0x7a70,
        oem_code: 0x1234,
        firmware_version: 0x0100,
        node_report: "OK",
        ports: [],
        online: true,
      },
      {
        product_id: "10.0.0.20|00AABBCCDDEE",
        bind_ip: "10.0.0.20",
        ip_address: "10.0.0.20",
        transport_addr: null,
        mac_address: "00:AA:BB:CC:DD:EE",
        short_name: "Port 1",
        long_name: "Swisson XND-8",
        esta_man: 0x7a70,
        oem_code: 0x1234,
        firmware_version: 0x0100,
        node_report: "OK",
        ports: [],
        online: true,
      },
    ];
    const [productsSig] = createSignal(products);
    const [activity] = createSignal<Record<string, PollReplyActivity>>({});

    render(() => (
      <DeviceList products={productsSig} pollReplyActivity={activity} />
    ));

    // Sorted by IP -> 10.0.0.20 gets [1], 10.0.0.21 gets [2]
    expect(await screen.findByText("Swisson XND-8 [1]")).toBeTruthy();
    expect(await screen.findByText("Swisson XND-8 [2]")).toBeTruthy();
  });

  it("keeps manual entry title without node suffix", async () => {
    const products: ArtNetProductDto[] = [
      {
        product_id: "manual|192.168.1.77",
        bind_ip: "192.168.1.77",
        ip_address: "192.168.1.77",
        transport_addr: null,
        mac_address: "",
        short_name: "Backstage Dimmer",
        long_name: "Manual entry",
        esta_man: 0,
        oem_code: 0,
        firmware_version: 0,
        node_report: "",
        ports: [],
        online: false,
      },
    ];
    const [productsSig] = createSignal(products);
    const [activity] = createSignal<Record<string, PollReplyActivity>>({});

    render(() => (
      <DeviceList products={productsSig} pollReplyActivity={activity} />
    ));

    expect(await screen.findByText("Backstage Dimmer")).toBeTruthy();
  });
});

describe("pending edit reconciliation", () => {
  it("is idempotent when warning already applied (prevents reactive loops)", () => {
    const product: ArtNetProductDto = {
      product_id: "10.0.0.20|001122334455",
      bind_ip: "10.0.0.20",
      ip_address: "10.0.0.20",
      transport_addr: null,
      mac_address: "00:11:22:33:44:55",
      short_name: "Port 1",
      long_name: "Old Name",
      esta_man: 0x7a70,
      oem_code: 0x1234,
      firmware_version: 0x0100,
      node_report: "OK",
      ports: [],
      online: true,
    };

    const key = "long_name";
    const warning =
      "Node did not take the new value (latest ArtPollReply is unchanged).";
    const pending = {
      [key]: {
        productId: product.product_id,
        field: "long_name" as const,
        expectedValue: "New Name",
        baselineValue: "Old Name",
        sentAtBundleCount: 1,
        warning,
      },
    };
    const activityById: Record<string, PollReplyActivity> = {
      [product.product_id]: {
        pulseNonce: 2,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: product.ip_address,
        bindIp: product.bind_ip,
        shortName: product.short_name,
        bundleWindowMs: 180,
        bundleCount: 2,
      },
    };

    const r1 = reconcilePendingEdits({
      pending,
      products: [product],
      activityById,
    });
    expect(r1.changed).toBe(false);
    expect(r1.next[key]?.warning).toBe(warning);
  });

  it("expires warning after TTL and removes pending edit", () => {
    const product: ArtNetProductDto = {
      product_id: "10.0.0.20|001122334455",
      bind_ip: "10.0.0.20",
      ip_address: "10.0.0.20",
      transport_addr: null,
      mac_address: "00:11:22:33:44:55",
      short_name: "Port 1",
      long_name: "Old Name",
      esta_man: 0x7a70,
      oem_code: 0x1234,
      firmware_version: 0x0100,
      node_report: "OK",
      ports: [],
      online: true,
    };

    const key = "long_name";
    const pending = {
      [key]: {
        productId: product.product_id,
        field: "long_name" as const,
        expectedValue: "New Name",
        baselineValue: "Old Name",
        sentAtBundleCount: 1,
        warning:
          "Node did not take the new value (latest ArtPollReply is unchanged).",
        warningExpiresAtMs: 1000,
      },
    };

    const r1 = reconcilePendingEdits({
      pending,
      products: [product],
      activityById: {
        [product.product_id]: {
          pulseNonce: 2,
          lastReceivedAtMs: Date.now(),
          lastBindIndex: 1,
          ipAddress: product.ip_address,
          bindIp: product.bind_ip,
          shortName: product.short_name,
          bundleWindowMs: 180,
          bundleCount: 2,
        },
      },
      nowMs: 1001,
    });

    expect(r1.changed).toBe(true);
    expect(r1.next[key]).toBeUndefined();
  });

  it("reconciles port out/in pending edits using numeric universe values", () => {
    const productId = "10.0.0.20|001122334455";
    const product: ArtNetProductDto = {
      product_id: productId,
      bind_ip: "10.0.0.1",
      ip_address: "10.0.0.20",
      mac_address: "00:11:22:33:44:55",
      short_name: "Node",
      long_name: "Node",
      esta_man: 0,
      oem_code: 0,
      firmware_version: 1,
      node_report: "",
      ports: [
        {
          bind_index: 1,
          slot: 0,
          label: "P1",
          input_universe: 0x0101,
          output_universe: 0x0102,
        },
      ],
      online: true,
    };

    const pending: Record<string, PendingEdit> = {
      "out:1:0": {
        productId,
        field: "port_out",
        expectedValue: String(0x0102),
        baselineValue: String(0x0100),
        sentAtBundleCount: 1,
      },
      "in:1:0": {
        productId,
        field: "port_in",
        expectedValue: String(0x0101),
        baselineValue: String(0x0100),
        sentAtBundleCount: 1,
      },
    };

    const activityById: Record<string, PollReplyActivity> = {
      [productId]: {
        pulseNonce: 1,
        ipAddress: "10.0.0.20",
        bindIp: "10.0.0.1",
        shortName: "Node",
        lastReceivedAtMs: 0,
        lastBindIndex: 1,
        bundleWindowMs: 100,
        bundleCount: 2,
      },
    };

    const r1 = reconcilePendingEdits({
      pending,
      products: [product],
      activityById,
      nowMs: 0,
    });
    expect(r1.changed).toBe(true);
    expect(r1.next["out:1:0"]).toBeUndefined();
    expect(r1.next["in:1:0"]).toBeUndefined();
  });
});

describe("IP cfg (ArtIpProgReply) inline editing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads ip prog config and renders it", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (cmd: string) => {
        if (cmd === "send_ip_prog") {
          return {
            ip: "10.0.0.20",
            subnet_mask: "255.255.255.0",
            gateway: "10.0.0.1",
            port: 6454,
            dhcp_enabled: false,
          };
        }
        if (cmd === "get_controllers") {
          return [
            {
              ip: "10.0.0.99",
              last_seen_at_ms: 1234,
              talk_to_me: 0x06,
              diag_priority: 0,
              target_port_bottom: 0,
              target_port_top: 32767,
              esta_man: 0x5379,
              oem: 0x2269,
            },
          ];
        }
        // DeviceList may call other commands on mount (e.g. get_diag_entries).
        return [];
      }
    );

    const product: ArtNetProductDto = {
      product_id: "10.0.0.20|001122334455",
      bind_ip: "10.0.0.20",
      ip_address: "10.0.0.20",
      transport_addr: null,
      mac_address: "00:11:22:33:44:55",
      short_name: "Node A",
      long_name: "Node A Long",
      esta_man: 0x7a70,
      oem_code: 0x1234,
      firmware_version: 0x0100,
      node_report: "OK",
      ports: [],
      online: true,
    };

    const [productsSig] = createSignal<ArtNetProductDto[]>([product]);
    const [activity] = createSignal<Record<string, PollReplyActivity>>({});

    render(() => (
      <DeviceList products={productsSig} pollReplyActivity={activity} />
    ));

    expect(
      await screen.findByText("Controllers seen (ArtPoll senders)")
    ).toBeTruthy();
    expect(await screen.findByText("10.0.0.99")).toBeTruthy();

    await fireEvent.click(await screen.findByText("Node A Long [1]"));
    await fireEvent.click(await screen.findByText("Read"));

    expect(await screen.findByText("255.255.255.0")).toBeTruthy();
    expect(await screen.findByText("10.0.0.1")).toBeTruthy();
    expect(await screen.findByText("6454")).toBeTruthy();
  });
});

describe("port name inline edit focus", () => {
  it("keeps focus while ports update from new poll snapshots", async () => {
    const productId = "10.0.0.20|001122334455";
    const mk = (label: string): ArtNetProductDto => ({
      product_id: productId,
      bind_ip: "10.0.0.20",
      ip_address: "10.0.0.20",
      transport_addr: null,
      mac_address: "00:11:22:33:44:55",
      short_name: "Node A",
      long_name: "Node A Long",
      esta_man: 0x7a70,
      oem_code: 0x1234,
      firmware_version: 0x0100,
      node_report: "OK",
      ports: [
        {
          bind_index: 1,
          slot: 0,
          output_universe: 0,
          input_universe: null,
          label,
        },
      ],
      online: true,
    });

    const [products, setProducts] = createSignal<ArtNetProductDto[]>([
      mk("Port 1"),
    ]);
    const [activity, setActivity] = createSignal<
      Record<string, PollReplyActivity>
    >({});

    render(() => (
      <DeviceList products={products} pollReplyActivity={activity} />
    ));

    // Select device so detail panel renders.
    await fireEvent.click(await screen.findByText("Node A Long [1]"));

    // Switch to ports tab.
    await fireEvent.click(await screen.findByText("ports"));

    // Enter edit mode.
    const portButton = await screen.findByText("Port 1");
    await fireEvent.dblClick(portButton);

    const input = document.querySelector(
      "input[autofocus]"
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();
    // JSDOM doesn't always apply autofocus; explicitly focus so we can assert retention.
    input!.focus();
    expect(document.activeElement).toBe(input);

    // Simulate a new PollReply bundle causing products snapshot refresh (new object identities).
    setProducts([mk("Port 1")]);
    setActivity({
      [productId]: {
        pulseNonce: 1,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.20",
        bindIp: "10.0.0.20",
        shortName: "Node A",
        bundleWindowMs: 180,
        bundleCount: 1,
      },
    });

    await Promise.resolve();
    expect(document.activeElement).toBe(input);
  });
});
