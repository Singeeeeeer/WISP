import { defineConfig } from "@playwright/test";

process.env.WISP_OFFLINE_DIST = "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "task-pause.spec.ts",
  workers: 1,
  timeout: 30_000,
  outputDir: "test-results/task-pause",
  use: {
    baseURL: "http://127.0.0.1:15351",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
  },
});
