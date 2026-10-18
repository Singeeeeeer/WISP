import { test, expect } from "@playwright/test";
test("editing, frozen selection, honest capability states and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const editor = page.getByLabel("书店活动提案正文");
  await editor.fill("活动于11月8日开放。😀海报11月10日定稿。");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await editor.press("Control+Home");
  for (let i = 0; i < "活动于11月8日开放。".length; i++)
    await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  const copy = await page.getByTestId("snapshot-text").textContent();
  expect(copy).toBe("活动于11月8日开放。");
  await expect(
    page.getByRole("button", { name: "运行本地检查" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "关闭材料面板" }).click();
  await editor.fill("新的正文，不应被示例覆盖");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await page.reload();
  await expect(page.getByLabel("书店活动提案正文")).toHaveValue(
    "新的正文，不应被示例覆盖",
  );
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await expect(page.getByText("一次性委托 · 完成后停止")).toBeVisible();
  await expect(page.getByRole("button", { name: "召唤使魔" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Familiars" }).click();
  await expect(page.getByText("还没有委托，也没有模拟任务。")).toBeVisible();
  expect(errors).toEqual([]);
});
test("window manipulation and settings survive reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "最小化场地说明" }).click();
  await expect(page.getByLabel("场地说明正文")).not.toBeVisible();
  await page.getByRole("button", { name: "打开场地说明" }).click();
  await expect(page.getByLabel("场地说明正文")).toBeVisible();
  const header = page.getByTestId("drag-proposal");
  const before = await header.boundingBox();
  await header.hover({ position: { x: 160, y: 20 } });
  await page.mouse.down();
  await page.mouse.move(before!.x + 220, before!.y + 80);
  await page.mouse.up();
  const after = await header.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("减少动态效果").check();
  await expect(page.getByText("设置已保存")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("减少动态效果")).toBeChecked();
});
