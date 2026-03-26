import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import path from "path";

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["crates/lumenflow_ui/src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      lines: 80,
      branches: 75,
      functions: 80,
      statements: 80,
    },
  },
  resolve: {
    dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
    alias: {
      "@": path.resolve(__dirname, "./crates/lumenflow_ui/src"),
    },
  },
});
