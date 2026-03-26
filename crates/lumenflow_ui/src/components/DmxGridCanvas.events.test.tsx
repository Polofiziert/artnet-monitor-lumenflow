import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import DmxGridCanvas from "./DmxGridCanvas";

describe("DmxGridCanvas event handlers", () => {
  const origRO = window.ResizeObserver;
  const origRaf = window.requestAnimationFrame;
  const origCaf = window.cancelAnimationFrame;

  beforeEach(() => {
    // Minimal stubs so onMount doesn't crash in jsdom.
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    window.requestAnimationFrame = vi.fn(
      () => 1
    ) as unknown as typeof requestAnimationFrame;
    window.cancelAnimationFrame =
      vi.fn() as unknown as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    window.ResizeObserver = origRO;
    window.requestAnimationFrame = origRaf;
    window.cancelAnimationFrame = origCaf;
    vi.restoreAllMocks();
  });

  it("calls onHover/onSelect with null when grid is not measurable yet", () => {
    const onHover = vi.fn();
    const onSelect = vi.fn();
    const [hovered] = createSignal<number | null>(null);
    const [selected] = createSignal<number | null>(null);
    const [channels] = createSignal(Array.from({ length: 512 }, () => 0));

    const r = render(() => (
      <DmxGridCanvas
        channels={channels}
        universeId={1}
        gridCols={() => 16}
        flickeringSet={() => new Set<number>()}
        hoveredChannel={hovered}
        selectedChannel={selected}
        onHover={onHover}
        onSelect={onSelect}
        resolvedTheme={() => "dark"}
      />
    ));

    const canvas = r.container.querySelector("canvas")!;
    fireEvent.mouseMove(canvas, { clientX: 2, clientY: 2 });
    fireEvent.click(canvas, { clientX: 2, clientY: 2 });
    fireEvent.mouseLeave(canvas);

    expect(onHover).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalled();
  });
});
