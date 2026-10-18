import { test, expect, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
  return page.getByRole("dialog", { name: "灵感熔炉" });
}
async function paste(page: Page, title: string, text: string) {
  const dialog = await open(page);
  await dialog.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await dialog.getByLabel("新材料标题").fill(title);
  await dialog.getByLabel("粘贴正文").fill(text);
  await dialog.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(dialog.getByLabel("材料标题", { exact: true })).toHaveValue(
    title,
  );
  return dialog;
}
test("cauldron adds pasted text without windows and scopes each capability to one material", async ({
  page,
}) => {
  await page.goto("/");
  const previousEditor = page.getByLabel("场地说明正文");
  await previousEditor.focus();
  await previousEditor.press("Control+Home");
  await previousEditor.press("Shift+ArrowRight");
  const text =
    "主题：熔炉读书会\n时间：周六\n地点：街角书店\n参与方式：预约\n活动于11月8日开放。海报于11月10日定稿，随后开放报名。";
  let d = await paste(page, "单份材料A", text);
  await expect(page.getByLabel("单份材料A正文")).toHaveCount(0);
  await d.getByRole("button", { name: "Understand", exact: true }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(text);
  await page.getByRole("button", { name: "整理原文摘录" }).click();
  await expect(page.getByRole("dialog")).toContainText("粘贴文本");
  await page.getByRole("button", { name: "关闭处理结果" }).click();
  for (const [op, action, close] of [
    ["Check", "运行本地检查", "关闭检查结果"],
    ["Create", "生成模板草稿", "关闭处理结果"],
  ]) {
    d = await open(page);
    await d.getByRole("button", { name: "选择材料 单份材料A" }).click();
    await d.getByRole("button", { name: op, exact: true }).click();
    await expect(page.getByTestId("snapshot-text")).toHaveText(text);
    await page.getByRole("button", { name: action, exact: true }).click();
    await page.getByRole("button", { name: close, exact: true }).click();
  }
  d = await open(page);
  await d.getByRole("button", { name: "选择材料 单份材料A" }).click();
  await d.getByRole("button", { name: "Summon", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("单份材料A");
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toContainText("已完成");
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  await page.reload();
  d = await open(page);
  await d.getByRole("button", { name: "选择材料 单份材料A" }).click();
  await expect(d.getByTestId("material-detail")).toContainText("已保存");
  await expect(page.getByLabel("单份材料A正文")).toHaveCount(0);
  await d.getByRole("button", { name: "移出熔炉", exact: true }).click();
  await d.getByRole("button", { name: "全部本地材料", exact: true }).click();
  await d.getByRole("button", { name: "选择材料 单份材料A" }).click();
  await d.getByRole("button", { name: "加入熔炉", exact: true }).click();
  await d.getByRole("button", { name: "打开编辑", exact: true }).click();
  await expect(page.getByLabel("单份材料A正文")).toHaveValue(text);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("wisp-module-one");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const value = await new Promise<any[]>((resolve, reject) => {
          const req = db
            .transaction("preferences")
            .objectStore("preferences")
            .get("windows");
          req.onsuccess = () => resolve(req.result ?? []);
          req.onerror = () => reject(req.error);
        });
        db.close();
        return value.length;
      }),
    )
    .toBe(3);
  await page.reload();
  await expect(page.getByLabel("单份材料A正文")).toHaveValue(text);
});
test("TXT preview rejects invalid encoding and preserves immutable filename after rename", async ({
  page,
}) => {
  await page.goto("/");
  const d = await open(page);
  await d.getByRole("button", { name: "导入文件", exact: true }).click();
  const input = d.getByLabel("选择文件");
  await input.setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0xff, 0xfe, 0x41]),
  });
  await expect(d.getByRole("alert")).toContainText("UTF-8");
  await input.setInputFiles({
    name: "原始.TXT",
    mimeType: "text/plain",
    buffer: Buffer.from("\ufeff第一行😀\r\n第二行"),
  });
  await expect(d.getByTestId("import-preview")).toHaveValue("第一行😀\n第二行");
  await d.getByLabel("新材料标题").fill("可改的标题");
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(d.getByTestId("material-detail")).toContainText("原始.TXT");
  await d.getByLabel("材料标题", { exact: true }).fill("改名以后");
  await expect(d.getByTestId("material-save-status")).toHaveText("已保存");
  await page.screenshot({ path: "docs/screenshots/cauldron.png" });
  await page.reload();
  const again = await open(page);
  await again.getByRole("button", { name: "选择材料 改名以后" }).click();
  await expect(again.getByTestId("material-detail")).toContainText("原始.TXT");
});
test("new blank material opens one editor and synchronizes to another tab without replacing drafts", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  const d = await open(page);
  await d.getByRole("button", { name: "新建材料", exact: true }).click();
  await d.getByLabel("新材料标题").fill("新的空白");
  await d.getByRole("button", { name: "确认新建", exact: true }).click();
  await expect(page.getByLabel("新的空白正文")).toHaveValue("");
  const od = await open(other);
  await od.getByRole("button", { name: "选择材料 新的空白" }).click();
  await expect(
    od.getByRole("button", { name: "Understand", exact: true }),
  ).toBeDisabled();
  await expect(other.getByLabel("新的空白正文")).toHaveCount(0);
  await od.getByRole("button", { name: "打开编辑", exact: true }).click();
  await expect(other.getByLabel("新的空白正文")).toHaveCount(1);
  await other.getByLabel("新的空白正文").fill("其他页面先保存");
  await expect(other.getByText("已保存", { exact: true })).toHaveCount(3);
  await page.getByLabel("新的空白正文").fill("保留本页冲突草稿");
  await expect(page.getByRole("alert")).toContainText("保存冲突");
  await open(page);
  await page.getByRole("button", { name: "刷新材料列表", exact: true }).click();
  await page.getByRole("button", { name: "关闭熔炉", exact: true }).click();
  await expect(page.getByLabel("新的空白正文")).toHaveValue("保留本页冲突草稿");
});
test("failed first save keeps draft and retry produces exactly one material", async ({
  page,
}) => {
  await page.goto("/");
  const d = await open(page);
  await d.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await d.getByLabel("新材料标题").fill("重试材料");
  await d.getByLabel("粘贴正文").fill("需要保留的文字");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "materials") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟新增失败");
      }
      return original.apply(this, args);
    };
  });
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("模拟新增失败");
  await expect(d.getByLabel("粘贴正文")).toHaveValue("需要保留的文字");
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "选择材料 重试材料" }),
  ).toHaveCount(1);
});

test("capacity rejects thirteenth input without saving and removal frees a slot", async ({
  page,
}) => {
  await page.goto("/");
  const d = await open(page);
  for (let i = 0; i < 12; i++) {
    await d.getByRole("button", { name: "粘贴文本", exact: true }).click();
    await d.getByLabel("新材料标题").fill("材料" + i);
    await d.getByLabel("粘贴正文").fill("正文" + i);
    await d.getByRole("button", { name: "确认加入", exact: true }).click();
    await expect(d.getByLabel("材料标题", { exact: true })).toHaveValue(
      "材料" + i,
    );
  }
  await expect(d).toContainText("12 / 12");
  await d.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await d.getByLabel("新材料标题").fill("第十三份");
  await d.getByLabel("粘贴正文").fill("超出容量的输入保留");
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("12");
  await expect(d.getByLabel("粘贴正文")).toHaveValue("超出容量的输入保留");
  await d.getByRole("button", { name: "取消新增", exact: true }).click();
  await d.getByRole("button", { name: "移出熔炉", exact: true }).click();
  await expect(d).toContainText("11 / 12");
  await d.getByRole("button", { name: "全部本地材料", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "选择材料 第十三份", exact: true }),
  ).toHaveCount(0);
  await expect(
    d.getByRole("button", { name: "选择材料 材料11", exact: true }),
  ).toHaveCount(1);
  await d.getByRole("button", { name: "加入熔炉", exact: true }).click();
  await expect(d).toContainText("12 / 12");
});
test("imported text watch follows Wisp versions after removal and never watches the disk file", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).check();
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  const text = "活动于11月8日开放。海报于11月10日定稿，随后开放报名。";
  const d = await open(page);
  await d.getByRole("button", { name: "导入文件", exact: true }).click();
  await d
    .getByLabel("选择文件")
    .setInputFiles({
      name: "关注文件.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    });
  await expect(d.getByTestId("import-preview")).toHaveValue(text);
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await d.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByRole("button", { name: "运行本地检查", exact: true }).click();
  await page.getByRole("button", { name: "关闭检查结果" }).click();
  await page.getByRole("button", { name: "查看关注范围" }).click();
  await expect(page.getByRole("dialog")).toContainText("关注文件.txt");
  await page.getByRole("button", { name: "确认开始关注", exact: true }).click();
  const again = await open(page);
  await again.getByRole("button", { name: "移出熔炉", exact: true }).click();
  await expect(again.getByTestId("material-detail")).toContainText(
    "正在持续关注",
  );
  await again.getByRole("button", { name: "打开编辑", exact: true }).click();
  await page.getByLabel("关注文件.txt正文").fill(text + "\n本地修订");
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await page.getByRole("button", { name: "查看回信", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("关注文件.txt");
  await expect(page.getByRole("dialog")).toContainText("TXT 文件");
  await page.getByRole("button", { name: "关闭检查结果" }).click();
  await page.getByRole("button", { name: "停止关注", exact: true }).click();
  await expect(page.getByTestId("watch-card")).toContainText("已停止");
});

test("unopened materials synchronize saved edits while open editors retain conflict protection", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const d = await paste(page, "远端材料", "初始内容");
  const other = await context.newPage();
  await other.goto("/");
  const od = await open(other);
  await od
    .getByRole("button", { name: "选择材料 远端材料", exact: true })
    .click();
  await expect(od.getByTestId("material-detail")).toContainText("初始内容");
  await d.getByRole("button", { name: "打开编辑", exact: true }).click();
  await page.getByLabel("远端材料正文").fill("新的远端内容");
  await expect(page.getByText("已保存", { exact: true })).toHaveCount(3);
  await expect(od.getByTestId("material-detail")).toContainText("新的远端内容");
  await od.getByRole("button", { name: "打开编辑", exact: true }).click();
  await other.getByLabel("远端材料正文").fill("接着编辑");
  await expect(other.getByText("已保存", { exact: true })).toHaveCount(3);
  await expect(other.getByRole("alert")).toHaveCount(0);
});

test("cauldron keeps unsaved input on Escape and ignores list visits for joint proposals", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).check();
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  const d = await open(page);
  await d.getByRole("button", { name: "全部本地材料", exact: true }).click();
  for (const title of [
    "书店活动提案",
    "场地说明",
    "书店活动提案",
    "场地说明",
  ]) {
    await d
      .getByRole("button", { name: "选择材料 " + title, exact: true })
      .click();
  }
  await d.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await d.getByLabel("粘贴正文").fill("尚未加入的正文");
  await d.getByLabel("粘贴正文").press("Escape");
  await expect(d.getByRole("alert")).toContainText("尚未加入");
  await expect(d.getByLabel("粘贴正文")).toHaveValue("尚未加入的正文");
  await d.press("Alt+m");
  await expect(
    page.getByRole("dialog", { name: "魔法书", exact: true }),
  ).toHaveCount(0);
  await d.getByRole("button", { name: "取消新增", exact: true }).click();
  await d.getByRole("button", { name: "关闭熔炉", exact: true }).click();
  await page.waitForTimeout(1100);
  await expect(
    page.getByRole("complementary", { name: "主动提议" }),
  ).toHaveCount(0);
});
