import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "character-activity.spec.ts",
    "summon-flight.spec.ts",
    "companion.spec.ts",
    "companion-casting.spec.ts",
    "wand-feedback.spec.ts",
    "wand-outcome.spec.ts",
    "magic-ring.spec.ts",
    "workspace.spec.ts",
    "window-focus.spec.ts",
  ],
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/character",
  use: {
    baseURL: "http://127.0.0.1:15330",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      `"${process.execPath}" --input-type=module -e "` +
      "import { createServer } from 'vite'; " +
      "const server = await createServer({ configFile: false, envFile: false, " +
      "cacheDir: process.cwd() + '/test-results/character-vite-cache', " +
      "root: 'apps/web', server: { host: '127.0.0.1', port: 15330, strictPort: true } }); " +
      'await server.listen();"',
    url: "http://127.0.0.1:15330",
    reuseExistingServer: false,
  },
});
