import { test as base, expect } from '@playwright/test';
import { resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
export { expect };
export type { Page, Locator, Route, BrowserContext } from '@playwright/test';
export const test = base.extend<{ englishAssets: void }>({
  englishAssets: [async ({ context }, use) => {
    const root = process.cwd();
    const dist = resolve(root, 'dist');
    await context.route('http://127.0.0.1:15351/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/import-text') {
        const data = JSON.parse(execFileSync(resolve(root, 'runtime/python/python.exe'), ['-I', '-B', resolve(root, 'apps/api/app/import_worker.py'), url.searchParams.get('format')!], { input: route.request().postDataBuffer()!, timeout: 60000, windowsHide: true }).toString());
        await route.fulfill({ status: data.error ? 422 : 200, json: data.error ? { error: { code: data.error } } : data });
      } else if (url.pathname === '/api/health') {
        await route.fulfill({ json: { status: 'ok', service: 'wisp', environment: 'local', jobs_enabled: false, model_connected: false, model_status: 'unconfigured' } });
      } else if (url.pathname.startsWith('/api/')) {
        await route.fulfill({ status: 503, json: { error: { code: 'MODEL_NOT_CONFIGURED' } } });
      } else {
        const file = resolve(dist, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1));
        if (!file.startsWith(dist + sep)) await route.abort('blockedbyclient');
        else await route.fulfill({ path: file });
      }
    });
    await use();
  }, { auto: true }],
});
