import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
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
  outputDir: "test-results/companion",
  use: {
    baseURL: "http://127.0.0.1:15290",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    // Do not load the app proxy configuration or any environment files.
    command:
      `"${process.execPath}" --input-type=module -e "` +
      "import { createServer } from 'vite'; " +
      "const server = await createServer({ configFile: false, envFile: false, " +
      "root: 'apps/web', server: { host: '127.0.0.1', port: 15290, strictPort: true } }); " +
      'await server.listen();"',
    url: "http://127.0.0.1:15290",
    reuseExistingServer: false,
  },
});
