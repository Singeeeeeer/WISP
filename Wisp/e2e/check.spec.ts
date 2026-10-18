import { test, expect } from "@playwright/test";
test("local Check persists exact evidence, detects stale source and recomputes on explicit confirmation", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByLabel("书店活动提案正文");
  await editor.fill(
    "😀活动说明。活动于11月8日开放。海报于11月10日定稿，随后开放报名。",
  );
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await page.getByRole("button", { name: "运行本地检查" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "发现需要核对的安排" }),
  ).toBeVisible();
  await expect(
    page.getByText("海报于11月10日定稿，随后开放报名", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Check 检查结果" }),
  ).toBeFocused();
  await page.screenshot({ path: "docs/screenshots/local-check-findings.png" });
  await page.getByRole("button", { name: "关闭检查结果" }).click();
  await editor.fill("活动于11月8日开放。海报于11月5日定稿，随后开放报名。");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await page.reload();
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await expect(page.getByRole("button", { name: "查看检查结果" })).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "查看检查结果" }).click();
  await expect(
    page.getByText("原文已变化或不可用：这是旧版本的结果，不代表当前材料。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "再次检查当前全文" }).click();
  await expect(page.getByTestId("snapshot-text")).toContainText("11月5日");
  await page.getByRole("button", { name: "运行本地检查" }).click();
  await expect(
    page.getByRole("heading", { name: "本地规则未发现可报告的疑点" }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/local-check.png" });
});

test("selection only, empty input and failed persistence never claim success", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByLabel("书店活动提案正文");
  await editor.fill("活动于11月8日开放。海报于11月10日定稿，随后开放报名。");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await editor.press("Control+Home");
  for (let i = 0; i < "活动于11月8日开放。".length; i++)
    await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await page.getByRole("button", { name: "运行本地检查" }).click();
  await expect(
    page.getByRole("heading", { name: "当前材料不在本地规则支持范围" }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.getByRole("button", { name: "复制结果" }).click();
  await expect(
    page.getByText("复制失败，请手动选择结果文字复制。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭检查结果" }).click();
  await editor.fill("");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await page.getByRole("button", { name: "运行本地检查" }).click();
  await expect(page.getByRole("alert")).toContainText("材料为空");
  await page.getByRole("button", { name: "关闭材料面板" }).click();
  await editor.fill("活动于11月8日开放。海报于11月10日定稿，随后开放报名。");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟磁盘写入失败");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "运行本地检查" }).click();
  await expect(page.getByRole("alert")).toContainText("模拟磁盘写入失败");
  await expect(
    page.getByRole("heading", { name: "发现需要核对的安排" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "运行本地检查" }).click();
  await expect(
    page.getByRole("heading", { name: "发现需要核对的安排" }),
  ).toBeVisible();
});
