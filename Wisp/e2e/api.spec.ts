import { test, expect } from "@playwright/test";
for (const [status, label] of [
  ["unconfigured", "API 在线 · AI 未接通 ↻"],
  ["configured", "API 在线 · Gemini 已配置，尚未验证 ↻"],
  ["verified", "API 在线 · Gemini 本次服务运行期间曾调用成功 ↻"],
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
      await page.getByRole("button", { name: "API 状态未检查 ↻" }).click();
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
      expect(models).toBe(0);
    },
  );
}
test("persistent jobs remain explicitly unimplemented", async ({ request }) => {
  const response = await request.post("/api/jobs", {
    data: { text: "仅测试未实现接口" },
  });
  expect(response.status()).toBe(501);
  expect((await response.json()).error.code).toBe("NOT_IMPLEMENTED");
});
