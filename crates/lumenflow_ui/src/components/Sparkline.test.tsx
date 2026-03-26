import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import Sparkline from "./Sparkline";

function makeMockCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    scale: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    // writable style props:
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineJoin: "",
    lineCap: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("Sparkline", () => {
  const origRaf = globalThis.requestAnimationFrame;
  const origCaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    const ctx = makeMockCtx();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx);
    vi.stubGlobal("devicePixelRatio", 1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCaf;
  });

  it("draws when data is present and bgColor is not transparent", () => {
    const [data] = createSignal(new Float32Array([0, 128, 255]));
    const rafCbs: Array<(ts: number) => void> = [];
    globalThis.requestAnimationFrame = vi.fn((cb: (ts: number) => void) => {
      rafCbs.push(cb);
      return rafCbs.length;
    }) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn() as unknown as typeof cancelAnimationFrame;

    render(() => (
      <Sparkline data={data} width={40} height={10} bgColor="#111111" />
    ));

    // Drive one frame at >= FRAME_MS to force draw.
    expect(rafCbs.length).toBeGreaterThan(0);
    rafCbs[0]!(100);

    // Canvas background + stroke path should have been touched.
    const getCtx = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<
      typeof vi.fn
    >;
    const usedCtx = getCtx.mock.results[0]!.value as ReturnType<typeof makeMockCtx>;
    expect(usedCtx.fillRect).toHaveBeenCalled();
    expect(usedCtx.stroke).toHaveBeenCalled();
    expect(usedCtx.fill).toHaveBeenCalled();
  });

  it("does not stroke when data is null", () => {
    const [data] = createSignal<Float32Array | null>(null);
    const rafCbs: Array<(ts: number) => void> = [];
    globalThis.requestAnimationFrame = vi.fn((cb: (ts: number) => void) => {
      rafCbs.push(cb);
      return rafCbs.length;
    }) as unknown as typeof requestAnimationFrame;

    render(() => <Sparkline data={data} />);
    rafCbs[0]!(100);

    const getCtx = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<
      typeof vi.fn
    >;
    const usedCtx = getCtx.mock.results[0]!.value as ReturnType<typeof makeMockCtx>;
    expect(usedCtx.stroke).not.toHaveBeenCalled();
  });
});

