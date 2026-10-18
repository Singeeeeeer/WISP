import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  grepInvert: /persistent jobs remain explicitly unimplemented/,
  workers: 3,
  timeout: 30000,
  outputDir: '../../test-results/english-browser',
  reporter: [['line'], ['json', { outputFile: 'test-results/english-browser.json' }]],
  use: { baseURL: 'http://127.0.0.1:15351', headless: true, channel: 'chrome', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
});
