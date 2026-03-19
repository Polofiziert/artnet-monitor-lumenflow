import type { Component } from "solid-js";
import { onMount, onCleanup } from "solid-js";

interface SparkDmxCellProps {
  channel: number;
  value: () => number;
  history: () => Float32Array | null;
  isFlickering?: () => boolean;
  isHovered?: () => boolean;
  isSelected?: () => boolean;
  onHover?: () => void;
  onLeave?: () => void;
  onClick?: () => void;
}

// Precomputed 256-entry color table: gray(0) → dim teal → full teal → white(255)
const HEAT_COLORS: string[] = (() => {
  const colors = new Array<string>(256);
  colors[0] = "#525252";

  for (let i = 1; i < 128; i++) {
    const t = i / 127;
    const r = Math.round(30 + t * 15);
    const g = Math.round(140 + t * 72);
    const b = Math.round(130 + t * 61);
    colors[i] = `rgb(${r},${g},${b})`;
  }

  for (let i = 128; i < 255; i++) {
    const t = (i - 128) / 126;
    const r = Math.round(45 + t * 184);
    const g = Math.round(212 + t * 17);
    const b = Math.round(191 + t * 38);
    colors[i] = `rgb(${r},${g},${b})`;
  }

  colors[255] = "#FFFFFF";
  return colors;
})();

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

const SparkDmxCell: Component<SparkDmxCellProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let rafId: number | undefined;
  let frameCount = 0;
  const frameOffset = props.channel % 4;

  function draw() {
    const canvas = canvasRef;
    const container = containerRef;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const values = props.history();
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const pw = (w * dpr) | 0;
    const ph = (h * dpr) | 0;
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!values || values.length === 0) return;

    const len = values.length;
    const stepX = w / (len - 1 || 1);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < len; i++) {
      const x = i * stepX;
      const y = h - (values[i]! / 255) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = "rgba(45,212,191,0.12)";
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = i * stepX;
      const y = h - (values[i]! / 255) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(45,212,191,0.30)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  onMount(() => {
    let running = true;
    function tick() {
      if (!running) return;
      frameCount++;
      if ((frameCount + frameOffset) % 4 === 0) draw();
      rafId = requestAnimationFrame(tick);
    }
    tick();
    onCleanup(() => {
      running = false;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    });
  });

  const flickering = () => props.isFlickering?.() ?? false;
  const hovered = () => props.isHovered?.() ?? false;
  const selected = () => props.isSelected?.() ?? false;

  return (
    <div
      ref={containerRef}
      data-testid={`dmx-cell-${props.channel}`}
      class="relative h-9 w-full overflow-hidden bg-obsidian select-none cursor-pointer transition-colors duration-75"
      classList={{
        "ring-1 ring-amber/60 shadow-[0_0_6px_#F59E0B44]":
          flickering() && !hovered() && !selected(),
        "ring-1 ring-teal/40 bg-teal/5 z-10": hovered() && !selected(),
        "ring-1 ring-teal/60 bg-teal/10 z-20": selected(),
      }}
      onMouseEnter={props.onHover}
      onMouseLeave={props.onLeave}
      onClick={props.onClick}
      title={`Ch ${props.channel}: ${props.value()}`}
    >
      <canvas
        ref={canvasRef}
        class="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      />
      <span class="absolute top-px left-0.5 z-10 text-[8px] leading-none text-muted/60">
        {props.channel}
      </span>
      <span
        class="absolute inset-0 z-10 flex items-center justify-center text-xs font-mono tabular-nums leading-none"
        classList={{ "font-semibold": props.value() >= 240 }}
        style={{
          color: HEAT_COLORS[clampByte(props.value())],
          "text-shadow":
            props.value() >= 240 ? "0 0 4px rgba(45,212,191,0.5)" : undefined,
        }}
      >
        {props.value()}
      </span>
    </div>
  );
};

export default SparkDmxCell;
