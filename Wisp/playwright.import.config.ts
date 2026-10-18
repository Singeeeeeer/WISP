import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["import-files.spec.ts", "cauldron.spec.ts"],
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:15289",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "runtime\\python\\python.exe -I -B scripts/serve-import-tests.py",
    url: "http://127.0.0.1:15289/api/health",
    reuseExistingServer: false,
  },
  timeout: 30000,
});
