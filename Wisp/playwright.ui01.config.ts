import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "ui01.spec.ts",
  workers: 1,
  timeout: 30_000,
  outputDir: "test-results/ui01",
  use: {
    baseURL: "http://127.0.0.1:15361",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
  },
  // The tests fulfill every same-origin request from dist. No server is started.
});
