import { editDocument } from "./document-editor";
import { test, expect, type Locator } from "./offline-app";

async function motionRange(target: Locator) {
  return target.evaluate(
    (element) =>
      new Promise<{ x: number; y: number }>((resolve) => {
        const start = performance.now();
        const xs: number[] = [];
        const ys: number[] = [];
        const sample = () => {
          const rect = element.getBoundingClientRect();
          xs.push(rect.x);
          ys.push(rect.y);
          if (performance.now() - start < 450) requestAnimationFrame(sample);
          else
            resolve({
              x: Math.max(...xs) - Math.min(...xs),
              y: Math.max(...ys) - Math.min(...ys),
            });
        };
        requestAnimationFrame(sample);
      }),
  );
}

test.beforeEach(async ({ page }) => {
  // This suite never sends API traffic to a running service or model.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Companion test: API disabled" }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
});

test("wand cursor loads while text and resize resources retain their semantic fallbacks", async ({
  page,
}) => {
  const cursor = await page
    .locator(".desktop")
    .evaluate((element) => getComputedStyle(element).cursor);
  const resource = cursor.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
  expect(resource).toBeTruthy();
  expect(
    await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src!;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, resource),
  ).toEqual([24, 24]);
  await expect((await editDocument(page, "Bookstore event proposal"))).toHaveCSS(
    "cursor",
    /wand-text\.svg.*\) 12 12, text$/,
  );
  await expect(page.getByLabel("Resize Bookstore event proposal")).toHaveCSS(
    "cursor",
    /wand-resize\.svg.*\) 12 12, nwse-resize$/,
  );
});

test("following settles into gentle idle motion and resumes with pointer movement", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  await page.mouse.move(1000, 650);
  await expect(companion).toHaveAttribute("data-state", "following");
  await expect(companion).toHaveAttribute("data-state", "idle");
  const before = await companion.boundingBox();
  const motion = await motionRange(companion.locator(".wisp-sprite"));
  expect(motion.y).toBeGreaterThan(0.1);
  expect(motion.y).toBeLessThan(before!.height / 4);
  await page.mouse.move(550, 700);
  await expect(companion).toHaveAttribute("data-state", "following");
  await expect
    .poll(async () => (await companion.boundingBox())!.x)
    .toBeLessThan(before!.x - 100);
});

test("focus and text selection yield to the corner without interrupting editing", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  const editor = (await editDocument(page, "Bookstore event proposal"));
  await editor.fill(
    "选中这段文字以后，小魔女应当让开。\n仍然可以继续输入文字。",
  );
  await expect(editor).toBeFocused();
  await expect(companion).toHaveAttribute("data-state", "yielding");
  await page.mouse.move(1100, 650);
  await expect(companion).toHaveAttribute("data-state", "yielding");
  await expect
    .poll(async () => {
      const box = (await companion.boundingBox())!;
      const viewport = page.viewportSize()!;
      return box.x > viewport.width / 2 && box.y > viewport.height / 2;
    })
    .toBe(true);
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("编辑未受影响。");
  await expect(editor).toHaveValue(/编辑未受影响。$/);
  await page.keyboard.press("Control+Home");
  const box = (await editor.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 14, { steps: 8 });
  await expect(companion).toHaveAttribute("data-state", "yielding");
  await page.mouse.up();
  expect(
    await editor.evaluate(
      (element: HTMLTextAreaElement) =>
        element.selectionEnd > element.selectionStart,
    ),
  ).toBe(true);
  await expect(companion).toHaveAttribute("data-state", "yielding");
  await page.mouse.click(1200, 650);
  await expect(editor).not.toBeFocused();
  await page.mouse.move(1100, 700);
  await expect(companion).toHaveAttribute("data-state", "following");
});

test("window dragging yields while held and restores following after release", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  const window = page.getByRole("region", { name: "Bookstore event proposal window" });
  const title = window.locator(".window-titlebar");
  const before = (await window.boundingBox())!;
  const bar = (await title.boundingBox())!;
  await page.mouse.move(bar.x + 120, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + 220, bar.y + bar.height / 2 + 65, { steps: 8 });
  await expect(companion).toHaveAttribute("data-state", "yielding");
  await expect
    .poll(async () => (await window.boundingBox())!.x)
    .toBeGreaterThan(before.x + 50);
  await page.mouse.up();
  await expect(companion).not.toHaveAttribute("data-state", "yielding");
  await page.mouse.move(1100, 700);
  await expect(companion).toHaveAttribute("data-state", "following");
});

test("companion remains inside the viewport at corners and after a resize", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  await page.setViewportSize({ width: 640, height: 650 });
  for (const [x, y] of [
    [1, 1],
    [638, 1],
    [638, 648],
    [1, 648],
  ]) {
    await page.mouse.move(x, y);
    await expect(companion).toHaveAttribute("data-state", "idle");
    await expect
      .poll(async () => {
        const box = (await companion.boundingBox())!;
        return (
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= 640 &&
          box.y + box.height <= 650
        );
      })
      .toBe(true);
  }
});

test("reduced motion stays fixed and menu and visibility settings remain usable", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Reduce motion").check();
  await page.keyboard.press("Escape");
  await expect(companion).toHaveClass("companion still");
  await expect(companion).toHaveAttribute("data-state", "still");
  const before = await companion.boundingBox();
  await page.mouse.move(120, 650);
  await page.mouse.move(1100, 700);
  expect(await companion.boundingBox()).toEqual(before);
  expect(await motionRange(companion.locator(".wisp-sprite"))).toEqual({
    x: 0,
    y: 0,
  });
  await page.keyboard.press("q");
  await expect(page.getByRole("menu", { name: "Core abilities" })).toBeVisible();
  await expect(companion).toHaveCount(1);
  await expect(companion).toHaveAttribute("data-state", "casting");
  await expect(page.locator(".ring-center .wisp-sprite")).toHaveCount(0);
  expect(await motionRange(companion.locator(".wisp-sprite"))).toEqual({
    x: 0,
    y: 0,
  });
  await page.keyboard.press("Escape");
  await expect(companion).toHaveAttribute("data-state", "still");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Show the witch").uncheck();
  await expect(companion).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await expect(page.getByRole("menu", { name: "Core abilities" })).toBeVisible();
  await expect(page.locator(".ring-center .wisp-sprite")).toHaveCount(0);
});

test("system reduced motion takes effect immediately and normal motion can resume", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.mouse.move(1000, 650);
  await expect(companion).toHaveAttribute("data-state", "following");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(companion).toHaveClass("companion still");
  await expect(companion).toHaveAttribute("data-state", "still");
  const fixed = await companion.boundingBox();
  await page.mouse.move(200, 650);
  expect(await companion.boundingBox()).toEqual(fixed);
  expect(await motionRange(companion.locator(".wisp-sprite"))).toEqual({
    x: 0,
    y: 0,
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.mouse.move(900, 700);
  await expect(companion).toHaveAttribute("data-state", "following");
  await expect(companion).not.toHaveClass(/\bstill\b/);
  await expect
    .poll(async () => (await companion.boundingBox())!.x)
    .toBeLessThan(fixed!.x - 100);
  await expect(companion).toHaveAttribute("data-state", "idle");
});
