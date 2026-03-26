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

  it("submits port out/in edits via ArtAddress", async () => {
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
      ports: [
        {
          bind_index: 1,
          slot: 0,
          label: "Port 1",
          input_universe: 0x0001,
          output_universe: 0x0002,
        },
      ],
      online: true,
    };
    const [products] = createSignal<ArtNetProductDto[]>([product]);
    render(() => <DeviceList products={products} />);

    fireEvent.click(await screen.findByText(/Node Long/));
    fireEvent.click(screen.getByText("ports"));

    // Output edit: same net/subnet (0:0:*) to pass safety check.
    fireEvent.dblClick(
      screen.getByTitle("Double-click to edit output port address")
    );
    const outInput = screen.getByDisplayValue("0:0:2") as HTMLInputElement;
    fireEvent.input(outInput, { target: { value: "0:0:3" } });
    fireEvent.keyDown(outInput, { key: "Enter" });

    // Input edit.
    fireEvent.dblClick(
      screen.getByTitle("Double-click to edit input port address")
    );
    const inInput = screen.getByDisplayValue("0:0:1") as HTMLInputElement;
    fireEvent.input(inInput, { target: { value: "0:0:4" } });
    fireEvent.keyDown(inInput, { key: "Enter" });

    expect(invoke).toHaveBeenCalled();
  });
});
