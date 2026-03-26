/**
 * Canvas / imperative draw colors aligned with UI theme (DOM tokens are CSS;
 * canvas2d needs explicit values). Tuned for outdoor readability in light mode.
 */

export type ResolvedTheme = "light" | "dark";

/** 256-entry heat ramp: gray(0) → teal → white(255). */
export function buildDmxHeatColors(resolved: ResolvedTheme): string[] {
  const colors = new Array<string>(256);
  if (resolved === "dark") {
    colors[0] = "#525252";
    for (let i = 1; i < 128; i++) {
      const t = i / 127;
      colors[i] =
        `rgb(${Math.round(30 + t * 15)},${Math.round(140 + t * 72)},${Math.round(130 + t * 61)})`;
    }
    for (let i = 128; i < 255; i++) {
      const t = (i - 128) / 126;
      colors[i] =
        `rgb(${Math.round(45 + t * 184)},${Math.round(212 + t * 17)},${Math.round(191 + t * 38)})`;
    }
    colors[255] = "#FFFFFF";
  } else {
    colors[0] = "#71717A";
    for (let i = 1; i < 128; i++) {
      const t = i / 127;
      colors[i] =
        `rgb(${Math.round(15 + t * 25)},${Math.round(100 + t * 60)},${Math.round(92 + t * 55)})`;
    }
    for (let i = 128; i < 255; i++) {
      const t = (i - 128) / 126;
      colors[i] =
        `rgb(${Math.round(40 + t * 175)},${Math.round(160 + t * 40)},${Math.round(147 + t * 45)})`;
    }
    colors[255] = "#0A0A0A";
  }
  return colors;
}

export interface DmxCanvasPalette {
  bg: string;
  gap: string;
  hoverRing: string;
  selectedRing: string;
  flickerRing: string;
  flickerShadow: string;
  sparkFill: string;
  sparkStroke: string;
  label: string;
  glow: string;
  hoverBg: string;
  selectedBg: string;
  heatColors: readonly string[];
}

export function getDmxCanvasPalette(resolved: ResolvedTheme): DmxCanvasPalette {
  const heatColors = buildDmxHeatColors(resolved);
  if (resolved === "dark") {
    return {
      bg: "#0B0B0B",
      gap: "#1A1A1A",
      hoverRing: "rgba(45,212,191,0.4)",
      selectedRing: "rgba(45,212,191,0.6)",
      flickerRing: "rgba(245,158,11,0.6)",
      flickerShadow: "rgba(245,158,11,0.27)",
      sparkFill: "rgba(45,212,191,0.12)",
      sparkStroke: "rgba(45,212,191,0.30)",
      label: "rgba(115,115,115,0.6)",
      glow: "rgba(45,212,191,0.5)",
      hoverBg: "rgba(45,212,191,0.05)",
      selectedBg: "rgba(45,212,191,0.1)",
      heatColors,
    };
  }
  return {
    bg: "#F5F5F6",
    gap: "#E4E4E7",
    hoverRing: "rgba(15,118,110,0.45)",
    selectedRing: "rgba(15,118,110,0.65)",
    flickerRing: "rgba(180,83,9,0.65)",
    flickerShadow: "rgba(180,83,9,0.35)",
    sparkFill: "rgba(15,118,110,0.14)",
    sparkStroke: "rgba(15,118,110,0.38)",
    label: "rgba(82,82,91,0.75)",
    glow: "rgba(15,118,110,0.45)",
    hoverBg: "rgba(15,118,110,0.08)",
    selectedBg: "rgba(15,118,110,0.14)",
    heatColors,
  };
}

/** Universe heatmap: thermal gradient stops. */
export function getThermalStops(resolved: ResolvedTheme): ReadonlyArray<{
  pos: number;
  rgb: [number, number, number];
}> {
  if (resolved === "dark") {
    return [
      { pos: 0.0, rgb: [0x1a, 0x1a, 0x1a] },
      { pos: 0.05, rgb: [0x1e, 0x3a, 0x5f] },
      { pos: 0.2, rgb: [0x25, 0x63, 0xeb] },
      { pos: 0.4, rgb: [0x22, 0xc5, 0x5e] },
      { pos: 0.6, rgb: [0xea, 0xb3, 0x08] },
      { pos: 0.85, rgb: [0xfb, 0xbf, 0x24] },
      { pos: 1.0, rgb: [0xff, 0xff, 0xff] },
    ];
  }
  return [
    { pos: 0.0, rgb: [0xe4, 0xe4, 0xe7] },
    { pos: 0.05, rgb: [0xc7, 0xd2, 0xfe] },
    { pos: 0.2, rgb: [0x60, 0x7a, 0xf0] },
    { pos: 0.4, rgb: [0x22, 0xc5, 0x5e] },
    { pos: 0.6, rgb: [0xca, 0x8a, 0x04] },
    { pos: 0.85, rgb: [0xea, 0x58, 0x0c] },
    { pos: 1.0, rgb: [0x18, 0x18, 0x18] },
  ];
}

export function thermalColor(
  activity: number,
  stops: ReadonlyArray<{ pos: number; rgb: [number, number, number] }>
): string {
  if (activity <= 0) {
    const z = stops[0]!.rgb;
    return `rgb(${z[0]},${z[1]},${z[2]})`;
  }
  const t = Math.min(1, Math.max(0, activity));
  for (let i = 0; i < stops.length - 1; i++) {
    const s0 = stops[i]!;
    const s1 = stops[i + 1]!;
    if (t <= s1.pos) {
      const f = (t - s0.pos) / (s1.pos - s0.pos);
      const r = Math.round(s0.rgb[0] + (s1.rgb[0] - s0.rgb[0]) * f);
      const g = Math.round(s0.rgb[1] + (s1.rgb[1] - s0.rgb[1]) * f);
      const b = Math.round(s0.rgb[2] + (s1.rgb[2] - s0.rgb[2]) * f);
      return `rgb(${r},${g},${b})`;
    }
  }
  const last = stops[stops.length - 1]!.rgb;
  return `rgb(${last[0]},${last[1]},${last[2]})`;
}

export interface JitterChartPalette {
  label: string;
  teal: string;
  amber: string;
  bg: string;
  axis: string;
  gaussStroke: string;
  meanLine: string;
}

export function getJitterChartPalette(
  resolved: ResolvedTheme
): JitterChartPalette {
  if (resolved === "dark") {
    return {
      label: "#A3A3A3",
      teal: "#2DD4BF",
      amber: "#F59E0B",
      bg: "#121212",
      axis: "#1F1F1F",
      gaussStroke: "rgba(255,255,255,0.4)",
      meanLine: "rgba(255,255,255,0.6)",
    };
  }
  return {
    label: "#52525B",
    teal: "#0F766E",
    amber: "#B45309",
    bg: "#F4F4F5",
    axis: "#D4D4D8",
    gaussStroke: "rgba(24,24,27,0.35)",
    meanLine: "rgba(24,24,27,0.55)",
  };
}

export interface NetworkChartPalette {
  label: string;
  bg: string;
  axis: string;
  bandColors: readonly string[];
  topStroke: string;
  legend: readonly string[];
}

export function getNetworkChartPalette(
  resolved: ResolvedTheme
): NetworkChartPalette {
  if (resolved === "dark") {
    return {
      label: "#A3A3A3",
      bg: "#0B0B0B",
      axis: "#1F1F1F",
      bandColors: [
        "rgba(30,58,95,0.85)",
        "rgba(45,212,191,0.7)",
        "rgba(34,197,94,0.65)",
      ],
      topStroke: "rgba(45,212,191,0.35)",
      legend: [
        "rgba(30,58,95,0.85)",
        "rgba(45,212,191,0.7)",
        "rgba(34,197,94,0.65)",
      ],
    };
  }
  return {
    label: "#52525B",
    bg: "#F5F5F6",
    axis: "#D4D4D8",
    bandColors: [
      "rgba(30,64,175,0.45)",
      "rgba(15,118,110,0.55)",
      "rgba(22,163,74,0.5)",
    ],
    topStroke: "rgba(15,118,110,0.45)",
    legend: [
      "rgba(30,64,175,0.45)",
      "rgba(15,118,110,0.55)",
      "rgba(22,163,74,0.5)",
    ],
  };
}
