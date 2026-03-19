import type { Component } from "solid-js";
import { onMount, onCleanup, createSignal, Show } from "solid-js";

interface UniverseHeatmapProps {
  universes: () => number[];
  selectedUniverse: () => number | null;
  onSelect: (id: number) => void;
  universeData?: Record<number, ArrayLike<number>>;
  universeMetrics?: () => Record<
    number,
    { staleness: number; sourceCount: number; sequenceErrors: number }
  >;
  warningUniverses?: () => number[];
}

const CELL_SIZE = 24;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const FRAME_MS = 1000 / 30;

type RGB = [number, number, number];

const THERMAL_STOPS: ReadonlyArray<{ pos: number; rgb: RGB }> = [
  { pos: 0.0, rgb: [0x1a, 0x1a, 0x1a] },
  { pos: 0.05, rgb: [0x1e, 0x3a, 0x5f] },
  { pos: 0.2, rgb: [0x25, 0x63, 0xeb] },
  { pos: 0.4, rgb: [0x22, 0xc5, 0x5e] },
  { pos: 0.6, rgb: [0xea, 0xb3, 0x08] },
  { pos: 0.85, rgb: [0xfb, 0xbf, 0x24] },
  { pos: 1.0, rgb: [0xff, 0xff, 0xff] },
];

function thermalColor(activity: number): string {
  if (activity <= 0) return "#1A1A1A";
  const t = Math.min(1, Math.max(0, activity));
  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const s0 = THERMAL_STOPS[i]!;
    const s1 = THERMAL_STOPS[i + 1]!;
    if (t <= s1.pos) {
      const f = (t - s0.pos) / (s1.pos - s0.pos);
      const r = Math.round(s0.rgb[0] + (s1.rgb[0] - s0.rgb[0]) * f);
      const g = Math.round(s0.rgb[1] + (s1.rgb[1] - s0.rgb[1]) * f);
      const b = Math.round(s0.rgb[2] + (s1.rgb[2] - s0.rgb[2]) * f);
      return `rgb(${r},${g},${b})`;
    }
  }
  return "#FFFFFF";
}

function computeActivity(channels: ArrayLike<number> | undefined): number {
  if (!channels || channels.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < channels.length; i++) {
    total += channels[i] ?? 0;
  }
  return total / (channels.length * 255);
}

function drawWarningTriangle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
): void {
  const half = size / 2;
  const triH = size * 0.866;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - triH * 0.4);
  ctx.lineTo(cx - half, cy + triH * 0.6);
  ctx.lineTo(cx + half, cy + triH * 0.6);
  ctx.closePath();
  ctx.fillStyle = "#F59E0B";
  ctx.fill();
  ctx.fillStyle = "#0B0B0B";
  ctx.font = `bold ${Math.round(size * 0.55)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", cx, cy + 1);
  ctx.restore();
}

interface HoverState {
  universeId: number;
  activity: number;
  mouseX: number;
  mouseY: number;
}

const UniverseMap: Component<UniverseHeatmapProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let rafId: number | undefined;
  let lastFrame = 0;

  const [hover, setHover] = createSignal<HoverState | null>(null);

  function gridLayout(): { cols: number; rows: number } {
    const el = containerRef;
    if (!el) return { cols: 16, rows: 1 };
    const available = el.clientWidth - 32;
    const cols = Math.max(1, Math.floor(available / CELL_STEP));
    const rows = Math.max(1, Math.ceil(props.universes().length / cols));
    return { cols, rows };
  }

  function cellFromMouse(e: MouseEvent): number | null {
    const canvas = canvasRef;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const col = Math.floor(mx / CELL_STEP);
    const row = Math.floor(my / CELL_STEP);
    const { cols } = gridLayout();
    if (col < 0 || col >= cols) return null;
    if (mx - col * CELL_STEP > CELL_SIZE) return null;
    if (my - row * CELL_STEP > CELL_SIZE) return null;
    const idx = row * cols + col;
    const universes = props.universes();
    if (idx < 0 || idx >= universes.length) return null;
    return universes[idx] ?? null;
  }

  function onPointerMove(e: MouseEvent) {
    const id = cellFromMouse(e);
    if (id === null) {
      setHover(null);
      return;
    }
    const box = containerRef?.getBoundingClientRect();
    if (!box) return;
    setHover({
      universeId: id,
      activity: computeActivity(props.universeData?.[id]),
      mouseX: e.clientX - box.left,
      mouseY: e.clientY - box.top,
    });
  }

  function onPointerClick(e: MouseEvent) {
    const id = cellFromMouse(e);
    if (id !== null) props.onSelect(id);
  }

  function draw() {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { cols, rows } = gridLayout();
    const canvasW = cols * CELL_STEP - CELL_GAP;
    const canvasH = rows * CELL_STEP - CELL_GAP;
    if (canvasW <= 0 || canvasH <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasW, canvasH);

    const universes = props.universes();
    const selected = props.selectedUniverse();
    const warnings = new Set(props.warningUniverses?.() ?? []);
    const hoveredId = hover()?.universeId ?? null;
    const showLabels = universes.length <= 128;

    for (let i = 0; i < universes.length; i++) {
      const uni = universes[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * CELL_STEP;
      const y = row * CELL_STEP;
      const activity = computeActivity(props.universeData?.[uni]);

      const needsGlow = activity > 0.8;
      if (needsGlow) {
        ctx.save();
        const intensity = Math.min(1, (activity - 0.8) * 5);
        ctx.shadowColor = `rgba(251,191,36,${(intensity * 0.6).toFixed(2)})`;
        ctx.shadowBlur = 10;
      }

      ctx.fillStyle = thermalColor(activity);
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

      if (needsGlow) ctx.restore();

      if (uni === selected) {
        ctx.strokeStyle = "#2DD4BF";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }

      if (uni === hoveredId && uni !== selected) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
      }

      if (warnings.has(uni)) {
        drawWarningTriangle(ctx, x + CELL_SIZE - 6, y + 6, 9);
      }

      if (showLabels) {
        ctx.fillStyle = activity > 0.5 ? "#0B0B0B" : "#A3A3A3";
        ctx.font = "9px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${uni}`, x + CELL_SIZE / 2, y + CELL_SIZE / 2);
      }
    }
  }

  onMount(() => {
    let running = true;
    function tick(ts: number) {
      if (!running) return;
      if (ts - lastFrame >= FRAME_MS) {
        lastFrame = ts;
        draw();
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    onCleanup(() => {
      running = false;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    });
  });

  return (
    <div
      ref={containerRef}
      data-testid="universe-map"
      class="relative rounded-lg border border-edge bg-surface p-4"
    >
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-medium tracking-wide uppercase text-secondary">
          Universe Heatmap
        </h2>
        <span class="text-[10px] text-muted font-mono">
          {props.universes().length} active
        </span>
      </div>

      <Show
        when={props.universes().length > 0}
        fallback={
          <div class="flex h-24 items-center justify-center text-xs text-muted">
            <div class="text-center">
              <div class="mb-1">No active universes detected</div>
              <div class="text-[10px]">Send Art-Net data to port 6454</div>
            </div>
          </div>
        }
      >
        <canvas
          ref={canvasRef}
          class="cursor-pointer"
          onMouseMove={onPointerMove}
          onClick={onPointerClick}
          onMouseLeave={() => setHover(null)}
        />

        <Show when={hover()}>
          {(info) => (
            <div
              class="pointer-events-none absolute z-10 rounded border border-edge bg-obsidian/95 px-2.5 py-1 text-[10px] font-mono shadow-lg"
              style={{
                left: `${Math.min(info().mouseX + 14, (containerRef?.clientWidth ?? 200) - 110)}px`,
                top: `${Math.max(info().mouseY - 34, 4)}px`,
              }}
            >
              <span class="text-primary">Uni {info().universeId}</span>
              <span class="ml-2 text-teal">
                {Math.round(info().activity * 100)}%
              </span>
            </div>
          )}
        </Show>

        <div class="mt-3 flex items-center gap-2 text-[10px] text-muted">
          <span>Activity</span>
          <span>0%</span>
          <div
            class="h-2 w-28 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, #1A1A1A, #1E3A5F, #2563EB, #22C55E, #EAB308, #FBBF24, #FFF)",
            }}
          />
          <span>100%</span>
        </div>
      </Show>
    </div>
  );
};

export default UniverseMap;
