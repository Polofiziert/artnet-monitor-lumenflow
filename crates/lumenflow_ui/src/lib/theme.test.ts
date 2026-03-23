/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { resolveEffectiveTheme } from "./theme";
import {
  buildDmxHeatColors,
  getDmxCanvasPalette,
  getThermalStops,
  thermalColor,
} from "./themePalette";

describe("resolveEffectiveTheme", () => {
  it("returns light or dark for explicit preference", () => {
    expect(resolveEffectiveTheme("light", false)).toBe("light");
    expect(resolveEffectiveTheme("light", true)).toBe("light");
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
    expect(resolveEffectiveTheme("dark", true)).toBe("dark");
  });

  it("follows OS when system", () => {
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
    expect(resolveEffectiveTheme("system", false)).toBe("light");
  });
});

describe("themePalette", () => {
  it("builds 256 heat colors for each theme", () => {
    expect(buildDmxHeatColors("dark").length).toBe(256);
    expect(buildDmxHeatColors("light").length).toBe(256);
  });

  it("provides canvas palettes for dark and light", () => {
    const d = getDmxCanvasPalette("dark");
    const l = getDmxCanvasPalette("light");
    expect(d.bg).toMatch(/^#/);
    expect(l.bg).toMatch(/^#/);
    expect(d.bg).not.toBe(l.bg);
  });

  it("thermalColor respects stops", () => {
    const stops = getThermalStops("dark");
    expect(thermalColor(0, stops)).toContain("rgb");
    expect(thermalColor(1, stops)).toContain("rgb");
  });
});
