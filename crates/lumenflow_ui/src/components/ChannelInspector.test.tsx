/**
 * B2 layout-stability test: channel detail is an overlay and does not affect grid layout.
 * When detail is shown (hover/select), the grid container width must not change.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import ChannelInspector from "./ChannelInspector";
import { ThemeProvider } from "../hooks/useTheme";

const MOCK_CHANNELS = new Array(512).fill(0) as number[];

describe("ChannelInspector", () => {
  it("renders grid wrapper as the only flex child so layout is stable (B2)", () => {
    const [channels] = createSignal<number[]>(MOCK_CHANNELS);
    render(() => (
      <ThemeProvider>
        <ChannelInspector universeId={0} channels={channels} />
      </ThemeProvider>
    ));

    const gridWrapper = screen.getByTestId("channel-inspector-grid-wrapper");
    expect(gridWrapper).toBeTruthy();
    expect(gridWrapper.classList.contains("flex-1")).toBe(true);
    expect(gridWrapper.classList.contains("min-w-0")).toBe(true);

    // Detail is not a flex sibling of the grid — it lives in FloatingPopover as overlay sibling.
    const relativeParent = gridWrapper.closest(".relative");
    expect(relativeParent).toBeTruthy();
    const flexContainer = relativeParent?.querySelector(".flex.gap-4");
    expect(flexContainer).toBeTruthy();
    // Single flex child: the grid wrapper (detail is in overlay, not in this flex).
    const flexChildren = flexContainer?.children ?? [];
    expect(flexChildren.length).toBe(1);
    expect(flexChildren[0]?.getAttribute("data-testid")).toBe(
      "channel-inspector-grid-wrapper"
    );
  });

  it("reserves a fixed-width flicker slot with no flicker so header metrics do not shift", () => {
    const [channels] = createSignal<number[]>(MOCK_CHANNELS);
    render(() => (
      <ThemeProvider>
        <ChannelInspector universeId={0} channels={channels} />
      </ThemeProvider>
    ));

    const slot = screen.getByTestId("channel-inspector-header-flicker-slot");
    expect(slot).toBeTruthy();
    expect(slot.classList.contains("w-[13ch]")).toBe(true);
  });

  it("shows floating popover only when detail channel is set", () => {
    const [channels] = createSignal<number[]>(MOCK_CHANNELS);
    render(() => (
      <ThemeProvider>
        <ChannelInspector universeId={0} channels={channels} />
      </ThemeProvider>
    ));

    // With no hover/select, popover should not be visible (no data-testid="floating-popover" in DOM when show=false).
    const popover = document.querySelector("[data-testid='floating-popover']");
    expect(popover).toBeNull();
  });
});
