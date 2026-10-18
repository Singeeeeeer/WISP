import { test, expect } from "@playwright/test";
test("Understand and Create share persistence, preserve source, and copy labelled output", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const editor = page.getByLabel("书店活动提案正文");
  const source =
    "主题：😀夜读\n时间：周六晚上\n地点：书店\n参与方式：预约\n第五行\n第六行\n第七行\n第八行\n未摘录的第九行";
  await editor.fill(source);
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Understand" }).click();
  await page.getByRole("button", { name: "整理原文摘录" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "原文摘录整理", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("未展示的非空行：1。", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/local-understand.png" });
  await page.getByRole("button", { name: "关闭处理结果" }).click();
  await expect(editor).toHaveValue(source);
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Create" }).click();
  await page.getByRole("button", { name: "生成模板草稿" }).click();
  await expect(page.getByTestId("template-draft")).toContainText(
    "主题：😀夜读",
  );
  await expect(page.getByTestId("template-draft")).toContainText(
    "介绍正文：【待补充",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).copied = text;
        },
      },
    });
  });
  await page.getByRole("button", { name: "复制结果" }).click();
  await expect(page.getByText("已复制结果")).toBeVisible();
  expect(await page.evaluate(() => (window as any).copied)).toContain(
    "本地模板草稿",
  );
  await page.screenshot({ path: "docs/screenshots/local-create.png" });
  await page.getByRole("button", { name: "关闭处理结果" }).click();
  await expect(editor).toHaveValue(source);
  await page.reload();
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看Understand结果" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "查看Create结果" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "关闭处理记录" }).click();
  await editor.fill("主题：新版本");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await page.getByRole("button", { name: "查看Create结果" }).click();
  await expect(
    page.getByText("原文已变化或不可用：这是旧版本的结果，不代表当前材料。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新处理当前全文" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText("主题：新版本");
  await page.getByRole("button", { name: "生成模板草稿" }).click();
  await expect(page.getByTestId("template-draft")).toContainText(
    "地点：【待补充】",
  );
  expect(errors).toEqual([]);
});

test("Create only uses selected text and handles failed save with a retry", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByLabel("书店活动提案正文");
  await editor.fill("主题：选中主题\n地点：不能带走的地址");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await editor.press("Control+Home");
  for (let i = 0; i < "主题：选中主题".length; i++)
    await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: "Create" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText("主题：选中主题");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟写入失败");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "生成模板草稿" }).click();
  await expect(page.getByRole("alert")).toContainText("模拟写入失败");
  await expect(page.getByTestId("template-draft")).toHaveCount(0);
  await page.getByRole("button", { name: "生成模板草稿" }).click();
  await expect(page.getByTestId("template-draft")).not.toContainText(
    "不能带走",
  );
  await expect(page.getByTestId("template-draft")).toContainText(
    "地点：【待补充】",
  );
});
