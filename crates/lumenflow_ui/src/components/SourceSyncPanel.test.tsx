import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import SourceSyncPanel from "./SourceSyncPanel";

describe("SourceSyncPanel", () => {
  it("renders source IPs with role labels and ArtSync ACTIVE", async () => {
    const [sourceIps] = createSignal([
      { ip: "10.0.0.10", role: "master" as const },
      { ip: "10.0.0.11", role: "backup" as const },
      { ip: "10.0.0.12", role: "secondary" as const },
    ]);
    const [active] = createSignal(true);

    render(() => <SourceSyncPanel sourceIps={sourceIps} artSyncActive={active} />);

    expect(await screen.findByText("Source IPs")).toBeTruthy();
    expect(screen.getByText("10.0.0.10")).toBeTruthy();
    expect(screen.getByText("Master")).toBeTruthy();
    expect(screen.getByText("Backup (Standby)")).toBeTruthy();
    expect(screen.getByText("Secondary")).toBeTruthy();
    expect(screen.getByText("ACTIVE")).toBeTruthy();
  });

  it("renders ArtSync INACTIVE", () => {
    const [sourceIps] = createSignal([{ ip: "10.0.0.10", role: "master" as const }]);
    const [active] = createSignal(false);
    render(() => <SourceSyncPanel sourceIps={sourceIps} artSyncActive={active} />);
    expect(screen.getByText("INACTIVE")).toBeTruthy();
  });
});

