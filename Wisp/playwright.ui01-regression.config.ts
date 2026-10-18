import { defineConfig } from "@playwright/test";

process.env.WISP_OFFLINE_DIST = "1";
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/.*/**"],
  testMatch:
    /(?:cauldron|drop-copies|batch|batch-character|local-text|check|canvas|magic-ring|companion-casting|summon-flight|floating)\.spec\.ts/,
  workers: 2,
  timeout: 30000,
  outputDir: "test-results/ui01-regression",
  use: {
    baseURL: "http://127.0.0.1:15351",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
});
