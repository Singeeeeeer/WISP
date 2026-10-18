import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "batch.spec.ts",
    "cauldron.spec.ts",
    "gemini-text.spec.ts",
    "summon.spec.ts",
    "workspace.spec.ts",
    "window-focus.spec.ts",
  ],
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/batch",
  use: {
    baseURL: "http://127.0.0.1:15320",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    // No backend, proxy, or environment file: every API response is mocked.
    command:
      `"${process.execPath}" --input-type=module -e "` +
      "import { createServer } from 'vite'; " +
      "const server = await createServer({ configFile: false, envFile: false, " +
      "cacheDir: '../../test-results/batch-vite-cache', " +
      "root: 'apps/web', server: { host: '127.0.0.1', port: 15320, strictPort: true } }); " +
      'await server.listen();"',
    url: "http://127.0.0.1:15320",
    reuseExistingServer: false,
  },
});
