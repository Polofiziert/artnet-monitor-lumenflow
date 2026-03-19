import type { Component } from "solid-js";
import { onMount, onCleanup } from "solid-js";

interface SparklineProps {
  data: () => Float32Array | null;
  width?: number;
  height?: number;
  color?: string;
  bgColor?: string;
}

const Sparkline: Component<SparklineProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let rafId: number | undefined;

  const w = () => props.width ?? 60;
  const h = () => props.height ?? 20;
  const color = () => props.color ?? "#2DD4BF";
  const bg = () => props.bgColor ?? "transparent";

  function draw() {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const values = props.data();
    const width = w();
    const height = h();

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (bg() !== "transparent") {
      ctx.fillStyle = bg();
      ctx.fillRect(0, 0, width, height);
    }

    if (!values || values.length === 0) return;

    const len = values.length;
    const stepX = width / (len - 1);
    const pad = 2;
    const usableHeight = height - pad * 2;

    ctx.beginPath();
    ctx.strokeStyle = color();
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (let i = 0; i < len; i++) {
      const x = i * stepX;
      const y = pad + usableHeight - ((values[i] ?? 0) / 255) * usableHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, pad, 0, height);
    gradient.addColorStop(0, color() + "30");
    gradient.addColorStop(1, color() + "00");

    ctx.lineTo((len - 1) * stepX, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  onMount(() => {
    let running = true;
    let lastFrame = 0;
    const FRAME_MS = 1000 / 15;
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
        width: `${w()}px`,
        height: `${h()}px`,
        display: "block",
      }}
      class="pointer-events-none"
    />
  );
};

export default Sparkline;
