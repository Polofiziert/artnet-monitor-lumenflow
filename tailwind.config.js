module.exports = {
  content: ["./crates/lumenflow_ui/src/**/*.{ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["system-ui", "sans-serif"],
      mono: ["Menlo", "Monaco", "Courier New", "monospace"],
    },
    extend: {
      colors: {
        obsidian: "rgb(var(--lf-obsidian) / <alpha-value>)",
        surface: "rgb(var(--lf-surface) / <alpha-value>)",
        "surface-hover": "rgb(var(--lf-surface-hover) / <alpha-value>)",
        edge: "rgb(var(--lf-edge) / <alpha-value>)",
        "edge-active": "rgb(var(--lf-edge-active) / <alpha-value>)",
        teal: {
          DEFAULT: "rgb(var(--lf-teal) / <alpha-value>)",
          dim: "rgb(var(--lf-teal-dim) / <alpha-value>)",
          glow: "rgb(var(--lf-teal) / 0.2)",
        },
        primary: "rgb(var(--lf-primary) / <alpha-value>)",
        secondary: "rgb(var(--lf-secondary) / <alpha-value>)",
        muted: "rgb(var(--lf-muted) / <alpha-value>)",
        amber: "rgb(var(--lf-amber) / <alpha-value>)",
        flicker: "rgb(var(--lf-flicker) / <alpha-value>)",
        error: "rgb(var(--lf-error) / <alpha-value>)",
        red: {
          400: "rgb(var(--lf-red-400) / <alpha-value>)",
          500: "rgb(var(--lf-red-500) / <alpha-value>)",
        },
      },
      gridTemplateColumns: {
        16: "repeat(16, minmax(0, 1fr))",
        32: "repeat(32, minmax(0, 1fr))",
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        flicker: "flicker 0.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
};
