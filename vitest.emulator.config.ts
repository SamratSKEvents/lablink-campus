import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/emulator/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    fileParallelism: false,
    env: { AI_DISABLED: "1", CARD_HMAC_SECRET: "test-secret-do-not-use-in-prod", GCLOUD_PROJECT: "demo-lablink", FIREBASE_PROJECT_ID: "demo-lablink" },
  },
});
