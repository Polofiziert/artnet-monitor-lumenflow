/** User-facing theme choice (persisted). */
export type ThemePreference = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "lumenflow_theme_preference";

/** Resolve persisted value or default to dark (Pro-Lab default). */
export function loadThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

/** Effective UI theme for tokens and canvas (system follows OS). */
export function resolveEffectiveTheme(
  preference: ThemePreference,
  prefersDark: boolean
): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}

/** Apply resolved theme to the document root (CSS variables + native form controls). */
export function applyEffectiveTheme(effective: "light" | "dark"): void {
  document.documentElement.dataset["theme"] = effective;
  document.documentElement.style.colorScheme =
    effective === "dark" ? "dark" : "light";
}

/** Synchronous init before Solid render to avoid light/dark flash. */
export function initThemeFromStorage(): void {
  if (typeof document === "undefined") return;
  const pref = loadThemePreference();
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyEffectiveTheme(resolveEffectiveTheme(pref, prefersDark));
}
