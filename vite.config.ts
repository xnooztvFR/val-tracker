import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config Vite adaptée aux conventions Tauri : port fixe 1420 (voir tauri.conf.json
// build.devUrl), pas de clear du terminal pour garder les logs Rust visibles, et on
// ignore les changements côté src-tauri pour ne pas déclencher de rebuild frontend.
// Les tests (vitest) ont leur propre config minimale dans vitest.config.ts, pour ne pas
// mélanger les types "vitest/config" avec ceux-ci (conflit de types sur
// `build.rollupOptions.output` sinon).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        // Sépare les libs stables (peu de changements, se met en cache navigateur
        // indépendamment du code applicatif) du reste ; recharts n'est de toute façon
        // chargé que via les routes lazy qui en ont besoin (Trends/MapStats/Home).
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "zustand"],
          charts: ["recharts"],
        },
      },
    },
  },
});
