import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "get_controllers") return [];
    return [];
  }),
}));

import DeviceList, { type ArtNetProductDto } from "./DeviceList";
import type { PollReplyActivity } from "../hooks/useDevices";

function product(
  id: string,
  ip: string,
  status1: number,
  online = true
): ArtNetProductDto {
  return {
    product_id: id,
    bind_ip: ip,
    ip_address: ip,
    transport_addr: null,
    mac_address: "00:11:22:33:44:55",
    short_name: `Node ${id}`,
    long_name: `Node ${id}`,
    esta_man: 0,
    oem_code: 0,
    firmware_version: 1,
    node_report: "OK",
    status1,
    status2: 0,
    ports: [
      {
        bind_index: 1,
        slot: 0,
        output_universe: 1,
        input_universe: null,
        label: "Port 1",
      },
    ],
    online,
  };
}

describe("DeviceList LED controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends per-device identify and waits for poll-reply confirmation", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_controllers") return [];
      if (cmd === "send_art_address") return undefined;
      return [];
    });

    const [products, setProducts] = createSignal<ArtNetProductDto[]>([
      product("a", "10.0.0.10", 0b1100_0000), // normal
    ]);
    const [activity, setActivity] = createSignal<
      Record<string, PollReplyActivity>
    >({
      a: {
        pulseNonce: 1,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.10",
        bindIp: "10.0.0.10",
        shortName: "Node a",
        bundleWindowMs: 180,
        bundleCount: 1,
      },
    });
    render(() => (
      <DeviceList products={products} pollReplyActivity={activity} />
    ));

    const identifyButton = await screen.findByTestId("led-device-identify-a");
    const muteButton = await screen.findByTestId("led-device-mute-a");
    const globalIdentify = await screen.findByTestId("led-global-identify");
    const globalMute = await screen.findByTestId("led-global-mute");

    expect(identifyButton.getAttribute("title")).toBe(
      "Identify device LEDs for Node a [1]"
    );
    expect(identifyButton.getAttribute("aria-label")).toBe(
      "Identify device LEDs for Node a [1]"
    );
    expect(muteButton.getAttribute("title")).toBe(
      "Mute device LEDs for Node a [1]"
    );
    expect(globalIdentify.getAttribute("title")).toBe("Identify device LEDs");
    expect(globalMute.getAttribute("title")).toBe("Mute device LEDs");
    expect(identifyButton.getAttribute("aria-pressed")).toBe("false");
    expect(muteButton.getAttribute("aria-pressed")).toBe("false");
    expect(globalIdentify.getAttribute("aria-pressed")).toBe("false");
    expect(globalMute.getAttribute("aria-pressed")).toBe("false");

    expect(identifyButton.querySelector("svg")).toBeTruthy();
    expect(muteButton.querySelector("svg")).toBeTruthy();
    expect(
      identifyButton.querySelector("svg")?.getAttribute("aria-hidden")
    ).toBe("true");

    await fireEvent.click(identifyButton);

    expect(invokeMock).toHaveBeenCalledWith(
      "send_art_address",
      expect.objectContaining({
        params: expect.objectContaining({ led_command: "identify" }),
      })
    );

    // No optimistic mode; still normal until poll-reply updates.
    expect((identifyButton as HTMLButtonElement).className).not.toContain(
      "border-teal/40"
    );

    // Poll-reply confirms identify in Status1[7:6] = 01.
    setProducts([product("a", "10.0.0.10", 0b0100_0000)]);
    setActivity({
      a: {
        pulseNonce: 2,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.10",
        bindIp: "10.0.0.10",
        shortName: "Node a",
        bundleWindowMs: 180,
        bundleCount: 2,
      },
    });
    await waitFor(() =>
      expect(
        (screen.getByTestId("led-device-identify-a") as HTMLButtonElement)
          .className
      ).toContain("border-teal/40")
    );
    expect(
      (
        screen.getByTestId("led-device-identify-a") as HTMLButtonElement
      ).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("shows warning when no confirmation arrives before timeout", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_controllers") return [];
      if (cmd === "send_art_address") return undefined;
      return [];
    });

    const [products] = createSignal<ArtNetProductDto[]>([
      product("a", "10.0.0.10", 0b1100_0000),
    ]);
    const [activity] = createSignal<Record<string, PollReplyActivity>>({
      a: {
        pulseNonce: 1,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.10",
        bindIp: "10.0.0.10",
        shortName: "Node a",
        bundleWindowMs: 180,
        bundleCount: 1,
      },
    });
    render(() => (
      <DeviceList products={products} pollReplyActivity={activity} />
    ));

    await fireEvent.click(await screen.findByTestId("led-device-mute-a"));
    vi.advanceTimersByTime(3000);

    await waitFor(() =>
      expect(
        screen.getByText(/not confirmed because Status1 indicator bits/i)
      ).toBeTruthy()
    );
  });

  it("restores global identify snapshot when toggled off", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_controllers") return [];
      if (cmd === "send_art_address") return undefined;
      return [];
    });

    const [products, setProducts] = createSignal<ArtNetProductDto[]>([
      product("a", "10.0.0.10", 0b1000_0000), // mute
      product("b", "10.0.0.11", 0b1000_0000), // mute
      product("c", "10.0.0.12", 0b1100_0000), // normal
    ]);
    const [activity, setActivity] = createSignal<
      Record<string, PollReplyActivity>
    >({
      a: {
        pulseNonce: 1,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.10",
        bindIp: "10.0.0.10",
        shortName: "Node a",
        bundleWindowMs: 180,
        bundleCount: 1,
      },
      b: {
        pulseNonce: 1,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.11",
        bindIp: "10.0.0.11",
        shortName: "Node b",
        bundleWindowMs: 180,
        bundleCount: 1,
      },
      c: {
        pulseNonce: 1,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.12",
        bindIp: "10.0.0.12",
        shortName: "Node c",
        bundleWindowMs: 180,
        bundleCount: 1,
      },
    });

    render(() => (
      <DeviceList products={products} pollReplyActivity={activity} />
    ));

    const globalIdentify = await screen.findByTestId("led-global-identify");
    await fireEvent.click(globalIdentify);

    await waitFor(() => {
      const count = invokeMock.mock.calls.filter(
        ([cmd, args]) =>
          cmd === "send_art_address" && args?.params?.led_command === "identify"
      ).length;
      expect(count).toBe(3);
    });

    // All devices now confirm identify.
    setProducts([
      product("a", "10.0.0.10", 0b0100_0000),
      product("b", "10.0.0.11", 0b0100_0000),
      product("c", "10.0.0.12", 0b0100_0000),
    ]);
    setActivity({
      a: {
        pulseNonce: 2,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.10",
        bindIp: "10.0.0.10",
        shortName: "Node a",
        bundleWindowMs: 180,
        bundleCount: 2,
      },
      b: {
        pulseNonce: 2,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.11",
        bindIp: "10.0.0.11",
        shortName: "Node b",
        bundleWindowMs: 180,
        bundleCount: 2,
      },
      c: {
        pulseNonce: 2,
        lastReceivedAtMs: Date.now(),
        lastBindIndex: 1,
        ipAddress: "10.0.0.12",
        bindIp: "10.0.0.12",
        shortName: "Node c",
        bundleWindowMs: 180,
        bundleCount: 2,
      },
    });
    await waitFor(() =>
      expect(
        (screen.getByTestId("led-global-identify") as HTMLButtonElement)
          .className
      ).toContain("border-teal/40")
    );

    // Toggle global identify off and verify restore snapshot (mute, mute, normal).
    await fireEvent.click(screen.getByTestId("led-global-identify"));
    await waitFor(() => {
      const restoreCalls = invokeMock.mock.calls
        .filter(([cmd]) => cmd === "send_art_address")
        .map(([, args]) => [
          args?.params?.target_ip,
          args?.params?.led_command,
        ]);
      expect(restoreCalls).toEqual(
        expect.arrayContaining([
          ["10.0.0.10", "mute"],
          ["10.0.0.11", "mute"],
          ["10.0.0.12", "normal"],
        ])
      );
    });
    await waitFor(() => {
      const allLedCommands = invokeMock.mock.calls
        .filter(([cmd]) => cmd === "send_art_address")
        .map(([, args]) => args?.params?.led_command);
      expect(allLedCommands).toEqual(
        expect.arrayContaining([
          "identify",
          "identify",
          "identify",
          "mute",
          "mute",
          "normal",
        ])
      );
    });
  });
});
