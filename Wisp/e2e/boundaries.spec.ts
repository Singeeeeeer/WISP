import { editDocument } from "./document-editor";
import { test, expect } from "./offline-app";

test("a stale tab cannot overwrite another saved draft", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
  await (await editDocument(page, "Bookstore event proposal")).fill("第一标签页的新版本");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await (await editDocument(second, "Bookstore event proposal")).fill("第二标签页未保存草稿");
  await expect(second.getByTestId("save-proposal")).toHaveText("failed");
  await expect(second.getByRole("alert")).toContainText("Save conflict");
  await expect((await editDocument(second, "Bookstore event proposal"))).toHaveValue(
    "第二标签页未保存草稿",
  );
  await page.reload();
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toHaveText(
    "第一标签页的新版本",
  );
});

test("invalid UTF-16 selection must not silently expand into the full document", async ({
  page,
}) => {
  await page.goto("/");
  const editor = (await editDocument(page, "Bookstore event proposal"));
  await editor.fill("A😀BC");
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(1, 2);
  });
  await editor.press("Shift");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await expect(page.getByRole("alert")).toContainText("选区");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("resize and layout persist, shortcuts respect editors", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Bookstore event proposal" }).click();
  const win = page.getByRole("region", { name: "Bookstore event proposal window" });
  const before = await win.boundingBox();
  const grip = page.getByLabel("Resize Bookstore event proposal");
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
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await win.boundingBox())!.width)
    .toBe(resized!.width);
  const editor = (await editDocument(page, "Bookstore event proposal"));
  await editor.click();
  await editor.press("q");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Open core abilities" }).focus();
  await page.keyboard.press("Alt+m");
  await expect(page.getByRole("dialog", { name: "Grimoire" })).toBeVisible();
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
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/english/workspace.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await page.screenshot({
    path: "test-results/english/summon-preparation.png",
    fullPage: true,
  });
  expect(external).toEqual([]);
});
