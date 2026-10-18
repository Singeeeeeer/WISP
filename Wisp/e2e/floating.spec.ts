import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/check", (route) => route.abort());
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
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
  const editor = page.getByLabel("Bookstore event proposal text");
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 12);
    el.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const selected = (await editor.inputValue()).slice(0, 12);
  await editor.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Understand", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Material confirmation", exact: true });
  await expect(panel).toHaveAttribute("aria-modal", "false");
  await expect(page.getByTestId("snapshot-text")).toHaveText(selected);
  const bounds = await panel.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(460);
  expect(bounds!.height).toBeLessThanOrEqual(560);
  await expect(page.locator(".overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "Organize source excerpts", exact: true }).click();
  await page.getByRole("button", { name: "Copy result", exact: true }).click();
  await expect(page.getByText("Result copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).copied)).toContain(
    selected.trim(),
  );
  await page.screenshot({ path: "test-results/english/floating-result.png" });
  await page.getByRole("button", { name: "Summon familiar again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Page Sprite/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("snapshot-text")).toHaveText(selected);
  await expect(
    page.getByRole("button", { name: "Summon familiar", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "View familiar tasks", exact: true }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(0);
});

test("context menu without selection uses full document and panel clamps after resize", async ({
  page,
}) => {
  const editor = page.getByLabel("Bookstore event proposal text");
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
  const panel = page.getByRole("dialog", { name: "Material confirmation", exact: true });
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
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
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
  const editor = page.getByLabel("Bookstore event proposal text");
  const original = await editor.inputValue();
  await editor.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await page.getByLabel("Additional instruction", { exact: true }).fill("测试要求");
  await page
    .getByRole("button", { name: "Run Gemini Check", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini: more information needed" }),
  ).toBeVisible();
  await editor.fill("原文后来已改变，不应替换旧副本");
  await expect(
    page.getByText("The source has changed or is unavailable. This result uses an older version and does not represent the current material."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Summon familiar again", exact: true }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(original);
  await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
    "gemini",
  );
  await expect(page.getByLabel("Delegation instruction", { exact: true })).toHaveValue(
    "测试要求",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Close panel", exact: true }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page.getByRole("button", { name: "View check result", exact: true }).click();
  await page.getByRole("button", { name: "Summon familiar again", exact: true }).click();
  await expect(page.locator(".overlay")).toHaveCount(0);
  await expect(page.getByTestId("snapshot-text")).toHaveText(original);
  expect(calls).toBe(1);
});

test("an open draft cannot be replaced by background panels while documents remain editable", async ({
  page,
}) => {
  await page.getByLabel("Bookstore event proposal text").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  for (const name of [
    "Open core abilities",
    "Run history",
    "Grimoire",
    "Inspiration Cauldron",
    "View familiar tasks",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await page.getByRole("button", { name: "Open Venue notes", exact: true }).click();
  await page.getByLabel("Venue notes text").fill("可以继续编辑另一份文档");
  await expect(page.getByTestId("snapshot-text")).not.toContainText(
    "可以继续编辑另一份文档",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open core abilities", exact: true }),
  ).toBeEnabled();
});
