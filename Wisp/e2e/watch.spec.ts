import { test, expect, type Page } from "@playwright/test";
async function offer(page: Page) {
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("checkbox", { name: /Helpful proposals/ });
  if (!(await toggle.isChecked())) {
    await toggle.check();
    await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  await page
    .getByRole("button", { name: "打开书店活动提案", exact: true })
    .click();
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await page.getByRole("button", { name: "运行本地检查", exact: true }).click();
  await page.getByRole("button", { name: "关闭检查结果" }).click();
  await page.getByRole("button", { name: "查看关注范围" }).click();
  await expect(
    page.getByRole("dialog", { name: "持续关注确认" }),
  ).toBeVisible();
}
async function start(page: Page) {
  await offer(page);
  await page.getByRole("button", { name: "确认开始关注", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "持续关注确认" })).toHaveCount(
    0,
  );
}
async function edit(page: Page, text: string) {
  await page.getByLabel("书店活动提案正文").fill(text);
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
}
const valid = "活动于11月8日开放。海报于11月10日定稿，随后开放报名。";
test("watch requires consent, checks saved changes, keeps replies and stops independently of proposals", async ({
  page,
}) => {
  await page.goto("/");
  await offer(page);
  await page.getByRole("button", { name: "取消持续关注" }).click();
  await edit(page, valid);
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(0);
  await page.reload();
  await start(page);
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 项关注");
  await edit(page, valid + "\n已调整文本");
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page.getByTestId("task-card")).toContainText("持续关注检查");
  await page.getByRole("button", { name: "查看回信" }).click();
  await expect(
    page.getByRole("heading", { name: "发现需要核对的安排", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭检查结果" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).uncheck();
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  await edit(page, valid + "\n关闭提议后继续关注");
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(2);
  await page.getByRole("button", { name: "停止关注", exact: true }).click();
  await expect(page.getByTestId("watch-card")).toContainText("已停止");
  await page.screenshot({ path: "docs/screenshots/watch-stopped.png" });
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  await edit(page, valid + "\n停止后的变化");
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "查看使魔任务" }).click();
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
  await other.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(other.getByTestId("watch-card")).toContainText("关注中");
  await edit(page, valid);
  await expect(other.getByTestId("task-card")).toHaveCount(1);
  await expect(other.getByTestId("task-card")).toContainText("已完成");
  await page.close();
  await expect(other.getByTestId("watch-card")).toContainText("已中断");
  await other.getByRole("button", { name: "关闭魔法书" }).click();
  await other.reload();
  await edit(other, valid + "\n无人关注时变化");
  await other.waitForTimeout(2200);
  await other.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(other.getByTestId("task-card")).toHaveCount(1);
  await other
    .getByRole("button", { name: "重新确认关注", exact: true })
    .click();
  await expect(
    other.getByRole("dialog", { name: "持续关注确认" }),
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
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 项进行中");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "查看使魔任务" }).click();
  await other.getByRole("button", { name: "停止关注", exact: true }).click();
  await expect(other.getByTestId("task-card")).toContainText("已召回");
  await expect(other.getByRole("button", { name: "查看回信" })).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("0 项关注");
});

test("watch skips empty revisions and checks only the latest revision queued during processing", async ({
  page,
}) => {
  await page.goto("/");
  await start(page);
  await edit(page, "");
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("watch-card")).toContainText("已跳过");
  await expect(page.getByTestId("task-card")).toHaveCount(0);
  await page.getByRole("button", { name: "关闭魔法书" }).click();
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
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 项进行中");
  await edit(page, valid + "\n中间修订");
  await edit(page, valid + "\n最终修订");
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("2 封未读", { timeout: 12000 });
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(2);
  await page.getByTestId("task-card").first().getByText("查看委托范围").click();
  await expect(page.getByTestId("task-card").first()).toContainText("最终修订");
  await page.reload();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("watch-card")).toContainText("已中断");
  await expect(page.getByTestId("task-card")).toHaveCount(2);
});
