import { test, expect, type Page } from "@playwright/test";
async function enable(page: Page) {
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("checkbox", { name: /Helpful proposals/ });
  if (!(await toggle.isChecked())) {
    await toggle.check();
    await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "关闭魔法书" }).click();
}
async function switchPair(page: Page) {
  for (const name of [
    "打开书店活动提案",
    "打开场地说明",
    "打开书店活动提案",
    "打开场地说明",
  ])
    await page.getByRole("button", { name, exact: true }).click();
}
async function offer(page: Page) {
  await enable(page);
  await switchPair(page);
  await expect(
    page.getByRole("button", { name: "查看两份材料", exact: true }),
  ).toBeVisible();
}
test("joint confirmation preserves two full sources, persists one result, copies provenance and rechecks versions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("书店活动提案正文")
    .fill("😀甲第一行\n甲第二行\n甲第三行\n甲第四行");
  await page
    .getByLabel("场地说明正文")
    .fill("乙第一行\n乙第二行\n乙第三行\n乙第四行");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await expect(page.getByTestId("save-venue")).toHaveText("已保存");
  await offer(page);
  await page.getByRole("button", { name: "查看两份材料", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "联合整理材料确认" }),
  ).toBeVisible();
  await expect(page.getByTestId("joint-source")).toHaveCount(2);
  await page.getByLabel("本次摘录长度").selectOption("3");
  await page
    .getByRole("button", { name: "联合整理两份文本", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", { name: "两份文本的联合整理", exact: true }),
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
  await page.getByRole("button", { name: "复制联合整理结果" }).click();
  await expect(
    page.getByText("已复制联合整理结果", { exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(() => (window as any).jointCopy);
  for (const text of [
    "书店活动提案",
    "场地说明",
    "proposal",
    "venue",
    "版本 2",
    "UTF-16",
    "😀甲第一行",
    "乙第一行",
  ])
    expect(copied).toContain(text);
  await page.screenshot({ path: "docs/screenshots/joint-result.png" });
  await page.getByRole("button", { name: "关闭联合整理结果" }).click();
  await page.reload();
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看联合整理结果" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "查看联合整理结果" }).click();
  await expect(page.getByTestId("joint-result-source")).toHaveCount(2);
  await page.getByRole("button", { name: "关闭联合整理结果" }).click();
  await page.getByRole("button", { name: "关闭处理记录" }).click();
  await page.getByLabel("场地说明正文").fill("乙新版本");
  await expect(page.getByTestId("save-venue")).toHaveText("已保存");
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await page.getByRole("button", { name: "查看联合整理结果" }).click();
  await expect(
    page.getByText("原文已变化或不可用：这是旧版本的结果，不代表当前材料。", {
      exact: true,
    }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "重新确认两份全文" }).click();
  await expect(
    page.getByRole("dialog", { name: "联合整理材料确认" }),
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
  await page.getByRole("button", { name: "查看两份材料" }).click();
  await page.getByRole("button", { name: "取消联合整理" }).click();
  await switchPair(page);
  await expect(page.getByRole("button", { name: "查看两份材料" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看联合整理结果" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "关闭处理记录" }).click();
  await page.reload();
  await offer(page);
  await page.getByRole("button", { name: "查看两份材料" }).click();
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
    .getByRole("button", { name: "联合整理两份文本", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("模拟联合整理保存失败");
  await expect(page.getByTestId("joint-result-source")).toHaveCount(0);
  await page
    .getByRole("button", { name: "联合整理两份文本", exact: true })
    .click();
  await expect(page.getByTestId("joint-result-source")).toHaveCount(2);
});
test("disabled and empty materials do not trigger; edited sources expire a visible proposal", async ({
  page,
}) => {
  await page.goto("/");
  await switchPair(page);
  await expect(page.getByRole("button", { name: "查看两份材料" })).toHaveCount(
    0,
  );
  await page.getByLabel("场地说明正文").fill(" ");
  await expect(page.getByTestId("save-venue")).toHaveText("已保存");
  await enable(page);
  await switchPair(page);
  await expect(page.getByRole("button", { name: "查看两份材料" })).toHaveCount(
    0,
  );
  await page.getByLabel("场地说明正文").fill("恢复内容");
  await expect(page.getByTestId("save-venue")).toHaveText("已保存");
  await switchPair(page);
  await expect(
    page.getByRole("button", { name: "查看两份材料" }),
  ).toBeVisible();
  await page.getByLabel("场地说明正文").fill("提议出现后又改了");
  await expect(page.getByRole("button", { name: "查看两份材料" })).toHaveCount(
    0,
  );
  await switchPair(page);
  await expect(page.getByRole("button", { name: "查看两份材料" })).toHaveCount(
    0,
  );
});

test("confirmed copies stay frozen and result retry or explicit update requires renewed confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await offer(page);
  await page.getByRole("button", { name: "查看两份材料" }).click();
  const original = await page.getByTestId("joint-source").allTextContents();
  // Explicitly inject a local edit while the modal is open to exercise a concurrent-change boundary.
  await page.getByLabel("书店活动提案正文").evaluate(el => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, "确认之后的新甲");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(
    page.getByRole("button", { name: "更新两份当前全文" }),
  ).toBeVisible();
  expect(await page.getByTestId("joint-source").allTextContents()).toEqual(
    original,
  );
  await page
    .getByRole("button", { name: "联合整理两份文本", exact: true })
    .click();
  await expect(
    page.getByText("原文已变化或不可用：这是旧版本的结果，不代表当前材料。", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    page
      .getByTestId("joint-result-source")
      .filter({ hasText: "确认之后的新甲" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "重新确认两份全文" }).click();
  await expect(
    page.getByRole("dialog", { name: "联合整理材料确认" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("joint-source").filter({ hasText: "确认之后的新甲" }),
  ).toHaveCount(1);
  await page.getByLabel("场地说明正文").evaluate(el => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, "再次确认后的新乙");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "更新两份当前全文" }).click();
  await expect(
    page.getByRole("button", { name: "联合整理两份文本", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("joint-result-source")).toHaveCount(0);
  await expect(
    page.getByTestId("joint-source").filter({ hasText: "再次确认后的新乙" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "联合整理两份文本", exact: true })
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
  await page.screenshot({ path: "docs/screenshots/joint-updated-result.png" });
});
