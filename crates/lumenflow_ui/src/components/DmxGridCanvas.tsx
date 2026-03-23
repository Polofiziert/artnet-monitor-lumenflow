import type { Component } from "solid-js";
import { onMount, onCleanup } from "solid-js";
import { globalHistory } from "../lib/channelHistory";
import {
  getDmxCanvasPalette,
  type ResolvedTheme,
} from "../lib/themePalette";

interface DmxGridCanvasProps {
  channels: () => ArrayLike<number> | undefined;
  universeId: number;
  gridCols: () => 16 | 32;
  flickeringSet: () => Set<number>;
  hoveredChannel: () => number | null;
  selectedChannel: () => number | null;
  onHover: (ch: number | null) => void;
  onSelect: (ch: number | null) => void;
  resolvedTheme: () => ResolvedTheme;
}

const CHANNEL_COUNT = 512;
const CELL_HEIGHT = 36;
const GAP = 1;
const HIST_LEN = 64;
const HIST_STEP = HIST_LEN - 1;

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

const DmxGridCanvas: Component<DmxGridCanvasProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | undefined;
  let frameCount = 0;
  let containerWidth = 0;

  function gridMetrics() {
    const cols = props.gridCols();
    const rows = CHANNEL_COUNT / cols;
    const cellW = (containerWidth - (cols - 1) * GAP) / cols;
    const totalH = rows * CELL_HEIGHT + (rows - 1) * GAP;
    const slotW = cellW + GAP;
    const slotH = CELL_HEIGHT + GAP;
    return { cols, rows, cellW, totalH, slotW, slotH };
  }

  function cellFromMouse(e: MouseEvent): number | null {
    if (!canvasRef || containerWidth <= 0) return null;
    const rect = canvasRef.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { cols, rows, cellW, slotW, slotH } = gridMetrics();
    const col = Math.floor(mx / slotW);
    const row = Math.floor(my / slotH);

    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;

    const localX = mx - col * slotW;
    const localY = my - row * slotH;
    if (localX > cellW || localY > CELL_HEIGHT) return null;

    const ch = row * cols + col;
    return ch >= 0 && ch < CHANNEL_COUNT ? ch : null;
  }

  function handleMouseMove(e: MouseEvent) {
    props.onHover(cellFromMouse(e));
  }

  function handleMouseLeave() {
    props.onHover(null);
  }

  function handleClick(e: MouseEvent) {
    const ch = cellFromMouse(e);
    if (ch === null) {
      props.onSelect(null);
      return;
    }
    props.onSelect(props.selectedChannel() === ch ? null : ch);
  }

  function draw() {
    if (!ctx || !canvasRef || containerWidth <= 0) return;

    const palette = getDmxCanvasPalette(props.resolvedTheme());
    const HEAT_COLORS = palette.heatColors;
    const BG_COLOR = palette.bg;
    const GAP_COLOR = palette.gap;
    const HOVER_RING = palette.hoverRing;
    const SELECTED_RING = palette.selectedRing;
    const FLICKER_RING = palette.flickerRing;
    const FLICKER_SHADOW = palette.flickerShadow;
    const SPARK_FILL = palette.sparkFill;
    const SPARK_STROKE = palette.sparkStroke;
    const LABEL_COLOR = palette.label;
    const GLOW_COLOR = palette.glow;
    const HOVER_BG = palette.hoverBg;
    const SELECTED_BG = palette.selectedBg;

    const { cols, cellW, totalH, slotW, slotH } = gridMetrics();

    const dpr = window.devicePixelRatio || 1;
    const pw = (containerWidth * dpr) | 0;
    const ph = (totalH * dpr) | 0;

    if (canvasRef.width !== pw || canvasRef.height !== ph) {
      canvasRef.width = pw;
      canvasRef.height = ph;
      canvasRef.style.width = `${containerWidth}px`;
      canvasRef.style.height = `${totalH}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = GAP_COLOR;
    ctx.fillRect(0, 0, containerWidth, totalH);

    const channels = props.channels();
    const flicker = props.flickeringSet();
    const hovered = props.hoveredChannel();
    const selected = props.selectedChannel();
    const sparkStepX = cellW / HIST_STEP;
    const uId = props.universeId;

    // --- Pass 1: Backgrounds, sparklines, rings ---
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const col = ch % cols;
      const row = (ch / cols) | 0;
      const x = col * slotW;
      const y = row * slotH;
      const isHovered = hovered === ch;
      const isSelected = selected === ch;

      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(x, y, cellW, CELL_HEIGHT);

      if (isSelected) {
        ctx.fillStyle = SELECTED_BG;
        ctx.fillRect(x, y, cellW, CELL_HEIGHT);
      } else if (isHovered) {
        ctx.fillStyle = HOVER_BG;
        ctx.fillRect(x, y, cellW, CELL_HEIGHT);
      }

      // Sparkline
      const hist = globalHistory.getHistory(uId, ch);
      if (hist) {
        const bottom = y + CELL_HEIGHT;

        ctx.beginPath();
        ctx.moveTo(x, bottom);
        for (let i = 0; i < HIST_LEN; i++) {
          ctx.lineTo(
            x + i * sparkStepX,
            bottom - (hist[i]! / 255) * CELL_HEIGHT
          );
        }
        ctx.lineTo(x + cellW, bottom);
        ctx.closePath();
        ctx.fillStyle = SPARK_FILL;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x, bottom - (hist[0]! / 255) * CELL_HEIGHT);
        for (let i = 1; i < HIST_LEN; i++) {
          ctx.lineTo(
            x + i * sparkStepX,
            bottom - (hist[i]! / 255) * CELL_HEIGHT
          );
        }
        ctx.strokeStyle = SPARK_STROKE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Rings — drawn per-cell to layer above sparklines
      if (isSelected) {
        ctx.strokeStyle = SELECTED_RING;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, CELL_HEIGHT - 1);
      } else if (isHovered) {
        ctx.strokeStyle = HOVER_RING;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, CELL_HEIGHT - 1);
      } else if (flicker.has(ch)) {
        ctx.shadowColor = FLICKER_SHADOW;
        ctx.shadowBlur = 6;
        ctx.strokeStyle = FLICKER_RING;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, CELL_HEIGHT - 1);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }
    }

    // --- Pass 2: Channel labels (one font switch) ---
    ctx.font = "8px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const col = ch % cols;
      const row = (ch / cols) | 0;
      ctx.fillText(String(ch + 1), col * slotW + 2, row * slotH + 1);
    }

    // --- Pass 3: Normal DMX values (one font, no glow) ---
    ctx.font = "11px ui-monospace, 'SF Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const val = channels?.[ch] ?? 0;
      const clamped = clampByte(val);
      if (clamped >= 240) continue;

      const col = ch % cols;
      const row = (ch / cols) | 0;
      ctx.fillStyle = HEAT_COLORS[clamped]!;
      ctx.fillText(
        String(val),
        col * slotW + cellW * 0.5,
        row * slotH + CELL_HEIGHT * 0.5
      );
    }

    // --- Pass 4: High-intensity values (bold font + glow) ---
    ctx.font = "600 11px ui-monospace, 'SF Mono', monospace";
    ctx.shadowColor = GLOW_COLOR;
    ctx.shadowBlur = 4;

    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const val = channels?.[ch] ?? 0;
      const clamped = clampByte(val);
      if (clamped < 240) continue;

      const col = ch % cols;
      const row = (ch / cols) | 0;
      ctx.fillStyle = HEAT_COLORS[clamped]!;
      ctx.fillText(
        String(val),
        col * slotW + cellW * 0.5,
        row * slotH + CELL_HEIGHT * 0.5
      );
    }

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  onMount(() => {
    if (!canvasRef || !containerRef) return;
    ctx = canvasRef.getContext("2d", { alpha: false });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth = entry.contentRect.width;
      }
    });
    ro.observe(containerRef);

    let running = true;

    function tick() {
      if (!running) return;
      frameCount++;
      if (frameCount % 3 === 0) draw();
      rafId = requestAnimationFrame(tick);
    }
    tick();

    onCleanup(() => {
      running = false;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      ro.disconnect();
    });
  });

  return (
    <div
      ref={containerRef}
      class="rounded-md border border-edge overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        class="cursor-pointer block"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
    </div>
  );
};

export default DmxGridCanvas;
