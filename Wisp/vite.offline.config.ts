import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
// Offline browser tests use a separate API with no configured credentials.
export default mergeConfig(
  base,
  defineConfig({
    server: { proxy: { "/api": "http://127.0.0.1:15289" } },
  }),
);
