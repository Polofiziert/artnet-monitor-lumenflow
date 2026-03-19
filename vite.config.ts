import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  root: path.resolve(__dirname, "crates/lumenflow_ui"),
  plugins: [solid()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "crates/lumenflow_ui/src"),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
  },

  build: {
    outDir: path.resolve(__dirname, "dist"),
    target: "ES2022",
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["solid-js", "@tauri-apps/api"],
        },
      },
    },
  },

  optimizeDeps: {
    esbuildOptions: {
      target: "ES2022",
    },
  },
}));
