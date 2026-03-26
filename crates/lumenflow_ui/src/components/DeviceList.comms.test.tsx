import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

vi.mock("../hooks/useDiagLog", () => ({
  useDiagLog: () => ({
    entries: [
      {
        receivedAt: 1234,
        priority: 0x80,
        message: "Diag msg",
        sourceIp: "10.0.0.20",
      },
    ],
  }),
  priorityColor: () => "text-amber",
  priorityLabel: () => "HIGH",
}));

import DeviceList, { type ArtNetProductDto } from "./DeviceList";

describe("DeviceList comms/diagnostics tabs", () => {
  it("renders diagnostics and comms tab contents", async () => {
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
      node_report: "",
      ports: [],
      online: true,
    };

    const [products] = createSignal<ArtNetProductDto[]>([product]);
    render(() => <DeviceList products={products} />);

    // Select the device row.
    fireEvent.click(await screen.findByText(/Node Long/));

    fireEvent.click(screen.getByText("diagnostics"));
    expect(await screen.findByText("Online")).toBeTruthy();
    expect(screen.getByText("Ports")).toBeTruthy();

    fireEvent.click(screen.getByText("comms"));
    expect(await screen.findByText("Diag msg")).toBeTruthy();
    expect(screen.getByText("HIGH")).toBeTruthy();
  });
});

