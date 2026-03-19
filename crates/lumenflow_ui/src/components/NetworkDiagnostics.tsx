import type { Component } from "solid-js";
import { onMount, onCleanup } from "solid-js";
import JitterHistogram from "./JitterHistogram";

interface NetworkDiagnosticsProps {
  networkLoadMbps: () => number[];
  jitterSamples: () => number[];
}

const FRAME_MS = 1000 / 15;
const LABEL_COLOR = "#A3A3A3";
const BG = "#0B0B0B";
const AXIS_COLOR = "#1F1F1F";

const PAD_L = 44;
const PAD_R = 10;
const PAD_T = 28;
const PAD_B = 32;

const BAND_COLORS = [
  "rgba(30,58,95,0.85)",
  "rgba(45,212,191,0.7)",
  "rgba(34,197,94,0.65)",
];

const HorizonChart: Component<{ data: () => number[] }> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let rafId: number | undefined;
  let lastFrame = 0;

  function draw() {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = 200;
    if (width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    const data = props.data();
    if (data.length < 2) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No data", width / 2, height / 2);
      return;
    }

    // Title
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Network Load (Mbps)", width / 2, 16);

    const plotW = width - PAD_L - PAD_R;
    const plotH = height - PAD_T - PAD_B;

    let maxVal = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i]! > maxVal) maxVal = data[i]!;
    }
    maxVal = Math.max(1, Math.ceil(maxVal));

    const bandCount = BAND_COLORS.length;
    const bandHeight = maxVal / bandCount;

    // Horizon chart: each band is folded back to the baseline
    for (let band = 0; band < bandCount; band++) {
      const bandMin = band * bandHeight;

      ctx.beginPath();
      ctx.moveTo(PAD_L, PAD_T + plotH);

      for (let i = 0; i < data.length; i++) {
        const x = PAD_L + (i / Math.max(1, data.length - 1)) * plotW;
        const val = data[i]!;
        const bandVal = Math.max(0, Math.min(bandHeight, val - bandMin));
        const y = PAD_T + plotH - (bandVal / bandHeight) * plotH;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(PAD_L + plotW, PAD_T + plotH);
      ctx.closePath();
      ctx.fillStyle = BAND_COLORS[band]!;
      ctx.fill();
    }

    // Top-line stroke for visual clarity
    ctx.beginPath();
    ctx.strokeStyle = "rgba(45,212,191,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < data.length; i++) {
      const x = PAD_L + (i / Math.max(1, data.length - 1)) * plotW;
      const normed = Math.min(1, data[i]! / maxVal);
      const y = PAD_T + plotH - normed * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axes
    ctx.beginPath();
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1;
    ctx.moveTo(PAD_L, PAD_T);
    ctx.lineTo(PAD_L, PAD_T + plotH);
    ctx.lineTo(PAD_L + plotW, PAD_T + plotH);
    ctx.stroke();

    // Y labels
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "9px system-ui";
    ctx.textAlign = "right";
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const val = (i / yTicks) * maxVal;
      const y = PAD_T + plotH - (i / yTicks) * plotH;
      ctx.fillText(val.toFixed(1), PAD_L - 6, y + 3);
    }

    // X labels
    ctx.textAlign = "center";
    ctx.fillText("now", PAD_L + plotW, PAD_T + plotH + 14);
    ctx.fillText(`-${data.length}s`, PAD_L, PAD_T + plotH + 14);
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
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "200px", display: "block" }}
    />
  );
};

const NetworkDiagnostics: Component<NetworkDiagnosticsProps> = (props) => {
  return (
    <div class="rounded-lg border border-edge bg-surface p-4">
      <h2 class="text-sm font-medium tracking-wide uppercase text-secondary mb-3">
        Network Diagnostics
      </h2>
      <div class="flex gap-4">
        <div class="flex-1 min-w-0">
          <HorizonChart data={props.networkLoadMbps} />
        </div>
        <div class="flex-1 min-w-0">
          <JitterHistogram samples={props.jitterSamples} height={200} />
        </div>
      </div>

      <div class="mt-3 flex items-center gap-4 text-[10px] text-muted">
        <div class="flex items-center gap-1.5">
          <span
            class="inline-block h-2 w-2 rounded-sm"
            style={{ background: "rgba(30,58,95,0.85)" }}
          />
          <span>Low</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span
            class="inline-block h-2 w-2 rounded-sm"
            style={{ background: "rgba(45,212,191,0.7)" }}
          />
          <span>Medium</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span
            class="inline-block h-2 w-2 rounded-sm"
            style={{ background: "rgba(34,197,94,0.65)" }}
          />
          <span>High</span>
        </div>
      </div>
    </div>
  );
};

export default NetworkDiagnostics;
