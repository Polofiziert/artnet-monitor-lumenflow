import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import DeviceList, { type ArtNetProductDto } from "./DeviceList";
import type { PollReplyActivity } from "../hooks/useDevices";

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
    const [activity, setActivity] = createSignal<Record<string, PollReplyActivity>>({});

    render(() => (
      <DeviceList products={products} pollReplyActivity={activity} />
    ));

    const dot = await screen.findByTestId(`poll-reply-dot-${product.product_id}`);
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
