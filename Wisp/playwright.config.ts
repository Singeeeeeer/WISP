import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:15178",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 15178 --strictPort",
      url: "http://127.0.0.1:15178",
      reuseExistingServer: true,
    },
    {
      command: "start-api.cmd",
      url: "http://127.0.0.1:15179/api/health",
      reuseExistingServer: true,
    },
  ],
  timeout: 30000,
});
