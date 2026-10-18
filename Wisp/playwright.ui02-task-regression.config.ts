import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.ui01-regression.config";

export default defineConfig({
  ...baseConfig,
  testMatch: /(?:summon|watch|grimoire)\.spec\.ts/,
  outputDir: "test-results/ui02-task-regression",
});
