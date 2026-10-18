import { test as base } from "@playwright/test";
import { resolve, sep } from "node:path";
export { expect } from "@playwright/test";
export type { Page, Locator, Route } from "@playwright/test";

/** Optional local dist routing; API mocks in each scenario take precedence. */
export const test = base.extend<{ offlineApp: void }>({
  offlineApp: [
    async ({ context }, use) => {
      await context.addInitScript(() =>
        localStorage.setItem("wisp-tour-seen", "true"),
      );
      if (process.env.WISP_OFFLINE_DIST === "1") {
        const dist = resolve("dist");
        await context.route("http://127.0.0.1:15351/**", async (route) => {
          const pathname = decodeURIComponent(
            new URL(route.request().url()).pathname,
          );
          if (pathname.startsWith("/api/")) {
            await route.fulfill({
              status: 503,
              body: "Offline UI verification: API unavailable",
            });
            return;
          }
          const file = resolve(
            dist,
            pathname === "/" ? "index.html" : pathname.slice(1),
          );
          if (!file.startsWith(dist + sep)) {
            await route.abort("blockedbyclient");
            return;
          }
          await route.fulfill({ path: file });
        });
      }
      await use();
    },
    { auto: true },
  ],
});
