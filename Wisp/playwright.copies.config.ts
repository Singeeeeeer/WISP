import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "drop-copies.spec.ts",
    "import-files.spec.ts",
    "cauldron.spec.ts",
    "workspace.spec.ts",
    "window-focus.spec.ts",
  ],
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:15310",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "runtime\\python\\python.exe -I -B scripts/serve-copy-tests.py",
    url: "http://127.0.0.1:15310/api/health",
    reuseExistingServer: false,
  },
  timeout: 30000,
});
