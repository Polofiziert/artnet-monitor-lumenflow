import { describe, it, expect } from "vitest";
import {
  buildDmxHeatColors,
  getDmxCanvasPalette,
  getJitterChartPalette,
  getNetworkChartPalette,
  getThermalStops,
  thermalColor,
} from "./themePalette";

describe("themePalette", () => {
  it("buildDmxHeatColors returns a 256-entry ramp for dark and light", () => {
    const dark = buildDmxHeatColors("dark");
    const light = buildDmxHeatColors("light");
    expect(dark).toHaveLength(256);
    expect(light).toHaveLength(256);
    expect(dark[0]).toMatch(/#/);
    expect(dark[255]).toMatch(/#/);
    expect(light[0]).toMatch(/#/);
    expect(light[255]).toMatch(/#/);
  });

  it("getDmxCanvasPalette returns stable keys and heatColors reference", () => {
    const p = getDmxCanvasPalette("dark");
    expect(p.bg).toMatch(/#/);
    expect(p.heatColors).toHaveLength(256);
    expect(getDmxCanvasPalette("light").heatColors).toHaveLength(256);
  });

  it("thermalColor interpolates within stops and clamps edges", () => {
    const stops = getThermalStops("dark");
    expect(thermalColor(-1, stops)).toMatch(/^rgb\(/);
    expect(thermalColor(0, stops)).toMatch(/^rgb\(/);
    expect(thermalColor(0.5, stops)).toMatch(/^rgb\(/);
    expect(thermalColor(2, stops)).toMatch(/^rgb\(/);
  });

  it("chart palettes differ between dark and light", () => {
    const jd = getJitterChartPalette("dark");
    const jl = getJitterChartPalette("light");
    expect(jd.bg).not.toBe(jl.bg);

    const nd = getNetworkChartPalette("dark");
    const nl = getNetworkChartPalette("light");
    expect(nd.bandColors.length).toBe(3);
    expect(nl.bandColors.length).toBe(3);
    expect(nd.bg).not.toBe(nl.bg);
  });
});

