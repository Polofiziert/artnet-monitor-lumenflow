import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import DeviceList, { type ArtNetProductDto } from "./DeviceList";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

describe("DeviceList extra coverage", () => {
  it("shows protocol tab details for selected device", async () => {
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
    render(() => <DeviceList products={products} />);

    // Select the device row.
    fireEvent.click(await screen.findByText(/Node Long/));
    // Switch to protocol tab.
    fireEvent.click(screen.getByText("protocol"));
    expect(await screen.findByText(/ports_merged:/)).toBeTruthy();
    expect(screen.getByText(/node_report:/)).toBeTruthy();
  });

  it("opens manual add dialog, validates, submits and closes", async () => {
    const onAddManualDevice = vi.fn();
    const [products] = createSignal<ArtNetProductDto[]>([]);

    render(() => (
      <DeviceList products={products} onAddManualDevice={onAddManualDevice} />
    ));

    fireEvent.click(await screen.findByTestId("add-device-manually"));
    await screen.findByRole("dialog", {
      name: "Add device manually",
    });

    const submit = screen.getByTestId("add-device-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.input(screen.getByTestId("add-device-ip"), {
      target: { value: "192.168.0.5" },
    });
    fireEvent.input(screen.getByTestId("add-device-name"), {
      target: { value: "FOH Node" },
    });
    expect((screen.getByTestId("add-device-submit") as HTMLButtonElement).disabled).toBe(
      false
    );

    fireEvent.click(screen.getByTestId("add-device-submit"));
    expect(onAddManualDevice).toHaveBeenCalledWith("192.168.0.5", "FOH Node");

    // Dialog should be gone.
    expect(screen.queryByRole("dialog", { name: "Add device manually" })).toBeNull();

    // Re-open and close via backdrop click and Escape.
    fireEvent.click(await screen.findByTestId("add-device-manually"));
    const dialog2 = await screen.findByRole("dialog", {
      name: "Add device manually",
    });
    fireEvent.click(dialog2); // backdrop click
    expect(screen.queryByRole("dialog", { name: "Add device manually" })).toBeNull();

    fireEvent.click(await screen.findByTestId("add-device-manually"));
    const dialog3 = await screen.findByRole("dialog", {
      name: "Add device manually",
    });
    fireEvent.keyDown(dialog3, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Add device manually" })).toBeNull();
  });
});

