import { test, expect, type Page } from "@playwright/test";
async function settings(page: Page) {
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}
async function enable(page: Page) {
  await settings(page);
  const toggle = page.getByRole("checkbox", { name: /Helpful proposals/ });
  if (!(await toggle.isChecked())) {
    await toggle.check();
    await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Close Grimoire" }).click();
}
async function openUnderstand(page: Page) {
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Understand", exact: true }).click();
}
async function extract(page: Page) {
  await openUnderstand(page);
  await page.getByRole("button", { name: "Organize source excerpts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Source excerpt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close result" }).click();
}
async function offer(page: Page) {
  await enable(page);
  for (let i = 0; i < 3; i++) await extract(page);
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toBeVisible();
}
test("proposal saves only after confirmation and applies to new direct and familiar excerpts", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Bookstore event proposal text")
    .fill("一\n二\n三\n四\n五\n六\n七\n八\n九");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await offer(page);
  await page.screenshot({ path: "test-results/english/proposal-invitation.png" });
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save preference", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save preference", exact: true }).click();
  await expect(
    page.getByText("Confirmed: brief excerpt (up to 3 non-empty lines)", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await openUnderstand(page);
  await expect(page.getByLabel("Excerpt length for this run")).toHaveValue("3");
  await page.getByRole("button", { name: "Organize source excerpts", exact: true }).click();
  await expect(
    page.getByText("Non-empty lines not shown: 6.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close result" }).click();
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await expect(page.getByLabel("Excerpt length for this run")).toHaveValue("3");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByRole("button", { name: "View reply" })).toBeVisible();
  await page.getByRole("button", { name: "View reply" }).click();
  await expect(
    page.getByText("Non-empty lines not shown: 6.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "About you", exact: true }).click();
  await page.getByRole("button", { name: "Forget excerpt preference", exact: true }).click();
  await expect(page.getByText("No preference recorded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await openUnderstand(page);
  await expect(page.getByLabel("Excerpt length for this run")).toHaveValue("8");
  await page.getByRole("button", { name: "Close material panel" }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page.getByRole("button", { name: "View Understand result" }).last().click();
  await expect(
    page.getByText("Non-empty lines not shown: 1.", { exact: false }),
  ).toBeVisible();
});
test("disabled, dismissed and restored history never produce unsolicited preference saves", async ({
  page,
}) => {
  await page.goto("/");
  for (let i = 0; i < 3; i++) await extract(page);
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toHaveCount(0);
  await offer(page);
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await extract(page);
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page
    .getByRole("button", { name: "View Understand result" })
    .first()
    .click();
  await page.getByRole("button", { name: "Close result" }).click();
  await page.getByRole("button", { name: "Close run history" }).click();
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "About you", exact: true }).click();
  await expect(page.getByText("No preference recorded", { exact: true })).toBeVisible();
});

test("cancel, save failure and cross-tab preference updates preserve explicit consent", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await offer(page);
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.getByRole("button", { name: "Cancel preference confirmation" }).click();
  await expect(page.getByText("No preference recorded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await extract(page);
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toHaveCount(0);
  await page.reload();
  await offer(page);
  await page.getByRole("button", { name: "View settings", exact: true }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (
        this.name === "preferences" &&
        args[1] === "confirmed-excerpt-preference"
      ) {
        IDBObjectStore.prototype.put = original;
        throw new Error("模拟偏好保存失败");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Save preference", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("模拟偏好保存失败");
  await expect(
    page.getByRole("button", { name: "Save preference", exact: true }),
  ).toBeEnabled();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Grimoire", exact: true }).click();
  await other.getByRole("button", { name: "About you", exact: true }).click();
  await expect(
    other.getByText("No preference recorded", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save preference", exact: true }).dblclick();
  await expect(
    other.getByText("Confirmed: brief excerpt (up to 3 non-empty lines)", { exact: true }),
  ).toBeVisible();
  await other.getByRole("button", { name: "Forget excerpt preference" }).click();
  await expect(page.getByText("No preference recorded", { exact: true })).toBeVisible();
});

test("Page Sprite counts once, disabling clears invitation, and confirmation can override length", async ({
  page,
}) => {
  await page.goto("/");
  await enable(page);
  for (let i = 0; i < 2; i++) await extract(page);
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await page.getByLabel("Excerpt length for this run").selectOption("3");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toBeVisible();
  await settings(page);
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).uncheck();
  await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await page.getByRole("button", { name: "View reply" }).click();
  await expect(
    page.getByRole("dialog", { name: "Grimoire" }).locator("blockquote"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "About you", exact: true }).click();
  await expect(page.getByText("No preference recorded", { exact: true })).toBeVisible();
  await page.reload();
  await openUnderstand(page);
  await expect(page.getByLabel("Excerpt length for this run")).toHaveValue("8");
  await page.getByLabel("Excerpt length for this run").selectOption("3");
  await page.getByRole("button", { name: "Organize source excerpts", exact: true }).click();
  await expect(page.getByRole("dialog").locator("blockquote")).toHaveCount(3);
});
