import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
  server: { proxy: { "/api": "http://127.0.0.1:15179" } },
  build: { outDir: "../../dist", emptyOutDir: true },
});
