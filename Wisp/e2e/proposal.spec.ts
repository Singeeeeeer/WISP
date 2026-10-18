import { test, expect, type Page } from "@playwright/test";
async function settings(page: Page) {
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}
async function enable(page: Page) {
  await settings(page);
  const toggle = page.getByRole("checkbox", { name: /Helpful proposals/ });
  if (!(await toggle.isChecked())) {
    await toggle.check();
    await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "关闭魔法书" }).click();
}
async function openUnderstand(page: Page) {
  await page
    .getByRole("button", { name: "打开书店活动提案", exact: true })
    .click();
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Understand", exact: true }).click();
}
async function extract(page: Page) {
  await openUnderstand(page);
  await page.getByRole("button", { name: "整理原文摘录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "原文摘录整理", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "关闭处理结果" }).click();
}
async function offer(page: Page) {
  await enable(page);
  for (let i = 0; i < 3; i++) await extract(page);
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toBeVisible();
}
test("proposal saves only after confirmation and applies to new direct and familiar excerpts", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("书店活动提案正文")
    .fill("一\n二\n三\n四\n五\n六\n七\n八\n九");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await offer(page);
  await page.screenshot({ path: "docs/screenshots/proposal-invitation.png" });
  await page.getByRole("button", { name: "查看设置", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存偏好", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存偏好", exact: true }).click();
  await expect(
    page.getByText("已确认：简短摘录（最多 3 个非空行）", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await openUnderstand(page);
  await expect(page.getByLabel("本次摘录长度")).toHaveValue("3");
  await page.getByRole("button", { name: "整理原文摘录", exact: true }).click();
  await expect(
    page.getByText("未展示的非空行：6。", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭处理结果" }).click();
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await expect(page.getByLabel("本次摘录长度")).toHaveValue("3");
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByRole("button", { name: "查看回信" })).toBeVisible();
  await page.getByRole("button", { name: "查看回信" }).click();
  await expect(
    page.getByText("未展示的非空行：6。", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "About you", exact: true }).click();
  await page.getByRole("button", { name: "忘记摘录偏好", exact: true }).click();
  await expect(page.getByText("还没有记录偏好", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  await openUnderstand(page);
  await expect(page.getByLabel("本次摘录长度")).toHaveValue("8");
  await page.getByRole("button", { name: "关闭材料面板" }).click();
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await page.getByRole("button", { name: "查看Understand结果" }).last().click();
  await expect(
    page.getByText("未展示的非空行：1。", { exact: false }),
  ).toBeVisible();
});
test("disabled, dismissed and restored history never produce unsolicited preference saves", async ({
  page,
}) => {
  await page.goto("/");
  for (let i = 0; i < 3; i++) await extract(page);
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toHaveCount(0);
  await offer(page);
  await page.getByRole("button", { name: "暂时不用", exact: true }).click();
  await extract(page);
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await page
    .getByRole("button", { name: "查看Understand结果" })
    .first()
    .click();
  await page.getByRole("button", { name: "关闭处理结果" }).click();
  await page.getByRole("button", { name: "关闭处理记录" }).click();
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "About you", exact: true }).click();
  await expect(page.getByText("还没有记录偏好", { exact: true })).toBeVisible();
});

test("cancel, save failure and cross-tab preference updates preserve explicit consent", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await offer(page);
  await page.getByRole("button", { name: "查看设置", exact: true }).click();
  await page.getByRole("button", { name: "取消偏好确认" }).click();
  await expect(page.getByText("还没有记录偏好", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  await extract(page);
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toHaveCount(0);
  await page.reload();
  await offer(page);
  await page.getByRole("button", { name: "查看设置", exact: true }).click();
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
  await page.getByRole("button", { name: "保存偏好", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("模拟偏好保存失败");
  await expect(
    page.getByRole("button", { name: "保存偏好", exact: true }),
  ).toBeEnabled();
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "魔法书", exact: true }).click();
  await other.getByRole("button", { name: "About you", exact: true }).click();
  await expect(
    other.getByText("还没有记录偏好", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存偏好", exact: true }).dblclick();
  await expect(
    other.getByText("已确认：简短摘录（最多 3 个非空行）", { exact: true }),
  ).toBeVisible();
  await other.getByRole("button", { name: "忘记摘录偏好" }).click();
  await expect(page.getByText("还没有记录偏好", { exact: true })).toBeVisible();
});

test("Page Sprite counts once, disabling clears invitation, and confirmation can override length", async ({
  page,
}) => {
  await page.goto("/");
  await enable(page);
  for (let i = 0; i < 2; i++) await extract(page);
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await page.getByLabel("本次摘录长度").selectOption("3");
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toBeVisible();
  await settings(page);
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).uncheck();
  await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await page.getByRole("button", { name: "查看回信" }).click();
  await expect(
    page.getByRole("dialog", { name: "魔法书" }).locator("blockquote"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "About you", exact: true }).click();
  await expect(page.getByText("还没有记录偏好", { exact: true })).toBeVisible();
  await page.reload();
  await openUnderstand(page);
  await expect(page.getByLabel("本次摘录长度")).toHaveValue("8");
  await page.getByLabel("本次摘录长度").selectOption("3");
  await page.getByRole("button", { name: "整理原文摘录", exact: true }).click();
  await expect(page.getByRole("dialog").locator("blockquote")).toHaveCount(3);
});
