import { defineConfig } from "@playwright/test";

const useBuiltApp = process.env.WISP_GRIMOIRE_DIST === "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "grimoire.spec.ts",
  workers: 1,
  timeout: 30000,
  outputDir: "test-results/grimoire",
  use: {
    baseURL: "http://127.0.0.1:15351",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: useBuiltApp
    ? undefined
    : {
        command:
          `"${process.execPath}" --input-type=module -e "` +
          "import { createServer } from 'vite'; " +
          "const server = await createServer({ configFile: false, envFile: false, " +
          "cacheDir: process.cwd() + '/test-results/grimoire-vite-cache', " +
          "resolve: { preserveSymlinks: true }, " +
          "root: 'apps/web', server: { host: '127.0.0.1', port: 15351, strictPort: true } }); " +
          'await server.listen();"',
        url: "http://127.0.0.1:15351",
        reuseExistingServer: false,
      },
});
