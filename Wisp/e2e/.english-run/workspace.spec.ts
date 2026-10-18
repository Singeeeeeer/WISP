import { test, expect } from "./fixture";
test("editing, frozen selection, honest capability states and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const editor = page.getByLabel("Bookstore event proposal text");
  await editor.fill("The event opens on November 8.😀海报11月10日定稿。");
  await expect(page.getByTestId("save-proposal")).toHaveText("Saved");
  await editor.press("Control+Home");
  for (let i = 0; i < "The event opens on November 8.".length; i++)
    await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  const copy = await page.getByTestId("snapshot-text").textContent();
  expect(copy).toBe("The event opens on November 8.");
  await expect(
    page.getByRole("button", { name: "Run local check" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close material panel" }).click();
  await editor.fill("New body; should not be overwritten by the example");
  await expect(page.getByTestId("save-proposal")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Bookstore event proposal text")).toHaveValue(
    "New body; should not be overwritten by the example",
  );
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await expect(page.getByText("One-time delegation · stops when complete")).toBeVisible();
  await expect(page.getByRole("button", { name: "Summon familiar" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Familiars" }).click();
  await expect(page.getByText("No delegations or simulated tasks yet.")).toBeVisible();
  expect(errors).toEqual([]);
});
test("window manipulation and settings survive reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Minimize Venue notes" }).click();
  await expect(page.getByLabel("Venue notes text")).not.toBeVisible();
  await page.getByRole("button", { name: "Open venue notes" }).click();
  await expect(page.getByLabel("Venue notes text")).toBeVisible();
  const header = page.getByTestId("drag-proposal");
  const before = await header.boundingBox();
  await header.hover({ position: { x: 160, y: 20 } });
  await page.mouse.down();
  await page.mouse.move(before!.x + 220, before!.y + 80);
  await page.mouse.up();
  const after = await header.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Reduce motion").check();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Reduce motion")).toBeChecked();
});
