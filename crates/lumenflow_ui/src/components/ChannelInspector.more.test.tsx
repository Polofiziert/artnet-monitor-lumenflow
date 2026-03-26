import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

// Mock the heavy canvas grid to deterministically drive hover/select.
vi.mock("./DmxGridCanvas", () => {
  return {
    default: (props: any) => (
      <div>
        <button
          data-testid="mock-hover"
          onClick={() => props.onHover(0)}
          type="button"
        >
          hover0
        </button>
        <button
          data-testid="mock-select"
          onClick={() => props.onSelect(1)}
          type="button"
        >
          select1
        </button>
      </div>
    ),
  };
});

// Mock Sparkline (not relevant to formatting assertions).
vi.mock("./Sparkline", () => ({ default: () => <div data-testid="spark" /> }));

// Mock theme hook to avoid localStorage/matchMedia coupling.
vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({ effective: () => "dark" as const }),
}));

import ChannelInspector from "./ChannelInspector";

describe("ChannelInspector formatting and origin", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("renders port address and active channel summary", async () => {
    const channels = Array.from({ length: 512 }, () => 0);
    channels[0] = 10;
    channels[5] = 1;
    const [ch] = createSignal(channels);

    render(() => <ChannelInspector universeId={0x0102} channels={ch} />);

    expect(await screen.findByText(/Universe/)).toBeTruthy();
    // 0x0102 => net=1 sub=0 uni=2
    expect(screen.getByText("1:0:2")).toBeTruthy();
    const active = screen.getByTitle("Count of channels with a non-zero value");
    expect(active.textContent).toContain("2");
  });

  it("shows detail popover with hex/binary/percent formatting and origin info", async () => {
    const channels = Array.from({ length: 512 }, () => 0);
    channels[1] = 255;
    const [ch] = createSignal(channels);
    const [fmt, setFmt] = createSignal<"hex" | "binary" | "percent">("hex");
    const [origin] = createSignal({ sourceIp: "10.0.0.9", mergeMode: "HTP" as const });

    render(() => (
      <ChannelInspector
        universeId={1}
        channels={ch}
        channelValueFormat={fmt}
        dataOrigin={origin}
      />
    ));

    fireEvent.click(screen.getByTestId("mock-select"));

    // value for channel 2 (index 1) is 255
    expect(await screen.findByText("255")).toBeTruthy();
    expect(screen.getByText("0xFF")).toBeTruthy();
    expect(screen.getByText("10.0.0.9")).toBeTruthy();
    expect(screen.getByText("HTP")).toBeTruthy();

    setFmt("binary");
    expect(await screen.findByText("11111111")).toBeTruthy();

    setFmt("percent");
    expect(await screen.findByText("100 %")).toBeTruthy();
  });
});

