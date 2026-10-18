import { test, expect } from "./fixture";
for (const [status, label] of [
  ["unconfigured", "API online · AI is not connected ↻"],
  ["configured", "API online · Gemini is configured but not yet verified ↻"],
  ["verified", "API online · Gemini has completed a call during this service run ↻"],
] as const) {
  test(
    "health display reflects " + status + " without invoking a model",
    async ({ page }) => {
      let models = 0;
      await page.route("**/api/check", (route) => {
        models++;
        return route.abort();
      });
      await page.route("**/api/health", (route) =>
        route.fulfill({
          json: {
            status: "ok",
            service: "wisp",
            environment: "local",
            model_connected: status === "verified",
            model_status: status,
            jobs_enabled: false,
          },
        }),
      );
      await page.goto("/");
      await page.getByRole("button", { name: "API status not checked ↻" }).click();
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
      expect(models).toBe(0);
    },
  );
}
test("persistent jobs remain explicitly unimplemented", async ({ request }) => {
  const response = await request.post("/api/jobs", {
    data: { text: "Only test the unimplemented endpoint" },
  });
  expect(response.status()).toBe(501);
  expect((await response.json()).error.code).toBe("NOT_IMPLEMENTED");
});
