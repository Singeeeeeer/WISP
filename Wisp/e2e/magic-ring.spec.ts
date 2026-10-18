import { test, expect } from "./offline-app";

test("magic ring follows invocation, keeps four directions, and stays still for selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
  await page.mouse.move(700, 400);
  await page.keyboard.press("q");
  const ring = page.getByRole("menu", { name: "Core abilities" });
  await expect(ring).toBeVisible();
  const before = await ring.boundingBox();
  expect(before!.x + before!.width / 2).toBeCloseTo(700, 0);
  expect(before!.y + before!.height / 2).toBeCloseTo(400, 0);
  const top = await page
    .getByRole("menuitem", { name: "Understand" })
    .boundingBox();
  const right = await page
    .getByRole("menuitem", { name: "Check" })
    .boundingBox();
  const bottom = await page
    .getByRole("menuitem", { name: "Create" })
    .boundingBox();
  const left = await page
    .getByRole("menuitem", { name: "Summon" })
    .boundingBox();
  expect(top!.y).toBeLessThan(right!.y);
  expect(right!.x).toBeGreaterThan(bottom!.x);
  expect(bottom!.y).toBeGreaterThan(left!.y);
  expect(left!.x).toBeLessThan(top!.x);
  await page.getByRole("menuitem", { name: "Check" }).hover();
  expect(await ring.boundingBox()).toEqual(before);
  await page.screenshot({ path: "test-results/english/magic-ring.png" });
  await page.getByRole("menuitem", { name: "Check" }).click();
  await expect(
    page.getByRole("button", { name: "Run local check" }),
  ).toBeEnabled();
});

test("ring clamps at edges and keyboard can select and dismiss", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
  await page.mouse.click(12, 780, { button: "right" });
  const ring = page.getByRole("menu", { name: "Core abilities" });
  await expect(ring).toBeVisible();
  const bounds = await ring.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menuitem", { name: "Check" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(ring).not.toBeVisible();
  await page.mouse.move(900, 400);
  await page.keyboard.press("q");
  await expect(ring).toBeVisible();
  await page.mouse.click(20, 700);
  await expect(ring).not.toBeVisible();
});

test("supplied sprite loads, follows pointer, and settings keep entries usable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const img = new Image();
      img.src = "/assets/wisp/wisp-atlas.png";
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }),
  ).toEqual([1254, 1254]);
  await page.mouse.move(1100, 650);
  await expect
    .poll(async () => (await page.locator(".companion").boundingBox())?.x)
    .toBeGreaterThan(1090);
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Reduce motion").check();
  await expect(page.locator(".companion")).toHaveClass("companion still");
  await page.getByLabel("Show the witch").uncheck();
  await expect(page.locator(".companion")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 640, height: 650 });
  await page.getByRole("button", { name: "Open core abilities" }).click();
  const ring = page.getByRole("menu", { name: "Core abilities" });
  await expect(ring).toBeVisible();
  const box = await ring.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(640);
  expect(box!.y + box!.height).toBeLessThanOrEqual(650);
  await expect(page.locator(".ring-center .wisp-sprite")).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await expect(page.getByRole("button", { name: "Summon familiar" })).toBeEnabled();
});
