module.exports = {
  content: ["./crates/lumenflow_ui/src/**/*.{ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["system-ui", "sans-serif"],
      mono: ["Menlo", "Monaco", "Courier New", "monospace"],
    },
    extend: {
      colors: {
        obsidian: "#0B0B0B",
        surface: "#141414",
        "surface-hover": "#1A1A1A",
        edge: "#1F1F1F",
        "edge-active": "#2A2A2A",
        teal: { DEFAULT: "#2DD4BF", dim: "#14B8A6", glow: "#2DD4BF33" },
        primary: "#E5E5E5",
        secondary: "#A3A3A3",
        muted: "#525252",
        amber: "#F59E0B",
        flicker: "#D97706",
        error: "#EF4444",
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
