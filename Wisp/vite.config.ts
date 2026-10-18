import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
  // Keep the checked-out workspace path intact in the Windows sandbox, where
  // realpath can be denied for source files and generated test caches.
  resolve: { preserveSymlinks: true },
  server: { proxy: { "/api": "http://127.0.0.1:15179" } },
  build: { outDir: "../../dist", emptyOutDir: true },
});
