import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

import DeviceList, { type ArtNetProductDto } from "./DeviceList";

describe("DeviceList inline editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates IPv4 on IP edit and invokes ip prog on success", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const onReadCurrent = vi.fn();

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
          label: "P1",
          input_universe: 0x0001,
          output_universe: 0x0002,
        },
      ],
      online: true,
    };

    const [products] = createSignal<ArtNetProductDto[]>([product]);
    render(() => (
      <DeviceList products={products} onReadCurrent={onReadCurrent} />
    ));

    fireEvent.click(await screen.findByText(/Node Long/));

    // Start IP edit (double click on IP button).
    fireEvent.dblClick(screen.getByTitle("Double-click to edit IP"));
    const ipInput = screen.getByDisplayValue("10.0.0.20") as HTMLInputElement;

    fireEvent.input(ipInput, { target: { value: "999.1.2.3" } });
    fireEvent.keyDown(ipInput, { key: "Enter" });
    expect(await screen.findByText("Invalid IPv4 address.")).toBeTruthy();

    fireEvent.input(ipInput, { target: { value: "10.0.0.21" } });
    fireEvent.keyDown(ipInput, { key: "Enter" });

    expect(invoke).toHaveBeenCalled();
    await waitFor(() => {
      expect(onReadCurrent).toHaveBeenCalled();
    });
  });

  it("invokes ArtAddress when long name is edited", async () => {
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
      ports: [],
      online: true,
    };

    const [products] = createSignal<ArtNetProductDto[]>([product]);
    render(() => <DeviceList products={products} />);

    fireEvent.click(await screen.findByText(/Node Long/));

    // Start long name edit.
    fireEvent.dblClick(screen.getByTitle("Node Long"));
    const lnInput = screen.getByDisplayValue("Node Long") as HTMLInputElement;
    fireEvent.input(lnInput, { target: { value: "New Long" } });
    fireEvent.keyDown(lnInput, { key: "Enter" });

    expect(invoke).toHaveBeenCalled();
  });
});
