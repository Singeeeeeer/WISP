import { defineConfig } from "@playwright/test";

process.env.WISP_OFFLINE_DIST = "1";
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/.*/**"],
  testMatch:
    /(?:companion-text|companion|companion-casting|character-activity|wand-feedback|wand-outcome|magic-ring|workspace|window-focus)\.spec\.ts/,
  workers: 2,
  timeout: 30000,
  outputDir: "test-results/text-pointing",
  use: {
    baseURL: "http://127.0.0.1:15351",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
});
