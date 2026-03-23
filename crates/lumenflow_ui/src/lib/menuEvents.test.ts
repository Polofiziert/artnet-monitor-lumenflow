import { describe, it, expect } from "vitest";
import { isMenuPayload, primaryMenuModifier } from "./menuEvents";

describe("isMenuPayload", () => {
  it("accepts valid view payloads", () => {
    expect(isMenuPayload({ kind: "view", view: "dashboard" })).toBe(true);
    expect(isMenuPayload({ kind: "view", view: "inspector" })).toBe(true);
    expect(isMenuPayload({ kind: "view", view: "routing" })).toBe(true);
    expect(isMenuPayload({ kind: "view", view: "devices" })).toBe(true);
  });

  it("rejects invalid view id", () => {
    expect(isMenuPayload({ kind: "view", view: "other" })).toBe(false);
  });

  it("accepts settings, focus-search, open-artnet-spec", () => {
    expect(isMenuPayload({ kind: "settings" })).toBe(true);
    expect(isMenuPayload({ kind: "focus-search" })).toBe(true);
    expect(isMenuPayload({ kind: "open-artnet-spec" })).toBe(true);
  });

  it("accepts help with section", () => {
    expect(isMenuPayload({ kind: "help", section: "overview" })).toBe(true);
    expect(isMenuPayload({ kind: "help", section: "manual" })).toBe(true);
    expect(isMenuPayload({ kind: "help", section: "about" })).toBe(true);
    expect(isMenuPayload({ kind: "help", section: "bad" })).toBe(false);
  });

  it("rejects non-objects and unknown kinds", () => {
    expect(isMenuPayload(null)).toBe(false);
    expect(isMenuPayload(undefined)).toBe(false);
    expect(isMenuPayload({ kind: "unknown" })).toBe(false);
  });
});

describe("primaryMenuModifier", () => {
  it("returns Cmd or Ctrl string", () => {
    const m = primaryMenuModifier();
    expect(m === "Cmd" || m === "Ctrl").toBe(true);
  });
});
