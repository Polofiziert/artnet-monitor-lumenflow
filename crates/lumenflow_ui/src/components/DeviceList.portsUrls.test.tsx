import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (_cmd: string, _args?: any) => []),
}));

import DeviceList, { type ArtNetProductDto } from "./DeviceList";
import { mockProductPort } from "../lib/mockData";

describe("DeviceList ports + URLs flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches device URLs and renders buttons", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (cmd: string, args?: any) => {
        if (cmd === "request_device_url") {
          const t = args?.request_type as number;
          if (t === 0x0001) return "https://example.com/product";
          if (t === 0x0002) return "https://example.com/guide";
          if (t === 0x0003) return "https://example.com/support";
        }
        return [];
      }
    );

    const product: ArtNetProductDto = {
      product_id: "10.0.0.20|001122334455",
      bind_ip: "10.0.0.20",
      ip_address: "10.0.0.20",
      transport_addr: null,
      mac_address: "00:11:22:33:44:55",
      short_name: "Node",
      long_name: "Node Long",
      esta_man: 0x1111,
      oem_code: 0x2222,
      firmware_version: 1,
      node_report: "OK",
      ports: [],
      online: true,
    };
    const [products] = createSignal<ArtNetProductDto[]>([product]);
    render(() => <DeviceList products={products} />);

    fireEvent.click(await screen.findByText(/Node Long/));
    fireEvent.click(screen.getByText("Fetch URLs"));

    await waitFor(() => {
      expect(
        screen.getByText(/Product: https:\/\/example\.com\/product/)
      ).toBeTruthy();
      expect(
        screen.getByText(/Guide: https:\/\/example\.com\/guide/)
      ).toBeTruthy();
      expect(
        screen.getByText(/Support: https:\/\/example\.com\/support/)
      ).toBeTruthy();
    });
  });

  it("submits port label edit via ArtAddress", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const product: ArtNetProductDto = {
      product_id: "10.0.0.20|001122334455",
      bind_ip: "10.0.0.20",
      ip_address: "10.0.0.20",
      transport_addr: null,
      mac_address: "00:11:22:33:44:55",
      short_name: "Node",
      long_name: "Node Long",
      esta_man: 0,
      oem_code: 0,
      firmware_version: 1,
      node_report: "OK",
      ports: [mockProductPort(0, 0x0002, "Port 1", { input_universe: 0x0001 })],
      online: true,
    };
    const [products] = createSignal<ArtNetProductDto[]>([product]);
    render(() => <DeviceList products={products} />);

    fireEvent.click(await screen.findByText(/Node Long/));
    fireEvent.click(screen.getByText("ports"));

    fireEvent.dblClick(screen.getByTitle("Double-click to edit port name"));
    const nameInput = screen.getByDisplayValue("Port 1") as HTMLInputElement;
    fireEvent.input(nameInput, { target: { value: "Front Truss" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(invoke).toHaveBeenCalled();
  });
});
