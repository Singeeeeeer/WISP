import { test, expect, type Page } from "@playwright/test";
async function summon(page: Page, role = "Page Sprite") {
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await page.getByRole("button", { name: role, exact: false }).click();
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Material confirmation" }),
  ).not.toBeVisible();
}
for (const [role, heading] of [
  ["Scout Bat", "An arrangement needs review"],
  ["Page Sprite", "Source excerpt"],
  ["Alchemy Imp", "Event template draft"],
]) {
  test(`${role} returns a local one-shot reply, persists and archives`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await summon(page, role);
    await page
      .getByRole("button", { name: "Open Venue notes", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Familiar task status" }),
    ).toContainText("1 unread");
    await page.reload();
    await page.getByRole("button", { name: "View familiar tasks" }).click();
    await expect(page.getByTestId("task-card")).toHaveCount(1);
    await page.getByRole("button", { name: "View reply" }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/english/summon-${role.split(" ")[0]}.png`,
    });
    await page
      .getByRole("button", {
        name: role === "Scout Bat" ? "Close check result" : "Close result",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Archive record" }).click();
    await expect(page.getByTestId("task-card")).toContainText("Archived");
    await page.reload();
    await page.getByRole("button", { name: "View familiar tasks" }).click();
    await expect(page.getByTestId("task-card")).toContainText("Archived");
    await page.getByRole("button", { name: "View reply" }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
async function holdWorker(page: Page) {
  await page.evaluate(() => {
    (window as any).Worker = class {
      onmessage: any;
      onerror: any;
      postMessage() {}
      terminate() {}
    };
  });
}
test("a second tab does not interrupt a live task; recall wins", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal text")).toBeVisible();
  await holdWorker(page);
  await summon(page);
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 active");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(other.getByTestId("task-card")).toContainText("Running");
  await other.getByRole("button", { name: "Recall task" }).click();
  await expect(other.getByTestId("task-card")).toContainText("Cancelled");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("0 active");
  await page.reload();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toContainText("Cancelled");
  await expect(page.getByRole("button", { name: "View reply" })).toHaveCount(0);
});
test("reload interrupts unfinished work and retry requires a fresh confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal text")).toBeVisible();
  await holdWorker(page);
  await summon(page);
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 active");
  await page.reload();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toContainText("Interrupted");
  await page.getByRole("button", { name: "Delegate current full text again" }).click();
  await expect(page.getByRole("dialog", { name: "Material confirmation" })).toBeVisible();
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 unread");
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(2);
});

test("enqueue failure keeps confirmation; worker failure creates no reply; fresh retry succeeds", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "tasks") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟委托写入失败");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Material confirmation" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("模拟委托写入失败");
  await page.evaluate(() => {
    (window as any).Worker = class {
      constructor() {
        throw new Error("模拟 Worker 不可用");
      }
    };
  });
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toContainText("Failed");
  await expect(page.getByRole("button", { name: "View reply" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await page.getByRole("button", { name: "Delegate current full text again" }).click();
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 unread");
});

test("selected material remains frozen while document changes and double submission stays singular", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByLabel("Bookstore event proposal text");
  await editor.fill("只带走这一行\n不带走的私有内容");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await editor.press("Control+Home");
  for (let i = 0; i < "只带走这一行".length; i++)
    await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText("只带走这一行");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).dblclick();
  await expect(
    page.getByRole("dialog", { name: "Material confirmation" }),
  ).not.toBeVisible();
  await editor.fill("已经更改的 text");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await page.getByRole("button", { name: "View reply" }).click();
  await expect(
    page.getByText("The source has changed or is unavailable. This result uses an older version and does not represent the current material."),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Grimoire" })).toContainText(
    "只带走这一行",
  );
  await expect(page.getByRole("dialog", { name: "Grimoire" })).not.toContainText(
    "不带走的私有内容",
  );
});
test("reply save failure never creates an unread or completed reply", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal text")).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "tasks" && args[0].status === "completed") {
        IDBObjectStore.prototype.put = original;
        throw new Error("模拟回信保存失败");
      }
      return original.apply(this, args);
    };
  });
  await summon(page);
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toContainText("模拟回信保存失败");
  await expect(page.getByRole("button", { name: "View reply" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toContainText("Failed");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("0 unread");
});
