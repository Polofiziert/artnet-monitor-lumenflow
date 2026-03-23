/**
 * Native OS menu → frontend bridge (Tauri `emit` / `listen`).
 * Not part of Rust IPC; see docs/development/MENU_SPEC.md.
 */

/** Official Art-Net specification landing page (PDF linked from there). */
export const ARTNET_SPEC_URL =
  "https://art-net.org.uk/resources/art-net-specification/";

export const LUMENFLOW_MENU_EVENT = "lumenflow-menu";

export type ViewId = "dashboard" | "inspector" | "routing" | "devices";

export type HelpSection = "overview" | "manual" | "about";

export type MenuPayload =
  | { kind: "view"; view: ViewId }
  | { kind: "settings" }
  | { kind: "focus-search" }
  | { kind: "help"; section: HelpSection }
  | { kind: "open-artnet-spec" };

export function isMenuPayload(value: unknown): value is MenuPayload {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  const k = o["kind"];
  if (k === "view") {
    const v = o["view"];
    return (
      v === "dashboard" ||
      v === "inspector" ||
      v === "routing" ||
      v === "devices"
    );
  }
  if (k === "settings" || k === "focus-search" || k === "open-artnet-spec")
    return true;
  if (k === "help") {
    const s = o["section"];
    return s === "overview" || s === "manual" || s === "about";
  }
  return false;
}

/** Primary menu accelerator modifier: Cmd on Apple platforms, Ctrl elsewhere. */
export function primaryMenuModifier(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "Cmd" : "Ctrl";
}
