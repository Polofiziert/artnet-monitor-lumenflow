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
import { mockProductPort } from "../lib/mockData";

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
      ports: [mockProductPort(0, 0x0002, "P1", { input_universe: 0x0001 })],
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

  it("keeps port inline edit open when product_id changes on refresh", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const base: ArtNetProductDto = {
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
      ports: [mockProductPort(0, 0x0002, "P1", { input_universe: 0x0001 })],
      online: true,
    };

    const [products, setProducts] = createSignal<ArtNetProductDto[]>([base]);
    render(() => <DeviceList products={products} />);

    fireEvent.click(await screen.findByText(/Node Long/));
    fireEvent.click(screen.getByText("ports"));

    fireEvent.dblClick(screen.getByText("P1"));
    const input = screen.getByDisplayValue("P1") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "Port Draft" } });

    setProducts([
      {
        ...base,
        product_id: "10.0.0.99|001122334455",
        bind_ip: "10.0.0.99",
      },
    ]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Port Draft")).toBeTruthy();
    });
  });

  it("rebinds by MAC identity when IP changes during port editing", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const base: ArtNetProductDto = {
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
      ports: [mockProductPort(0, 0x0002, "P1", { input_universe: 0x0001 })],
      online: true,
    };

    const [products, setProducts] = createSignal<ArtNetProductDto[]>([base]);
    render(() => <DeviceList products={products} />);

    fireEvent.click(await screen.findByText(/Node Long/));
    fireEvent.click(screen.getByText("ports"));

    fireEvent.dblClick(screen.getByText("P1"));
    const input = screen.getByDisplayValue("P1") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "MAC Stable Draft" } });

    setProducts([
      {
        ...base,
        product_id: "10.0.1.77|001122334455",
        bind_ip: "10.0.1.77",
        ip_address: "10.0.1.77",
      },
    ]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("MAC Stable Draft")).toBeTruthy();
    });
  });

  it("keeps selected port rows selected across product_id refresh churn", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const base: ArtNetProductDto = {
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
      ports: [mockProductPort(0, 0x0002, "P1", { input_universe: 0x0001 })],
      online: true,
    };

    const [products, setProducts] = createSignal<ArtNetProductDto[]>([base]);
    render(() => <DeviceList products={products} />);

    fireEvent.click(await screen.findByText(/Node Long/));
    fireEvent.click(screen.getByText("ports"));
    fireEvent.click(screen.getByTestId("port-row-1-0"));
    expect(screen.getByTestId("ports-bulk-bar")).toBeTruthy();

    setProducts([
      {
        ...base,
        product_id: "10.0.0.99|001122334455",
        bind_ip: "10.0.0.99",
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("ports-bulk-bar")).toBeTruthy();
      expect(screen.getByText(/1 selected/i)).toBeTruthy();
    });
  });

  it("remembers ports table/card mode per node across tab switches", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const nodeA: ArtNetProductDto = {
      product_id: "10.0.0.20|001122334455",
      bind_ip: "10.0.0.20",
      ip_address: "10.0.0.20",
      transport_addr: null,
      mac_address: "00:11:22:33:44:55",
      short_name: "NodeA",
      long_name: "Node A",
      esta_man: 0,
      oem_code: 0,
      firmware_version: 1,
      node_report: "OK",
      ports: [mockProductPort(0, 0x0002, "A1", { input_universe: 0x0001 })],
      online: true,
    };
    const nodeB: ArtNetProductDto = {
      product_id: "10.0.0.21|AABBCCDDEEFF",
      bind_ip: "10.0.0.21",
      ip_address: "10.0.0.21",
      transport_addr: null,
      mac_address: "AA:BB:CC:DD:EE:FF",
      short_name: "NodeB",
      long_name: "Node B",
      esta_man: 0,
      oem_code: 0,
      firmware_version: 1,
      node_report: "OK",
      ports: [mockProductPort(0, 0x0003, "B1", { input_universe: 0x0002 })],
      online: true,
    };

    const [products] = createSignal<ArtNetProductDto[]>([nodeA, nodeB]);
    render(() => <DeviceList products={products} />);

    fireEvent.click(await screen.findByText(/Node A/));
    fireEvent.click(screen.getByText("ports"));
    fireEvent.click(screen.getByText("Cards"));
    expect(screen.getByTestId("ports-card-scroll")).toBeTruthy();

    fireEvent.click(screen.getByText("overview"));
    fireEvent.click(screen.getByText("ports"));
    expect(screen.getByTestId("ports-card-scroll")).toBeTruthy();

    fireEvent.click(screen.getByText(/Node B/));
    fireEvent.click(screen.getByText("ports"));
    expect(screen.getByTestId("ports-table-scroll")).toBeTruthy();

    fireEvent.click(screen.getByText(/Node A/));
    fireEvent.click(screen.getByText("ports"));
    expect(screen.getByTestId("ports-card-scroll")).toBeTruthy();
  });
});
