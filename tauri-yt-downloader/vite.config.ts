import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port; fail loudly instead of silently switching.
export default defineConfig({
  plugins: [react()],

  // Do not clear the terminal — Tauri prints useful build info there.
  clearScreen: false,

  // Plain CSS, no PostCSS pipeline. The inline empty config also stops Vite
  // from walking up the tree and picking up a parent project's PostCSS/Tailwind.
  css: { postcss: {} },

  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Rebuilding the Rust side is handled by `tauri dev`; ignore it here.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Expose Tauri environment variables to the frontend bundle.
  envPrefix: ["VITE_", "TAURI_ENV_"],

  build: {
    // Target the WebView engine Tauri ships with (modern Chrome/WebView2).
    target: "chrome105",
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
  },
});
