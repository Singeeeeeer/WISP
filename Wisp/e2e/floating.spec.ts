import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/check", (route) => route.abort());
  await page.goto("/");
  await page
    .getByRole("button", { name: "打开书店活动提案", exact: true })
    .click();
});

test("context menu preserves selection and results stay compact with explicit continuation", async ({
  page,
}) => {
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async (text: string) => {
        (window as any).copied = text;
      },
      configurable: true,
    }),
  );
  const editor = page.getByLabel("书店活动提案正文");
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 12);
    el.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const selected = (await editor.inputValue()).slice(0, 12);
  await editor.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Understand", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "材料确认", exact: true });
  await expect(panel).toHaveAttribute("aria-modal", "false");
  await expect(page.getByTestId("snapshot-text")).toHaveText(selected);
  const bounds = await panel.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(460);
  expect(bounds!.height).toBeLessThanOrEqual(560);
  await expect(page.locator(".overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "整理原文摘录", exact: true }).click();
  await page.getByRole("button", { name: "复制结果", exact: true }).click();
  await expect(page.getByText("已复制结果", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).copied)).toContain(
    selected.trim(),
  );
  await page.screenshot({ path: "docs/screenshots/floating-result.png" });
  await page.getByRole("button", { name: "继续召唤使魔", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Page Sprite/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("snapshot-text")).toHaveText(selected);
  await expect(
    page.getByRole("button", { name: "召唤使魔", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "查看使魔任务", exact: true }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(0);
});

test("context menu without selection uses full document and panel clamps after resize", async ({
  page,
}) => {
  const editor = page.getByLabel("书店活动提案正文");
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 0);
  });
  await editor.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(
    await editor.inputValue(),
  );
  await page.setViewportSize({ width: 640, height: 650 });
  const panel = page.getByRole("dialog", { name: "材料确认", exact: true });
  await expect
    .poll(async () => {
      const b = await panel.boundingBox();
      return !!b && b.x + b.width <= 632 && b.y + b.height <= 642;
    })
    .toBe(true);
  const box = await panel.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(460);
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(632);
  expect(box!.y + box!.height).toBeLessThanOrEqual(642);
  await page.getByRole("button", { name: "关闭浮层", exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test("Gemini result continues its original snapshot and mode without a second request", async ({
  page,
}) => {
  let calls = 0;
  let submitted: any;
  await page.unroute("**/api/check");
  await page.route("**/api/check", (route) => {
    calls++;
    submitted = route.request().postDataJSON();
    return route.fulfill({
      json: {
        id: submitted.snapshot.id,
        snapshot: submitted.snapshot,
        instruction: submitted.instruction,
        operation: "check",
        status: "completed",
        execution: "gemini",
        schemaVersion: "gemini-check-1",
        createdAt: new Date().toISOString(),
        outcome: "needs_information",
        findings: [],
        missingInformation: ["测试：请补充报名渠道"],
        metadata: {
          modelId: "mock-only",
          promptVersion: "check-1",
          validatorVersion: "evidence-1",
          durationMs: 1,
        },
      },
    });
  });
  const editor = page.getByLabel("书店活动提案正文");
  const original = await editor.inputValue();
  await editor.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
  await page.getByLabel("补充要求", { exact: true }).fill("测试要求");
  await page
    .getByRole("button", { name: "运行 Gemini 检查", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini：需要补充信息" }),
  ).toBeVisible();
  await editor.fill("原文后来已改变，不应替换旧副本");
  await expect(
    page.getByText("原文已变化或不可用：这是旧版本的结果，不代表当前材料。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续召唤使魔", exact: true }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(original);
  await expect(page.getByLabel("执行方式", { exact: true })).toHaveValue(
    "gemini",
  );
  await expect(page.getByLabel("委托要求", { exact: true })).toHaveValue(
    "测试要求",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "关闭浮层", exact: true }).click();
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await page.getByRole("button", { name: "查看检查结果", exact: true }).click();
  await page.getByRole("button", { name: "继续召唤使魔", exact: true }).click();
  await expect(page.locator(".overlay")).toHaveCount(0);
  await expect(page.getByTestId("snapshot-text")).toHaveText(original);
  expect(calls).toBe(1);
});

test("an open draft cannot be replaced by background panels while documents remain editable", async ({
  page,
}) => {
  await page.getByLabel("书店活动提案正文").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  for (const name of [
    "打开基础能力",
    "处理记录",
    "魔法书",
    "灵感熔炉",
    "查看使魔任务",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await page.getByRole("button", { name: "打开场地说明", exact: true }).click();
  await page.getByLabel("场地说明正文").fill("可以继续编辑另一份文档");
  await expect(page.getByTestId("snapshot-text")).not.toContainText(
    "可以继续编辑另一份文档",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "打开基础能力", exact: true }),
  ).toBeEnabled();
});
