import { test, expect } from "@playwright/test";
test("initial active material matches the frontmost restored window", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
  const front = await page
    .locator(".desktop-window")
    .evaluateAll((windows) =>
      windows
        .sort(
          (a, b) =>
            Number((b as HTMLElement).style.zIndex) -
            Number((a as HTMLElement).style.zIndex),
        )[0]
        .getAttribute("aria-label"),
    );
  await expect(page.locator(".desktop-window.active")).toHaveAttribute(
    "aria-label",
    front!,
  );
});
