import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import base from "./playwright.config";
const root = process.cwd();
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: "http://127.0.0.1:15288" },
  webServer: [
    {
      command:
        '"' +
        process.execPath +
        '" "' +
        resolve(root, "node_modules/vite/bin/vite.js") +
        '" --config "' +
        resolve(root, "vite.offline.config.ts") +
        '" --host 127.0.0.1 --port 15288 --strictPort',
      // Run the script through Node on Windows instead of relying on a file association.
      url: "http://127.0.0.1:15288",
      reuseExistingServer: false,
    },
    {
      command:
        '"' +
        resolve(root, ".venv/Scripts/python.exe") +
        '" -m uvicorn app.main:app --app-dir "' +
        resolve(root, "apps/api") +
        '" --host 127.0.0.1 --port 15289 --no-access-log',
      url: "http://127.0.0.1:15289/api/health",
      reuseExistingServer: false,
      env: {
        WISP_ENV_FILE: resolve(root, "test-results/nonexistent-offline.env"),
        GEMINI_API_KEY: "",
        GOOGLE_API_KEY: "",
        GEMINI_MODEL: "",
      },
    },
  ],
});
