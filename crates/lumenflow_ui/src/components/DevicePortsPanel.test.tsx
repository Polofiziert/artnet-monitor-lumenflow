import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import type { ArtNetProductDto } from "./DeviceList";
import { DevicePortsPanel } from "./DevicePortsPanel";
import { mockProductPort } from "../lib/mockData";
import { PortMergeGlyph } from "./PortMergeGlyph";

function panelPropsFor(device: () => ArtNetProductDto) {
  const [editingPortKey, setEditingPortKey] = createSignal<string | null>(null);
  const [editingValue, setEditingValue] = createSignal("");
  const [viewMode, setViewMode] = createSignal<"table" | "card">("table");
  const beginEdit = (_k: string, v: string) => setEditingValue(v);
  return {
    device,
    deviceIdentity: `${device().mac_address}|${device().ip_address}`,
    viewMode,
    setViewMode,
    editingPortKey,
    setEditingPortKey,
    editingValue,
    setEditingValue,
    beginEdit,
    submitPortNameEdit: vi.fn(async () => {}),
    submitPortOutEdit: vi.fn(async () => {}),
    submitPortInEdit: vi.fn(async () => {}),
    isFieldBusy: () => false,
    fieldSpinner: () => null as unknown as JSX.Element,
    pendingEdits: () => ({}),
    registerPollReplyPendings: vi.fn(),
    fieldErrors: () => ({}),
  };
}

describe("DevicePortsPanel", () => {
  it("shows shared-universe legend when two output ports share the same 15-bit address", () => {
    const product: ArtNetProductDto = {
      product_id: "t|mac",
      bind_ip: "10.0.0.1",
      ip_address: "10.0.0.1",
      mac_address: "00:11:22:33:44:55",
      short_name: "Node",
      long_name: "Node Long",
      esta_man: 0,
      oem_code: 0,
      firmware_version: 1,
      node_report: "",
      ports: [
        mockProductPort(0, 0x0022, "A"),
        mockProductPort(1, 0x0022, "B"),
      ],
      online: true,
    };
    const device = () => product;
    render(() => <DevicePortsPanel {...panelPropsFor(device)} />);
    expect(screen.getByTestId("device-ports-panel")).toBeTruthy();
    expect(screen.getByText(/Shared universe/i)).toBeTruthy();
  });

  it("toggles to card layout", () => {
    const product: ArtNetProductDto = {
      product_id: "t|mac",
      bind_ip: "10.0.0.1",
      ip_address: "10.0.0.1",
      mac_address: "",
      short_name: "N",
      long_name: "L",
      esta_man: 0,
      oem_code: 0,
      firmware_version: 0,
      node_report: "",
      ports: [mockProductPort(0, 1, "P0")],
      online: true,
    };
    render(() => <DevicePortsPanel {...panelPropsFor(() => product)} />);
    expect(screen.getByTestId("ports-table-scroll")).toBeTruthy();
    fireEvent.click(screen.getByText("Cards"));
    expect(screen.getByTestId("ports-card-scroll")).toBeTruthy();
  });

  it("shows bulk bar after selecting a port row", () => {
    const product: ArtNetProductDto = {
      product_id: "t|mac",
      bind_ip: "10.0.0.1",
      ip_address: "10.0.0.1",
      mac_address: "",
      short_name: "N",
      long_name: "L",
      esta_man: 0,
      oem_code: 0,
      firmware_version: 0,
      node_report: "",
      ports: [mockProductPort(0, 1, "P0")],
      online: true,
    };
    render(() => <DevicePortsPanel {...panelPropsFor(() => product)} />);
    fireEvent.click(screen.getByTestId("port-row-1-0"));
    expect(screen.getByTestId("ports-bulk-bar")).toBeTruthy();
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
  });
});

describe("PortMergeGlyph", () => {
  it("renders output two-source merge with two stacked fills", () => {
    const { container } = render(() => (
      <PortMergeGlyph
        variant="output"
        filledStackCount={2}
        loneSquareFilled={false}
      />
    ));
    const filled = container.querySelectorAll("rect[fill^=\"rgb(45 212 191)\"]");
    expect(filled.length).toBe(2);
  });

  it("renders input path arrow only when loneSquareFilled", () => {
    const { container: empty } = render(() => (
      <PortMergeGlyph
        variant="input"
        filledStackCount={0}
        loneSquareFilled={false}
      />
    ));
    expect(empty.querySelectorAll("polyline").length).toBe(0);

    const { container: on } = render(() => (
      <PortMergeGlyph
        variant="input"
        filledStackCount={0}
        loneSquareFilled={true}
      />
    ));
    expect(on.querySelectorAll("polyline").length).toBeGreaterThan(0);
  });
});
