import { test, expect, type Page } from "@playwright/test";
async function summon(page: Page, role = "Page Sprite") {
  await page
    .getByRole("button", { name: "打开书店活动提案", exact: true })
    .click();
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await page.getByRole("button", { name: role, exact: false }).click();
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "材料确认" }),
  ).not.toBeVisible();
}
for (const [role, heading] of [
  ["Scout Bat", "发现需要核对的安排"],
  ["Page Sprite", "原文摘录整理"],
  ["Alchemy Imp", "活动介绍模板草稿"],
]) {
  test(`${role} returns a local one-shot reply, persists and archives`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await summon(page, role);
    await page
      .getByRole("button", { name: "打开场地说明", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "使魔任务状态" }),
    ).toContainText("1 封未读");
    await page.reload();
    await page.getByRole("button", { name: "查看使魔任务" }).click();
    await expect(page.getByTestId("task-card")).toHaveCount(1);
    await page.getByRole("button", { name: "查看回信" }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/summon-${role.split(" ")[0]}.png`,
    });
    await page
      .getByRole("button", {
        name: role === "Scout Bat" ? "关闭检查结果" : "关闭处理结果",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "收好记录" }).click();
    await expect(page.getByTestId("task-card")).toContainText("已收好");
    await page.reload();
    await page.getByRole("button", { name: "查看使魔任务" }).click();
    await expect(page.getByTestId("task-card")).toContainText("已收好");
    await page.getByRole("button", { name: "查看回信" }).click();
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
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
  await holdWorker(page);
  await summon(page);
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 项进行中");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(other.getByTestId("task-card")).toContainText("处理中");
  await other.getByRole("button", { name: "召回任务" }).click();
  await expect(other.getByTestId("task-card")).toContainText("已召回");
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("0 项进行中");
  await page.reload();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toContainText("已召回");
  await expect(page.getByRole("button", { name: "查看回信" })).toHaveCount(0);
});
test("reload interrupts unfinished work and retry requires a fresh confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
  await holdWorker(page);
  await summon(page);
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 项进行中");
  await page.reload();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toContainText("已中断");
  await page.getByRole("button", { name: "重新委托当前全文" }).click();
  await expect(page.getByRole("dialog", { name: "材料确认" })).toBeVisible();
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(2);
});

test("enqueue failure keeps confirmation; worker failure creates no reply; fresh retry succeeds", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "打开书店活动提案", exact: true })
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
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "材料确认" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("模拟委托写入失败");
  await page.evaluate(() => {
    (window as any).Worker = class {
      constructor() {
        throw new Error("模拟 Worker 不可用");
      }
    };
  });
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toContainText("失败");
  await expect(page.getByRole("button", { name: "查看回信" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await page.getByRole("button", { name: "重新委托当前全文" }).click();
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
});

test("selected material remains frozen while document changes and double submission stays singular", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByLabel("书店活动提案正文");
  await editor.fill("只带走这一行\n不带走的私有内容");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await editor.press("Control+Home");
  for (let i = 0; i < "只带走这一行".length; i++)
    await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Summon" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText("只带走这一行");
  await page.getByRole("button", { name: "召唤使魔", exact: true }).dblclick();
  await expect(
    page.getByRole("dialog", { name: "材料确认" }),
  ).not.toBeVisible();
  await editor.fill("已经更改的正文");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await page.getByRole("button", { name: "查看回信" }).click();
  await expect(
    page.getByText("原文已变化或不可用：这是旧版本的结果，不代表当前材料。"),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "魔法书" })).toContainText(
    "只带走这一行",
  );
  await expect(page.getByRole("dialog", { name: "魔法书" })).not.toContainText(
    "不带走的私有内容",
  );
});
test("reply save failure never creates an unread or completed reply", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
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
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toContainText("模拟回信保存失败");
  await expect(page.getByRole("button", { name: "查看回信" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toContainText("失败");
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("0 封未读");
});
