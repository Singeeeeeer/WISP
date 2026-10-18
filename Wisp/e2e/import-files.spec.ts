import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const fixture = (file: string) => path.resolve("e2e/fixtures/pdf02", file);
async function open(page: Page) {
  await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
  return page.getByRole("dialog", { name: "灵感熔炉" });
}
async function start(page: Page) {
  await page.goto("/");
  const dialog = await open(page);
  await dialog.getByRole("button", { name: "导入文件", exact: true }).click();
  return dialog;
}
test.beforeEach(async ({ page }) => {
  await page.route(
    /\/api\/(understand|check|create|connections)(\?|$)/,
    (route) => {
      throw new Error("Import must not call a model: " + route.request().url());
    },
  );
});

for (const [format, marker] of [
  ["docx", "星光读书会😀"],
  ["pptx", "[幻灯片 2]"],
  ["xlsx", "[工作表：活动安排]"],
  ["pdf", "[第 1 页]"],
]) {
  test(`${format} parses locally, permits edits and persists its source`, async ({
    page,
  }) => {
    const d = await start(page);
    await d
      .getByLabel("选择文件")
      .setInputFiles(fixture(`book-club.${format}`));
    const preview = d.getByTestId("import-preview");
    await expect(preview).toHaveValue(
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    const edited = (await preview.inputValue()) + "\n预览时补充说明。";
    await preview.fill(edited);
    await d.getByLabel("新材料标题").fill(`${format}材料`);
    if (format === "xlsx")
      await page.screenshot({ path: "docs/screenshots/pdf02-import.png" });
    await d.getByRole("button", { name: "确认加入", exact: true }).click();
    await expect(d.getByTestId("material-detail")).toContainText(
      `book-club.${format}`,
    );
    await expect(
      d.getByRole("button", { name: "Understand", exact: true }),
    ).toBeEnabled();
    await page.reload();
    const restored = await open(page);
    await restored
      .getByRole("button", { name: `选择材料 ${format}材料`, exact: true })
      .click();
    await expect(restored.getByTestId("material-detail")).toContainText(
      `book-club.${format}`,
    );
    await restored
      .getByRole("button", { name: "Understand", exact: true })
      .click();
    await expect(page.getByTestId("snapshot-text")).toHaveText(edited);
    await expect(page.getByRole("dialog")).toContainText(
      format.toUpperCase() + " 文件",
    );
  });
}

test("invalid and empty files clear a previous preview and never save", async ({
  page,
}) => {
  const d = await start(page);
  const input = d.getByLabel("选择文件");
  await input.setInputFiles(fixture("book-club.docx"));
  await expect(d.getByTestId("import-preview")).toHaveValue(/星光/);
  await input.setInputFiles(fixture("blank.pdf"));
  await expect(d.getByRole("alert")).toContainText("未找到可导入的文字");
  await expect(d.getByTestId("import-preview")).toHaveCount(0);
  await input.setInputFiles({
    name: "broken.docx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("broken"),
  });
  await expect(d.getByRole("alert")).toContainText("文件损坏");
  await input.setInputFiles({
    name: "large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(20_000_001),
  });
  await expect(d.getByRole("alert")).toContainText("20 MB");
  await d.getByRole("button", { name: "取消新增", exact: true }).click();
  await expect(d).toContainText("0 / 12");
});

test("stopping a delayed parser keeps a later TXT preview", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("**/api/import-text?format=docx", async (route) => {
    started = true;
    await gate;
    await route
      .fulfill({
        json: {
          schemaVersion: "import-text-1",
          format: "docx",
          text: "迟到旧文",
          warnings: [],
        },
      })
      .catch(() => {});
  });
  const d = await start(page);
  await d.getByLabel("选择文件").setInputFiles(fixture("book-club.docx"));
  await expect.poll(() => started).toBe(true);
  await d.getByRole("button", { name: "停止读取", exact: true }).click();
  await d
    .getByLabel("选择文件")
    .setInputFiles({
      name: "later.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("新的文字"),
    });
  await expect(d.getByTestId("import-preview")).toHaveValue("新的文字");
  release();
  await page.waitForTimeout(200);
  await expect(d.getByTestId("import-preview")).toHaveValue("新的文字");
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(d.getByTestId("material-detail")).toContainText("later.txt");
});

test("failed imported-material save keeps edited preview and retries without parsing again", async ({
  page,
}) => {
  let parses = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/import-text")) parses++;
  });
  const d = await start(page);
  await d.getByLabel("选择文件").setInputFiles(fixture("book-club.pdf"));
  await expect(d.getByTestId("import-preview")).toHaveValue(/Starlight/);
  await d.getByTestId("import-preview").fill("修改后的文字😀");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "cauldronEntries") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟入炉失败");
      }
      return original.apply(this, args);
    };
  });
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("模拟入炉失败");
  await expect(d.getByTestId("import-preview")).toHaveValue("修改后的文字😀");
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "选择材料 book-club.pdf", exact: true }),
  ).toHaveCount(1);
  await expect(d).toContainText("1 / 12");
  expect(parses).toBe(1);
});
