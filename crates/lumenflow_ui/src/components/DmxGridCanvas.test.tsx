import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  clampByte,
  cellFromPoint,
  drawDmxGrid,
  gridMetrics,
} from "./DmxGridCanvas";

function makeMockCtx() {
  return {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    // writable style props:
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("DmxGridCanvas helpers", () => {
  const origDpr = (window as any).devicePixelRatio;

  beforeEach(() => {
    (window as any).devicePixelRatio = 1;
  });

  afterEach(() => {
    (window as any).devicePixelRatio = origDpr;
  });

  it("clampByte clamps and truncates", () => {
    expect(clampByte(-5)).toBe(0);
    expect(clampByte(300)).toBe(255);
    expect(clampByte(12.9)).toBe(12);
  });

  it("gridMetrics computes consistent rows and dimensions", () => {
    const m = gridMetrics({ cols: 16, containerWidth: 320 });
    expect(m.rows).toBe(32);
    expect(m.totalH).toBeGreaterThan(0);
    expect(m.cellW).toBeGreaterThan(0);
    expect(m.slotW).toBeGreaterThan(0);
  });

  it("cellFromPoint maps to channel index inside first cell", () => {
    const ch0 = cellFromPoint({
      clientX: 2,
      clientY: 2,
      rectLeft: 0,
      rectTop: 0,
      containerWidth: 320,
      cols: 16,
    });
    expect(ch0).toBe(0);
  });

  it("drawDmxGrid renders passes and emits labels/values", () => {
    const ctx = makeMockCtx();
    const canvas = {
      width: 0,
      height: 0,
      style: { width: "", height: "" },
    } as unknown as HTMLCanvasElement;

    const channels = Array.from({ length: 512 }, (_, i) => (i % 256) | 0);
    const hist = new Float32Array(64);
    hist[63] = 255;

    drawDmxGrid({
      ctx,
      canvas,
      containerWidth: 640,
      universeId: 1,
      cols: 32,
      channels,
      flicker: new Set([3]),
      hovered: 0,
      selected: 1,
      resolvedTheme: "dark",
      getHistory: () => hist,
    });

    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
