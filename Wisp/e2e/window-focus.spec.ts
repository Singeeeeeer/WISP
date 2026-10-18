import { test, expect } from "./offline-app";
test("initial active material matches the frontmost restored window", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
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
