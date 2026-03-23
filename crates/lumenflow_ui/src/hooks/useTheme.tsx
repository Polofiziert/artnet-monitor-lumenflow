import {
  type ParentComponent,
  createContext,
  useContext,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
} from "solid-js";
import {
  type ThemePreference,
  THEME_STORAGE_KEY,
  loadThemePreference,
  resolveEffectiveTheme,
  applyEffectiveTheme,
} from "../lib/theme";

interface ThemeContextValue {
  preference: () => ThemePreference;
  setPreference: (v: ThemePreference) => void;
  effective: () => "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue>();

export const ThemeProvider: ParentComponent = (props) => {
  const [preference, setPreference] = createSignal<ThemePreference>(
    loadThemePreference()
  );
  const [prefersDark, setPrefersDark] = createSignal(
    typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const effective = () =>
    resolveEffectiveTheme(preference(), prefersDark());

  createEffect(() => {
    applyEffectiveTheme(effective());
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference());
    } catch {
      /* ignore */
    }
  });

  createEffect(() => {
    const pref = preference();
    void import("@tauri-apps/api/app")
      .then(({ setTheme }) => {
        if (pref === "system") return setTheme(null);
        return setTheme(pref);
      })
      .catch(() => {
        /* Web dev or unsupported */
      });
  });

  onMount(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setPrefersDark(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    onCleanup(() => mq.removeEventListener("change", sync));
  });

  const value: ThemeContextValue = {
    preference,
    setPreference,
    effective,
  };

  return (
    <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
