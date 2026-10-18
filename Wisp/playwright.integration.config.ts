import { defineConfig } from "@playwright/test";
import batch from "./playwright.batch.config";

export default defineConfig({
  ...batch,
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/integration",
  use: { ...batch.use, baseURL: "http://127.0.0.1:15340" },
  webServer: [
    {
      command:
        `"${process.execPath}" --input-type=module -e "` +
        "import { createServer } from 'vite'; " +
        "const server = await createServer({ configFile: false, envFile: false, " +
        "cacheDir: process.cwd() + '/test-results/integration-vite-cache', " +
        "root: 'apps/web', server: { host: '127.0.0.1', port: 15340, strictPort: true, " +
        "proxy: { '/api': 'http://127.0.0.1:15310' } } }); " +
        'await server.listen();"',
      url: "http://127.0.0.1:15340",
      reuseExistingServer: false,
    },
    {
      // Local parsing is real; the test backend has no model configuration.
      command: "runtime\\python\\python.exe -I -B scripts/serve-copy-tests.py",
      url: "http://127.0.0.1:15310/api/health",
      reuseExistingServer: false,
    },
  ],
});
