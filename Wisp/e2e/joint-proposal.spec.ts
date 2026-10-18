import { test, expect, type Page } from "@playwright/test";
async function enable(page: Page) {
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("checkbox", { name: /Helpful proposals/ });
  if (!(await toggle.isChecked())) {
    await toggle.check();
    await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Close Grimoire" }).click();
}
async function switchPair(page: Page) {
  for (const name of [
    "Open Bookstore event proposal",
    "Open Venue notes",
    "Open Bookstore event proposal",
    "Open Venue notes",
  ])
    await page.getByRole("button", { name, exact: true }).click();
}
async function offer(page: Page) {
  await enable(page);
  await switchPair(page);
  await expect(
    page.getByRole("button", { name: "View the two materials", exact: true }),
  ).toBeVisible();
}
test("joint confirmation preserves two full sources, persists one result, copies provenance and rechecks versions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Bookstore event proposal text")
    .fill("😀甲第一行\n甲第二行\n甲第三行\n甲第四行");
  await page
    .getByLabel("Venue notes text")
    .fill("乙第一行\n乙第二行\n乙第三行\n乙第四行");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await expect(page.getByTestId("save-venue")).toHaveText("saved");
  await offer(page);
  await page.getByRole("button", { name: "View the two materials", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Joint material confirmation" }),
  ).toBeVisible();
  await expect(page.getByTestId("joint-source")).toHaveCount(2);
  await page.getByLabel("Excerpt length for this run").selectOption("3");
  await page
    .getByRole("button", { name: "Organize two texts", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "Joint organization of two texts", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("joint-result-source")).toHaveCount(2);
  for (const section of await page.getByTestId("joint-result-source").all())
    await expect(section.locator("blockquote")).toHaveCount(3);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).jointCopy = text;
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy joint result" }).click();
  await expect(
    page.getByText("Copied joint result", { exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(() => (window as any).jointCopy);
  for (const text of [
    "Bookstore event proposal",
    "Venue notes",
    "proposal",
    "venue",
    "Version 2",
    "UTF-16",
    "😀甲第一行",
    "乙第一行",
  ])
    expect(copied).toContain(text);
  await page.screenshot({ path: "test-results/english/joint-result.png" });
  await page.getByRole("button", { name: "Close joint result" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View joint result" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "View joint result" }).click();
  await expect(page.getByTestId("joint-result-source")).toHaveCount(2);
  await page.getByRole("button", { name: "Close joint result" }).click();
  await page.getByRole("button", { name: "Close run history" }).click();
  await page.getByLabel("Venue notes text").fill("乙新版本");
  await expect(page.getByTestId("save-venue")).toHaveText("saved");
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page.getByRole("button", { name: "View joint result" }).click();
  await expect(
    page.getByText("The source has changed or is unavailable. This result uses an older version and does not represent the current material.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Confirm both full texts again" }).click();
  await expect(
    page.getByRole("dialog", { name: "Joint material confirmation" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("joint-source").filter({ hasText: "乙新版本" }),
  ).toHaveCount(1);
});
test("acceptance and cancellation do not save, failed persistence is retryable", async ({
  page,
}) => {
  await page.goto("/");
  await offer(page);
  await page.getByRole("button", { name: "View the two materials" }).click();
  await page.getByRole("button", { name: "Cancel joint organization" }).click();
  await switchPair(page);
  await expect(page.getByRole("button", { name: "View the two materials" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View joint result" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close run history" }).click();
  await page.reload();
  await offer(page);
  await page.getByRole("button", { name: "View the two materials" }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks" && args[0].operation === "joint") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟联合整理保存失败");
      }
      return original.apply(this, args);
    };
  });
  await page
    .getByRole("button", { name: "Organize two texts", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("模拟联合整理保存失败");
  await expect(page.getByTestId("joint-result-source")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Organize two texts", exact: true })
    .click();
  await expect(page.getByTestId("joint-result-source")).toHaveCount(2);
});
test("disabled and empty materials do not trigger; edited sources expire a visible proposal", async ({
  page,
}) => {
  await page.goto("/");
  await switchPair(page);
  await expect(page.getByRole("button", { name: "View the two materials" })).toHaveCount(
    0,
  );
  await page.getByLabel("Venue notes text").fill(" ");
  await expect(page.getByTestId("save-venue")).toHaveText("saved");
  await enable(page);
  await switchPair(page);
  await expect(page.getByRole("button", { name: "View the two materials" })).toHaveCount(
    0,
  );
  await page.getByLabel("Venue notes text").fill("恢复内容");
  await expect(page.getByTestId("save-venue")).toHaveText("saved");
  await switchPair(page);
  await expect(
    page.getByRole("button", { name: "View the two materials" }),
  ).toBeVisible();
  await page.getByLabel("Venue notes text").fill("提议出现后又改了");
  await expect(page.getByRole("button", { name: "View the two materials" })).toHaveCount(
    0,
  );
  await switchPair(page);
  await expect(page.getByRole("button", { name: "View the two materials" })).toHaveCount(
    0,
  );
});

test("confirmed copies stay frozen and result retry or explicit update requires renewed confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await offer(page);
  await page.getByRole("button", { name: "View the two materials" }).click();
  const original = await page.getByTestId("joint-source").allTextContents();
  // Explicitly inject a local edit while the modal is open to exercise a concurrent-change boundary.
  await page.getByLabel("Bookstore event proposal text").evaluate(el => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, "确认之后的新甲");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(
    page.getByRole("button", { name: "Update both current full texts" }),
  ).toBeVisible();
  expect(await page.getByTestId("joint-source").allTextContents()).toEqual(
    original,
  );
  await page
    .getByRole("button", { name: "Organize two texts", exact: true })
    .click();
  await expect(
    page.getByText("The source has changed or is unavailable. This result uses an older version and does not represent the current material.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    page
      .getByTestId("joint-result-source")
      .filter({ hasText: "确认之后的新甲" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm both full texts again" }).click();
  await expect(
    page.getByRole("dialog", { name: "Joint material confirmation" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("joint-source").filter({ hasText: "确认之后的新甲" }),
  ).toHaveCount(1);
  await page.getByLabel("Venue notes text").evaluate(el => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, "再次确认后的新乙");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Update both current full texts" }).click();
  await expect(
    page.getByRole("button", { name: "Organize two texts", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("joint-result-source")).toHaveCount(0);
  await expect(
    page.getByTestId("joint-source").filter({ hasText: "再次确认后的新乙" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Organize two texts", exact: true })
    .click();
  await expect(
    page
      .getByTestId("joint-result-source")
      .filter({ hasText: "确认之后的新甲" }),
  ).toHaveCount(1);
  await expect(
    page
      .getByTestId("joint-result-source")
      .filter({ hasText: "再次确认后的新乙" }),
  ).toHaveCount(1);
  await page.getByRole("dialog").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: "test-results/english/joint-updated-result.png" });
});
