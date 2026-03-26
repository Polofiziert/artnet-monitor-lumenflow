import type { Component } from "solid-js";
import { onMount, onCleanup } from "solid-js";
import { getJitterChartPalette, type ResolvedTheme } from "../lib/themePalette";

interface JitterHistogramProps {
  samples: () => number[];
  width?: number;
  height?: number;
  resolvedTheme: () => ResolvedTheme;
}

const FRAME_MS = 1000 / 15;
const BIN_COUNT = 20;

const PAD_LEFT = 40;
const PAD_RIGHT = 15;
const PAD_TOP = 30;
const PAD_BOTTOM = 35;

function computeStats(samples: number[]): {
  mean: number;
  stddev: number;
  min: number;
  max: number;
} {
  const n = samples.length;
  let sum = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    sum += v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = samples[i]! - mean;
    variance += d * d;
  }
  return { mean, stddev: Math.sqrt(variance / n), min: lo, max: hi };
}

function buildBins(
  samples: number[],
  binMin: number,
  binMax: number
): { bins: number[]; binWidth: number; maxBin: number } {
  const binWidth = (binMax - binMin) / BIN_COUNT;
  const bins: number[] = new Array(BIN_COUNT).fill(0) as number[];
  for (let i = 0; i < samples.length; i++) {
    let idx = Math.floor((samples[i]! - binMin) / binWidth);
    if (idx >= BIN_COUNT) idx = BIN_COUNT - 1;
    if (idx < 0) idx = 0;
    bins[idx]!++;
  }
  let maxBin = 1;
  for (let i = 0; i < BIN_COUNT; i++) {
    if (bins[i]! > maxBin) maxBin = bins[i]!;
  }
  return { bins, binWidth, maxBin };
}

const JitterHistogram: Component<JitterHistogramProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let rafId: number | undefined;
  let lastFrame = 0;

  const fixedH = () => props.height ?? 200;

  function draw() {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = props.width ?? canvas.clientWidth;
    const height = fixedH();
    if (width <= 0) return;

    const P = getJitterChartPalette(props.resolvedTheme());
    const LABEL_COLOR = P.label;
    const TEAL = P.teal;
    const AMBER = P.amber;
    const BG = P.bg;
    const AXIS_COLOR = P.axis;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    if (props.width !== undefined) {
      canvas.style.width = `${width}px`;
    }
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);

    const samples = props.samples();
    if (samples.length < 2) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No data", width / 2, height / 2);
      return;
    }

    const { mean, stddev, min, max } = computeStats(samples);
    const safeStddev = Math.max(stddev, 0.01);
    const binMin = Math.floor(min) - 1;
    const binMax = Math.ceil(max) + 1;
    const { bins, binWidth, maxBin } = buildBins(samples, binMin, binMax);

    const plotW = width - PAD_LEFT - PAD_RIGHT;
    const plotH = height - PAD_TOP - PAD_BOTTOM;

    // Title
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Inter-Packet Arrival Time (ms)", width / 2, 16);

    // Bars
    const barGap = 1;
    const barW = plotW / BIN_COUNT - barGap;

    for (let i = 0; i < BIN_COUNT; i++) {
      const count = bins[i]!;
      if (count === 0) continue;
      const barH = (count / maxBin) * plotH;
      const x = PAD_LEFT + i * (barW + barGap);
      const y = PAD_TOP + plotH - barH;

      const binCenter = binMin + (i + 0.5) * binWidth;
      const isOutlier = Math.abs(binCenter - mean) > 2 * safeStddev;

      ctx.fillStyle = isOutlier ? AMBER : TEAL;
      ctx.fillRect(x, y, barW, barH);
    }

    // Gaussian curve overlay (scaled to match histogram counts)
    const scaleFactor = samples.length * binWidth;
    const TWO_PI_SQRT = Math.sqrt(2 * Math.PI);

    ctx.beginPath();
    ctx.strokeStyle = P.gaussStroke;
    ctx.lineWidth = 1.5;

    for (let px = 0; px <= plotW; px++) {
      const val = binMin + (px / plotW) * (binMax - binMin);
      const z = (val - mean) / safeStddev;
      const gauss = Math.exp(-0.5 * z * z) / (safeStddev * TWO_PI_SQRT);
      const expected = gauss * scaleFactor;
      const gH = Math.min(plotH, (expected / maxBin) * plotH);
      const x = PAD_LEFT + px;
      const y = PAD_TOP + plotH - gH;
      if (px === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Mean line (dashed vertical)
    const meanX = PAD_LEFT + ((mean - binMin) / (binMax - binMin)) * plotW;
    ctx.beginPath();
    ctx.strokeStyle = P.meanLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.moveTo(meanX, PAD_TOP);
    ctx.lineTo(meanX, PAD_TOP + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Mean label
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "9px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`μ=${mean.toFixed(1)}ms`, meanX, PAD_TOP - 5);

    // Axes
    ctx.beginPath();
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1;
    ctx.moveTo(PAD_LEFT, PAD_TOP);
    ctx.lineTo(PAD_LEFT, PAD_TOP + plotH);
    ctx.lineTo(PAD_LEFT + plotW, PAD_TOP + plotH);
    ctx.stroke();

    // X axis labels
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "9px system-ui";
    ctx.textAlign = "center";
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const val = binMin + (i / xTicks) * (binMax - binMin);
      const x = PAD_LEFT + (i / xTicks) * plotW;
      ctx.fillText(val.toFixed(1), x, PAD_TOP + plotH + 14);
    }

    // Y axis labels
    ctx.textAlign = "right";
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const val = (i / yTicks) * maxBin;
      const y = PAD_TOP + plotH - (i / yTicks) * plotH;
      ctx.fillText(`${Math.round(val)}`, PAD_LEFT - 6, y + 3);
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
    <canvas
      ref={canvasRef}
      style={{
        width: props.width !== undefined ? `${props.width}px` : "100%",
        height: `${fixedH()}px`,
        display: "block",
      }}
    />
  );
};

export default JitterHistogram;
