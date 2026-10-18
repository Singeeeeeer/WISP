import { test, expect, type Page } from "./fixture";
async function offer(page: Page) {
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("checkbox", { name: /Helpful proposals/ });
  if (!(await toggle.isChecked())) {
    await toggle.check();
    await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await page.getByRole("button", { name: "Run local check", exact: true }).click();
  await page.getByRole("button", { name: "Close check result" }).click();
  await page.getByRole("button", { name: "View watch scope" }).click();
  await expect(
    page.getByRole("dialog", { name: "Confirm continuous watch" }),
  ).toBeVisible();
}
async function start(page: Page) {
  await offer(page);
  await page.getByRole("button", { name: "Confirm and start watching", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Confirm continuous watch" })).toHaveCount(
    0,
  );
}
async function edit(page: Page, text: string) {
  await page.getByLabel("Bookstore event proposal text").fill(text);
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
}
const valid = "The event is scheduled to open on November 8. The poster is scheduled to be finalized on November 10, followed by registration opening.";
test("watch requires consent, checks saved changes, keeps replies and stops independently of proposals", async ({
  page,
}) => {
  await page.goto("/");
  await offer(page);
  await page.getByRole("button", { name: "Cancel continuous watch" }).click();
  await edit(page, valid);
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(0);
  await page.reload();
  await start(page);
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 watched");
  await edit(page, valid + "\n已调整文本");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 unread");
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page.getByTestId("task-card")).toContainText("Continuous watch check");
  await page.getByRole("button", { name: "View reply" }).click();
  await expect(
    page.getByRole("heading", { name: "An arrangement needs review", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close check result" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).uncheck();
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await edit(page, valid + "\n关闭提议后继续关注");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 unread");
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Stop watching", exact: true }).click();
  await expect(page.getByTestId("watch-card")).toContainText("Stopped");
  await page.screenshot({ path: "test-results/english/watch-stopped.png" });
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await edit(page, valid + "\n停止后的变化");
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(2);
});
test("second tab does not duplicate watching; closing owner interrupts and never auto resumes", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await start(page);
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(other.getByTestId("watch-card")).toContainText("Watching");
  await edit(page, valid);
  await expect(other.getByTestId("task-card")).toHaveCount(1);
  await expect(other.getByTestId("task-card")).toContainText("Completed");
  await page.close();
  await expect(other.getByTestId("watch-card")).toContainText("Interrupted");
  await other.getByRole("button", { name: "Close Grimoire" }).click();
  await other.reload();
  await edit(other, valid + "\n无人关注时变化");
  await other.waitForTimeout(2200);
  await other.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(other.getByTestId("task-card")).toHaveCount(1);
  await other
    .getByRole("button", { name: "Confirm watch again", exact: true })
    .click();
  await expect(
    other.getByRole("dialog", { name: "Confirm continuous watch" }),
  ).toBeVisible();
});
test("stop cancels an in-flight watched task and suppresses late replies", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await start(page);
  await page.evaluate(() => {
    (window as any).Worker = class {
      postMessage() {}
      terminate() {}
    };
  });
  await edit(page, valid);
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 active");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "View familiar tasks" }).click();
  await other.getByRole("button", { name: "Stop watching", exact: true }).click();
  await expect(other.getByTestId("task-card")).toContainText("Cancelled");
  await expect(other.getByRole("button", { name: "View reply" })).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("0 watched");
});

test("watch skips empty revisions and checks only the latest revision queued during processing", async ({
  page,
}) => {
  await page.goto("/");
  await start(page);
  await edit(page, "");
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("watch-card")).toContainText("skipped");
  await expect(page.getByTestId("task-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await page.evaluate(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      postMessage(message: any) {
        setTimeout(() => super.postMessage(message), 2500);
      }
    };
  });
  await edit(page, valid);
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 active");
  await edit(page, valid + "\n中间修订");
  await edit(page, valid + "\n最终修订");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("2 unread", { timeout: 12000 });
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(2);
  await page.getByTestId("task-card").first().getByText("View delegation scope").click();
  await expect(page.getByTestId("task-card").first()).toContainText("最终修订");
  await page.reload();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("watch-card")).toContainText("Interrupted");
  await expect(page.getByTestId("task-card")).toHaveCount(2);
});
