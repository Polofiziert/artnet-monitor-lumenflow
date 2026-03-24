import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import RoutingMatrix, { type RouteInfo } from "./RoutingMatrix";
import type { ArtNetProductDto } from "./DeviceList";

describe("RoutingMatrix naming", () => {
  it("uses long node name with ascending index in headers and tx rows", async () => {
    const products: ArtNetProductDto[] = [
      {
        product_id: "10.0.0.21|001122334455",
        bind_ip: "10.0.0.21",
        ip_address: "10.0.0.21",
        transport_addr: null,
        mac_address: "00:11:22:33:44:55",
        short_name: "Port 2",
        long_name: "Swisson XND-8",
        esta_man: 0,
        oem_code: 0,
        firmware_version: 0,
        node_report: "OK",
        ports: [
          {
            bind_index: 1,
            slot: 0,
            output_universe: 1,
            input_universe: null,
            label: "Port 2",
          },
        ],
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
        esta_man: 0,
        oem_code: 0,
        firmware_version: 0,
        node_report: "OK",
        ports: [
          {
            bind_index: 1,
            slot: 0,
            output_universe: 0,
            input_universe: null,
            label: "Port 1",
          },
        ],
        online: true,
      },
    ];
    const routes: RouteInfo[] = [
      {
        universeId: 0,
        sourceIp: "10.0.0.20",
        packetsPerSecond: 44,
        lastSeen: Date.now(),
      },
    ];

    const [universes] = createSignal([0]);
    const [productsSig] = createSignal(products);
    const [routesSig] = createSignal(routes);

    render(() => (
      <RoutingMatrix
        universes={universes}
        products={productsSig}
        routes={routesSig}
      />
    ));

    // Receiver headers + tx rows use stable node title format.
    expect((await screen.findAllByText("Swisson XND-8 [1]")).length).toBe(1);
    expect((await screen.findAllByText("Swisson XND-8 [2]")).length).toBe(2);
  });
});
