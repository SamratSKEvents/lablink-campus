import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/emulator/**", "node_modules/**"],
    environment: "node",
    environmentMatchGlobs: [["tests/web/**", "jsdom"]],
    setupFiles: ["tests/setup.ts"],
    env: { AI_DISABLED: "1", CARD_HMAC_SECRET: "test-secret-do-not-use-in-prod", NODE_ENV: "test" },
    coverage: { provider: "v8", include: ["src/**"], exclude: ["src/web/three/**", "src/web/main.tsx"] },
  },
});
