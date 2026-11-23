import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "src/web",
  publicDir: "public",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)) } },
  envDir: "../..",
  build: {
    // three.js (~320 kB gzip) is its own lazy chunk, loaded only when a 3D view opens.
    chunkSizeWarningLimit: 1300,
    outDir: "../../dist/web",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (/node_modules\/(three|@react-three)/.test(id)) return "three";
          if (/node_modules\/(firebase|@firebase)/.test(id)) return "firebase";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8080", "/health": "http://localhost:8080" },
  },
});
