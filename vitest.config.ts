import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/emulator/**", "node_modules/**"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    env: { AI_DISABLED: "1", CARD_HMAC_SECRET: "test-secret-do-not-use-in-prod", NODE_ENV: "test" },
    coverage: { provider: "v8", include: ["src/**"], exclude: ["src/web/three/**", "src/web/main.tsx"] },
  },
});
