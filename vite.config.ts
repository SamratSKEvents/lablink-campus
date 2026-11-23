import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "src/web",
  publicDir: "public",
  plugins: [react(), tailwindcss()],
  envDir: "../..",
  build: {
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
