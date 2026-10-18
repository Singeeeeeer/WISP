import { test, expect } from "@playwright/test";

test("a stale tab cannot overwrite another saved draft", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByLabel("书店活动提案正文")).toBeVisible();
  await page.getByLabel("书店活动提案正文").fill("第一标签页的新版本");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await second.getByLabel("书店活动提案正文").fill("第二标签页未保存草稿");
  await expect(second.getByTestId("save-proposal")).toHaveText("保存失败");
  await expect(second.getByRole("alert")).toContainText("保存冲突");
  await expect(second.getByLabel("书店活动提案正文")).toHaveValue(
    "第二标签页未保存草稿",
  );
  await page.reload();
  await expect(page.getByLabel("书店活动提案正文")).toHaveValue(
    "第一标签页的新版本",
  );
});

test("invalid UTF-16 selection must not silently expand into the full document", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByLabel("书店活动提案正文");
  await editor.fill("A😀BC");
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(1, 2);
  });
  await editor.press("Shift");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await expect(page.getByRole("alert")).toContainText("选区");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("resize and layout persist, shortcuts respect editors", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "打开书店活动提案" }).click();
  const win = page.getByRole("region", { name: "书店活动提案窗口" });
  const before = await win.boundingBox();
  const grip = page.getByLabel("缩放书店活动提案");
  await grip.hover();
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width + 75,
    before!.y + before!.height + 45,
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await win.boundingBox())!.width)
    .toBeGreaterThan(before!.width);
  const resized = await win.boundingBox();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const r = (
          await import("/src/services/repository.ts")
        ).createRepository();
        const windows = await r.readPreference("windows");
        return (
          windows?.find(
            (w: { materialId: string }) => w.materialId === "proposal",
          )?.width ?? 0
        );
      }),
    )
    .toBeGreaterThan(500);
  await page.reload();
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
  await expect
    .poll(async () => (await win.boundingBox())!.width)
    .toBe(resized!.width);
  const editor = page.getByLabel("书店活动提案正文");
  await editor.click();
  await editor.press("q");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "打开基础能力" }).focus();
  await page.keyboard.press("Alt+m");
  await expect(page.getByRole("dialog", { name: "魔法书" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("capture review screenshots and confirm no external model request", async ({
  page,
  baseURL,
}) => {
  const external: string[] = [];
  const localOrigin = new URL(baseURL!).origin;
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== localOrigin)
      external.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/workspace.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await page.screenshot({
    path: "docs/screenshots/summon-preparation.png",
    fullPage: true,
  });
  expect(external).toEqual([]);
});
