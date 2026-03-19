/**
 * B2 layout-stability test: channel detail is an overlay and does not affect grid layout.
 * When detail is shown (hover/select), the grid container width must not change.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import ChannelInspector from "./ChannelInspector";

const MOCK_CHANNELS = new Array(512).fill(0) as number[];

describe("ChannelInspector", () => {
  it("renders grid wrapper as the only flex child so layout is stable (B2)", () => {
    const [channels, setChannels] = createSignal<number[]>(MOCK_CHANNELS);
    render(() => <ChannelInspector universeId={0} channels={channels} />);

    const gridWrapper = screen.getByTestId("channel-inspector-grid-wrapper");
    expect(gridWrapper).toBeInTheDocument();
    expect(gridWrapper).toHaveClass("flex-1", "min-w-0");

    // Detail is not a flex sibling of the grid — it lives in FloatingPopover as overlay sibling.
    const relativeParent = gridWrapper.closest(".relative");
    expect(relativeParent).toBeInTheDocument();
    const flexContainer = relativeParent?.querySelector(".flex.gap-4");
    expect(flexContainer).toBeInTheDocument();
    // Single flex child: the grid wrapper (detail is in overlay, not in this flex).
    const flexChildren = flexContainer?.children ?? [];
    expect(flexChildren.length).toBe(1);
    expect(flexChildren[0]).toHaveAttribute(
      "data-testid",
      "channel-inspector-grid-wrapper"
    );
  });

  it("shows floating popover only when detail channel is set", () => {
    const [channels] = createSignal<number[]>(MOCK_CHANNELS);
    render(() => <ChannelInspector universeId={0} channels={channels} />);

    // With no hover/select, popover should not be visible (no data-testid="floating-popover" in DOM when show=false).
    const popover = document.querySelector("[data-testid='floating-popover']");
    expect(popover).toBeNull();
  });
});
