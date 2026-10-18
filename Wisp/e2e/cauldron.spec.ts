import { test, expect, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.getByRole("button", { name: "Inspiration Cauldron", exact: true }).click();
  return page.getByRole("dialog", { name: "Inspiration Cauldron" });
}
async function paste(page: Page, title: string, text: string) {
  const dialog = await open(page);
  await dialog.getByRole("button", { name: "Paste text", exact: true }).click();
  await dialog.getByLabel("New material title").fill(title);
  await dialog.getByLabel("Pasted text").fill(text);
  await dialog.getByRole("button", { name: "Confirm addition", exact: true }).click();
  await expect(dialog.getByLabel("Material title", { exact: true })).toHaveValue(
    title,
  );
  return dialog;
}
test("cauldron adds pasted text without windows and scopes each capability to one material", async ({
  page,
}) => {
  await page.goto("/");
  const previousEditor = page.getByLabel("Venue notes text");
  await previousEditor.focus();
  await previousEditor.press("Control+Home");
  await previousEditor.press("Shift+ArrowRight");
  const text =
    "主题：熔炉读书会\n时间：周六\n地点：街角书店\nHow to join: Reservation\nThe event is scheduled to open on November 8. The poster is scheduled to be finalized on November 10, followed by registration opening.";
  let d = await paste(page, "单份材料A", text);
  await expect(page.getByLabel("单份材料A text")).toHaveCount(0);
  await d.getByRole("button", { name: "Understand", exact: true }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(text);
  await page.getByRole("button", { name: "Organize source excerpts" }).click();
  await expect(page.getByRole("dialog")).toContainText("Pasted text");
  await page.getByRole("button", { name: "Close result" }).click();
  for (const [op, action, close] of [
    ["Check", "Run local check", "Close check result"],
    ["Create", "Create template draft", "Close result"],
  ]) {
    d = await open(page);
    await d.getByRole("button", { name: "Select material 单份材料A" }).click();
    await d.getByRole("button", { name: op, exact: true }).click();
    await expect(page.getByTestId("snapshot-text")).toHaveText(text);
    await page.getByRole("button", { name: action, exact: true }).click();
    await page.getByRole("button", { name: close, exact: true }).click();
  }
  d = await open(page);
  await d.getByRole("button", { name: "Select material 单份材料A" }).click();
  await d.getByRole("button", { name: "Summon", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("单份材料A");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await expect(page.getByTestId("task-card")).toContainText("Completed");
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await page.reload();
  d = await open(page);
  await d.getByRole("button", { name: "Select material 单份材料A" }).click();
  await expect(d.getByTestId("material-detail")).toContainText("saved");
  await expect(page.getByLabel("单份材料A text")).toHaveCount(0);
  await d.getByRole("button", { name: "Remove from cauldron", exact: true }).click();
  await d.getByRole("button", { name: "All local materials", exact: true }).click();
  await d.getByRole("button", { name: "Select material 单份材料A" }).click();
  await d.getByRole("button", { name: "Add to cauldron", exact: true }).click();
  await d.getByRole("button", { name: "Open editor", exact: true }).click();
  await expect(page.getByLabel("单份材料A text")).toHaveValue(text);
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
  await expect(page.getByLabel("单份材料A text")).toHaveValue(text);
});
test("TXT preview rejects invalid encoding and preserves immutable filename after rename", async ({
  page,
}) => {
  await page.goto("/");
  const d = await open(page);
  await d.getByRole("button", { name: "Import file", exact: true }).click();
  const input = d.getByLabel("Choose file");
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
  await d.getByLabel("New material title").fill("可改的标题");
  await d.getByRole("button", { name: "Confirm addition", exact: true }).click();
  await expect(d.getByTestId("material-detail")).toContainText("原始.TXT");
  await d.getByLabel("Material title", { exact: true }).fill("改名以后");
  await expect(d.getByTestId("material-save-status")).toHaveText("saved");
  await page.screenshot({ path: "test-results/english/cauldron.png" });
  await page.reload();
  const again = await open(page);
  await again.getByRole("button", { name: "Select material 改名以后" }).click();
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
  await d.getByRole("button", { name: "New material", exact: true }).click();
  await d.getByLabel("New material title").fill("新的空白");
  await d.getByRole("button", { name: "Confirm creation", exact: true }).click();
  await expect(page.getByLabel("新的空白 text")).toHaveValue("");
  const od = await open(other);
  await od.getByRole("button", { name: "Select material 新的空白" }).click();
  await expect(
    od.getByRole("button", { name: "Understand", exact: true }),
  ).toBeDisabled();
  await expect(other.getByLabel("新的空白 text")).toHaveCount(0);
  await od.getByRole("button", { name: "Open editor", exact: true }).click();
  await expect(other.getByLabel("新的空白 text")).toHaveCount(1);
  await other.getByLabel("新的空白 text").fill("其他页面先保存");
  await expect(other.getByText("saved", { exact: true })).toHaveCount(3);
  await page.getByLabel("新的空白 text").fill("保留本页冲突草稿");
  await expect(page.getByRole("alert")).toContainText("Save conflict");
  await open(page);
  await page.getByRole("button", { name: "Refresh material list", exact: true }).click();
  await page.getByRole("button", { name: "Close Inspiration Cauldron", exact: true }).click();
  await expect(page.getByLabel("新的空白 text")).toHaveValue("保留本页冲突草稿");
});
test("failed first save keeps draft and retry produces exactly one material", async ({
  page,
}) => {
  await page.goto("/");
  const d = await open(page);
  await d.getByRole("button", { name: "Paste text", exact: true }).click();
  await d.getByLabel("New material title").fill("重试材料");
  await d.getByLabel("Pasted text").fill("需要保留的文字");
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
  await d.getByRole("button", { name: "Confirm addition", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("模拟新增失败");
  await expect(d.getByLabel("Pasted text")).toHaveValue("需要保留的文字");
  await d.getByRole("button", { name: "Confirm addition", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Select material 重试材料" }),
  ).toHaveCount(1);
});

test("capacity rejects thirteenth input without saving and removal frees a slot", async ({
  page,
}) => {
  await page.goto("/");
  const d = await open(page);
  for (let i = 0; i < 12; i++) {
    await d.getByRole("button", { name: "Paste text", exact: true }).click();
    await d.getByLabel("New material title").fill("材料" + i);
    await d.getByLabel("Pasted text").fill("text" + i);
    await d.getByRole("button", { name: "Confirm addition", exact: true }).click();
    await expect(d.getByLabel("Material title", { exact: true })).toHaveValue(
      "材料" + i,
    );
  }
  await expect(d).toContainText("12 / 12");
  await d.getByRole("button", { name: "Paste text", exact: true }).click();
  await d.getByLabel("New material title").fill("第十三份");
  await d.getByLabel("Pasted text").fill("超出容量的输入保留");
  await d.getByRole("button", { name: "Confirm addition", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("12");
  await expect(d.getByLabel("Pasted text")).toHaveValue("超出容量的输入保留");
  await d.getByRole("button", { name: "Cancel new material", exact: true }).click();
  await d.getByRole("button", { name: "Remove from cauldron", exact: true }).click();
  await expect(d).toContainText("11 / 12");
  await d.getByRole("button", { name: "All local materials", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Select material 第十三份", exact: true }),
  ).toHaveCount(0);
  await expect(
    d.getByRole("button", { name: "Select material 材料11", exact: true }),
  ).toHaveCount(1);
  await d.getByRole("button", { name: "Add to cauldron", exact: true }).click();
  await expect(d).toContainText("12 / 12");
});
test("imported text watch follows Wisp versions after removal and never watches the disk file", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).check();
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  const text = "The event is scheduled to open on November 8. The poster is scheduled to be finalized on November 10, followed by registration opening.";
  const d = await open(page);
  await d.getByRole("button", { name: "Import file", exact: true }).click();
  await d
    .getByLabel("Choose file")
    .setInputFiles({
      name: "关注文件.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    });
  await expect(d.getByTestId("import-preview")).toHaveValue(text);
  await d.getByRole("button", { name: "Confirm addition", exact: true }).click();
  await d.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByRole("button", { name: "Run local check", exact: true }).click();
  await page.getByRole("button", { name: "Close check result" }).click();
  await page.getByRole("button", { name: "View watch scope" }).click();
  await expect(page.getByRole("dialog")).toContainText("关注文件.txt");
  await page.getByRole("button", { name: "Confirm and start watching", exact: true }).click();
  const again = await open(page);
  await again.getByRole("button", { name: "Remove from cauldron", exact: true }).click();
  await expect(again.getByTestId("material-detail")).toContainText(
    "being watched",
  );
  await again.getByRole("button", { name: "Open editor", exact: true }).click();
  await page.getByLabel("关注文件.txt text").fill(text + "\n本地修订");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 unread");
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await page.getByRole("button", { name: "View reply", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("关注文件.txt");
  await expect(page.getByRole("dialog")).toContainText("TXT file");
  await page.getByRole("button", { name: "Close check result" }).click();
  await page.getByRole("button", { name: "Stop watching", exact: true }).click();
  await expect(page.getByTestId("watch-card")).toContainText("Stopped");
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
    .getByRole("button", { name: "Select material 远端材料", exact: true })
    .click();
  await expect(od.getByTestId("material-detail")).toContainText("初始内容");
  await d.getByRole("button", { name: "Open editor", exact: true }).click();
  await page.getByLabel("远端材料 text").fill("新的远端内容");
  await expect(page.getByText("saved", { exact: true })).toHaveCount(3);
  await expect(od.getByTestId("material-detail")).toContainText("新的远端内容");
  await od.getByRole("button", { name: "Open editor", exact: true }).click();
  await other.getByLabel("远端材料 text").fill("接着编辑");
  await expect(other.getByText("saved", { exact: true })).toHaveCount(3);
  await expect(other.getByRole("alert")).toHaveCount(0);
});

test("cauldron keeps unsaved input on Escape and ignores list visits for joint proposals", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).check();
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  const d = await open(page);
  await d.getByRole("button", { name: "All local materials", exact: true }).click();
  for (const title of [
    "Bookstore event proposal",
    "Venue notes",
    "Bookstore event proposal",
    "Venue notes",
  ]) {
    await d
      .getByRole("button", { name: "Select material " + title, exact: true })
      .click();
  }
  await d.getByRole("button", { name: "Paste text", exact: true }).click();
  await d.getByLabel("Pasted text").fill("尚未加入的 text");
  await d.getByLabel("Pasted text").press("Escape");
  await expect(d.getByRole("alert")).toContainText("not been added");
  await expect(d.getByLabel("Pasted text")).toHaveValue("尚未加入的 text");
  await d.press("Alt+m");
  await expect(
    page.getByRole("dialog", { name: "Grimoire", exact: true }),
  ).toHaveCount(0);
  await d.getByRole("button", { name: "Cancel new material", exact: true }).click();
  await d.getByRole("button", { name: "Close Inspiration Cauldron", exact: true }).click();
  await page.waitForTimeout(1100);
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal" }),
  ).toHaveCount(0);
});
