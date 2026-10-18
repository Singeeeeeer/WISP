import { defineConfig } from "@playwright/test";

process.env.WISP_OFFLINE_DIST = "1";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "notebook.spec.ts",
  workers: 1,
  timeout: 30_000,
  outputDir: "test-results/notebook",
  use: {
    baseURL: "http://127.0.0.1:15351",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
});
