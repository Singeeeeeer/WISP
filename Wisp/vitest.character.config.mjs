// Keep generated caches in this worktree when dependencies are a read-only junction.
export default {
  cacheDir: "./test-results/character-vitest-cache",
  resolve: { preserveSymlinks: true },
  test: { include: ["apps/web/tests/**/*.test.ts"] },
};
