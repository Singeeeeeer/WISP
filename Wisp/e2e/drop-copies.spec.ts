import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "灵感熔炉", exact: true });
const venue = (page: Page) =>
  page.getByRole("region", { name: "场地说明窗口", exact: true });
const fixture = (format: string) =>
  readFileSync(path.resolve("e2e/fixtures/pdf02", `book-club.${format}`));
const importError = (page: Page) =>
  page.locator(".cauldron-import-error, .toast");
type DropFile = {
  name: string;
  text?: string;
  bytes?: number[];
  size?: number;
};

async function dropFiles(
  page: Page,
  files: DropFile[],
  target = "body",
  directory = false,
) {
  const transfer = await page.evaluateHandle(
    ({ files, directory }) => {
      const data = new DataTransfer();
      for (const file of files) {
        const content = file.size
          ? new Uint8Array(file.size)
          : file.bytes
            ? new Uint8Array(file.bytes)
            : (file.text ?? "");
        data.items.add(
          new File([content], file.name, {
            type: "application/octet-stream",
            lastModified: 1700000000000,
          }),
        );
      }
      if (directory) {
        const prototype = DataTransferItem.prototype;
        (window as any).__originalGetAsEntry = prototype.webkitGetAsEntry;
        prototype.webkitGetAsEntry = () =>
          ({ isDirectory: true, isFile: false }) as FileSystemEntry;
      }
      return data;
    },
    { files, directory },
  );
  const location = page.locator(target);
  await location.dispatchEvent("dragenter", { dataTransfer: transfer });
  await location.dispatchEvent("dragover", { dataTransfer: transfer });
  await location.dispatchEvent("drop", { dataTransfer: transfer });
  if (directory)
    await page.evaluate(() => {
      DataTransferItem.prototype.webkitGetAsEntry = (
        window as any
      ).__originalGetAsEntry;
      delete (window as any).__originalGetAsEntry;
    });
  await transfer.dispose();
}

async function records(page: Page, store = "materials") {
  return page.evaluate(async (store) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("wisp-module-one");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<any[]>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, store);
}

async function confirmCopy(page: Page) {
  const d = dialog(page);
  await expect(d.getByTestId("copy-preview")).toBeVisible();
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(d.getByTestId("copy-preview")).toHaveCount(0);
  return (await records(page)).filter((material) =>
    material.source.endsWith("_copy"),
  );
}

async function chooseRange(editor: Locator, start: number, end: number) {
  const text = await editor.inputValue();
  await editor.press("Control+Home");
  for (const _ of Array.from(text.slice(0, start)))
    await editor.press("ArrowRight");
  for (const _ of Array.from(text.slice(start, end)))
    await editor.press("Shift+ArrowRight");
}

test.beforeEach(async ({ page }) => {
  await page.route(
    /\/api\/(understand|check|create|connections)(\?|$)/,
    (route) => {
      throw new Error(
        "Drop/copy tests must not call a model: " + route.request().url(),
      );
    },
  );
  await page.goto("/");
  await expect(page.getByTestId("save-venue")).toHaveText("已保存");
});

test("TXT dropped on the page stays editable and saves only after confirmation", async ({
  page,
}) => {
  await dropFiles(page, [
    { name: "拖放材料.TXT", text: "\ufeff第一行😀\r\n第二行" },
  ]);
  const d = dialog(page);
  await expect(d.getByTestId("import-preview")).toHaveValue("第一行😀\n第二行");
  expect(await records(page)).toHaveLength(2);
  await expect(page.locator(".wand-outcome")).not.toHaveAttribute(
    "data-outcome",
    "success",
  );
  await d.getByTestId("import-preview").fill("确认前修订😀");
  await d.getByLabel("新材料标题").fill("拖放修订稿");
  await d.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(d.getByTestId("material-detail")).toContainText("拖放材料.TXT");
  await expect(d).toContainText("1 / 12");
  await page.reload();
  await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "选择材料 拖放修订稿", exact: true })
    .click();
  await expect(dialog(page).getByTestId("material-detail")).toContainText(
    "确认前修订😀",
  );
  const saved = (await records(page)).find((m) => m.source === "txt_file");
  expect(saved.origin.fileName).toBe("拖放材料.TXT");
});

for (const [format, marker] of [
  ["docx", "星光读书会😀"],
  ["pdf", "[第 1 页]"],
]) {
  test(`${format} dropped into cauldron uses the real local parser`, async ({
    page,
  }) => {
    await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
    await dropFiles(
      page,
      [{ name: `book-club.${format}`, bytes: [...fixture(format)] }],
      ".cauldron",
    );
    const d = dialog(page);
    await expect(d.getByTestId("import-preview")).toHaveValue(
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    await d.getByTestId("import-preview").fill(`${format} 可编辑的解析副本`);
    await d.getByRole("button", { name: "确认加入", exact: true }).click();
    await expect(d.getByTestId("material-detail")).toContainText(
      `book-club.${format}`,
    );
    expect(
      (await records(page)).find((m) => m.source === `${format}_file`).text,
    ).toBe(`${format} 可编辑的解析副本`);
  });
}

test("the independent handle really drags a full copy while the old titlebar still moves its window", async ({
  page,
}) => {
  const window = venue(page);
  const before = await window.boundingBox();
  const bar = page.getByTestId("drag-venue");
  const box = await bar.boundingBox();
  await page.mouse.move(box!.x + 120, box!.y + 16);
  await page.mouse.down();
  await page.mouse.move(box!.x + 180, box!.y + 66, { steps: 6 });
  await page.mouse.up();
  const moved = await window.boundingBox();
  expect(moved!.x - before!.x).toBeCloseTo(60, 0);
  expect(moved!.y - before!.y).toBeCloseTo(50, 0);
  await expect(dialog(page)).toHaveCount(0);
  const text = await page.getByLabel("场地说明正文").inputValue();
  const handle = page.getByRole("button", {
    name: "拖入熔炉 场地说明",
    exact: true,
  });
  await handle.dragTo(page.locator("[data-cauldron-target]"));
  await expect(dialog(page).getByTestId("copy-preview")).toHaveText(text);
  expect(
    (await records(page)).filter((m) => m.source.endsWith("_copy")),
  ).toHaveLength(0);
  const copies = await confirmCopy(page);
  expect(copies).toHaveLength(1);
  expect(copies[0].origin.copy).toMatchObject({
    materialId: "venue",
    materialVersion: 1,
    title: "场地说明",
    start: 0,
    end: text.length,
    source: "virtual_document",
  });
  expect(copies[0].id).not.toBe("venue");
});

test("full and selection copies freeze original title, version and UTF-16 range across source edits and refresh", async ({
  page,
}) => {
  const editor = page.getByLabel("场地说明正文");
  const text = "开场😀\n需要保留的选区。\n收尾";
  await editor.fill(text);
  await expect(page.getByTestId("save-venue")).toHaveText("已保存");
  const original = (await records(page)).find((m) => m.id === "venue");
  await venue(page)
    .getByRole("button", { name: "全文副本入炉", exact: true })
    .click();
  await expect(dialog(page).getByLabel("新材料标题")).toBeDisabled();
  await expect(dialog(page).getByTestId("copy-preview")).toHaveText(text);
  await expect(dialog(page)).toContainText(`v${original.version}`);
  await confirmCopy(page);
  await dialog(page)
    .getByRole("button", { name: "关闭熔炉", exact: true })
    .click();
  const start = text.indexOf("需要"),
    end = text.indexOf("\n收尾");
  await chooseRange(editor, start, end);
  await venue(page)
    .getByRole("button", { name: "选区副本入炉", exact: true })
    .click();
  await expect(dialog(page).getByTestId("copy-preview")).toHaveText(
    text.slice(start, end),
  );
  await expect(dialog(page).locator(".source-info")).toContainText(
    `冻结自原文范围 [${start}, ${end})`,
  );
  await page.screenshot({
    path: test.info().outputPath("selection-copy-preview.png"),
  });
  const copies = await confirmCopy(page);
  expect(copies).toHaveLength(2);
  expect(copies.find((m) => m.source === "selection_copy").origin.copy).toEqual(
    {
      materialId: "venue",
      materialVersion: original.version,
      title: "场地说明",
      start,
      end,
      source: "virtual_document",
    },
  );
  await dialog(page)
    .getByRole("button", { name: "关闭熔炉", exact: true })
    .click();
  await editor.fill("原文已改成完全不同的内容");
  await page
    .getByLabel("文档标题 venue", { exact: true })
    .fill("修改后的原文标题");
  await expect(page.getByTestId("save-venue")).toHaveText("已保存");
  await page.reload();
  const frozen = (await records(page)).filter((m) =>
    m.source.endsWith("_copy"),
  );
  expect(frozen).toEqual(copies);
  await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
  await dialog(page)
    .getByRole("button", { name: "选择材料 场地说明 · 选区副本", exact: true })
    .click();
  await expect(dialog(page).getByTestId("material-detail")).toContainText(
    text.slice(start, end),
  );
  await expect(dialog(page).getByTestId("material-detail")).toContainText(
    `v${original.version}`,
  );
});

test("incoming files cannot replace a preview or enter while another modal is open", async ({
  page,
}) => {
  await dropFiles(page, [{ name: "first.txt", text: "必须保留的预览" }]);
  await dialog(page).getByTestId("import-preview").fill("预览中的未保存修订");
  await dropFiles(
    page,
    [{ name: "second.txt", text: "不能覆盖" }],
    ".cauldron",
  );
  await expect(dialog(page).getByTestId("import-preview")).toHaveValue(
    "预览中的未保存修订",
  );
  await expect(importError(page)).toContainText("未完成");
  await dialog(page)
    .getByRole("button", { name: "取消新增", exact: true })
    .click();
  await dialog(page)
    .getByRole("button", { name: "关闭熔炉", exact: true })
    .click();
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await dropFiles(page, [{ name: "blocked.txt", text: "另一面板未关闭" }]);
  await expect(
    page.getByRole("dialog", { name: "魔法书", exact: true }),
  ).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await expect(importError(page)).toContainText("当前面板");
  await page.screenshot({
    path: test.info().outputPath("blocked-modal-drop.png"),
  });
  expect(await records(page)).toHaveLength(2);
});

test("a second drop cannot replace a parser in progress and cancellation ignores a late reply", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/import-text?format=docx", async (route) => {
    requests++;
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
  await dropFiles(page, [{ name: "slow.docx", bytes: [...fixture("docx")] }]);
  await expect.poll(() => requests).toBe(1);
  await expect(
    dialog(page).getByText("正在读取文件…", { exact: true }),
  ).toBeVisible();
  await dropFiles(page, [{ name: "blocked.txt", text: "不得替换" }]);
  await expect(dialog(page).getByTestId("import-preview")).toHaveCount(0);
  await expect(importError(page)).toContainText("未完成");
  await dialog(page)
    .getByRole("button", { name: "取消新增", exact: true })
    .click();
  await dropFiles(
    page,
    [{ name: "later.txt", text: "取消之后的新预览" }],
    ".cauldron",
  );
  await expect(dialog(page).getByTestId("import-preview")).toHaveValue(
    "取消之后的新预览",
  );
  release();
  await page.waitForTimeout(150);
  await expect(dialog(page).getByTestId("import-preview")).toHaveValue(
    "取消之后的新预览",
  );
  expect(requests).toBe(1);
});

test("multiple files, directories, unsupported formats and oversized files are refused without saving", async ({
  page,
}) => {
  for (const [files, directory, message] of [
    [
      [
        { name: "a.txt", text: "A" },
        { name: "b.txt", text: "B" },
      ],
      false,
      /单个|一个/,
    ],
    [[{ name: "folder.txt", text: "目录不是文件" }], true, /目录|文件夹/],
    [[{ name: "unsupported.png", text: "not text" }], false, /TXT|支持/],
    [[{ name: "large.pdf", size: 20_000_001 }], false, /20 MB/],
  ] as [DropFile[], boolean, RegExp][]) {
    await dropFiles(page, files, "body", directory);
    await expect(importError(page)).toContainText(message);
    await expect(dialog(page)).toHaveCount(0);
    expect(await records(page)).toHaveLength(2);
  }
});

test("failed copy persistence preserves its frozen candidate and retry adds exactly one entry", async ({
  page,
}) => {
  await venue(page)
    .getByRole("button", { name: "全文副本入炉", exact: true })
    .click();
  const text = await dialog(page).getByTestId("copy-preview").textContent();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "cauldronEntries") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟副本入炉失败");
      }
      return original.apply(this, args);
    };
  });
  await dialog(page)
    .getByRole("button", { name: "确认加入", exact: true })
    .click();
  await expect(dialog(page).getByRole("alert")).toContainText(
    "模拟副本入炉失败",
  );
  await expect(dialog(page).getByTestId("copy-preview")).toHaveText(text!);
  expect(await records(page)).toHaveLength(2);
  expect(await records(page, "cauldronEntries")).toHaveLength(0);
  await expect(page.locator(".wand-outcome")).not.toHaveAttribute(
    "data-outcome",
    "success",
  );
  expect(await confirmCopy(page)).toHaveLength(1);
  expect(await records(page, "cauldronEntries")).toHaveLength(1);
  await expect(dialog(page)).toContainText("1 / 12");
});

test("pending and failed original-document saves cannot be labelled as a saved-version copy", async ({
  page,
}) => {
  await page.evaluate(() => {
    const original = window.setTimeout;
    window.setTimeout = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: any[]
    ) =>
      original(
        handler,
        timeout === 350 ? 2000 : timeout,
        ...args,
      )) as typeof window.setTimeout;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "materials") {
        IDBObjectStore.prototype.put = put;
        throw new Error("模拟原文保存失败");
      }
      return put.apply(this, args);
    };
  });
  await page.getByLabel("场地说明正文").fill("尚未持久保存的原文");
  await expect(page.getByTestId("save-venue")).toHaveText("待保存");
  await venue(page)
    .getByRole("button", { name: "全文副本入炉", exact: true })
    .click();
  await expect(importError(page)).toContainText("先保存");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId("save-venue")).toHaveText("保存失败");
  await page
    .getByRole("button", { name: "拖入熔炉 场地说明", exact: true })
    .click();
  await expect(dialog(page)).toHaveCount(0);
  expect(
    (await records(page)).filter((m) => m.source.endsWith("_copy")),
  ).toHaveLength(0);
  await venue(page)
    .getByRole("button", { name: "重试保存", exact: true })
    .click();
  await expect(page.getByTestId("save-venue")).toHaveText("已保存");
  await page
    .getByRole("button", { name: "拖入熔炉 场地说明", exact: true })
    .click();
  await expect(dialog(page).getByTestId("copy-preview")).toHaveText(
    "尚未持久保存的原文",
  );
});

test("capacity counts independent copies and a rejected thirteenth drop does not save", async ({
  page,
}) => {
  await venue(page)
    .getByRole("button", { name: "全文副本入炉", exact: true })
    .click();
  for (let index = 0; index < 12; index++) {
    if (index)
      await dialog(page)
        .getByRole("button", { name: "当前文档全文副本", exact: true })
        .click();
    await confirmCopy(page);
  }
  await expect(dialog(page)).toContainText("12 / 12");
  await dropFiles(
    page,
    [{ name: "thirteenth.txt", text: "不能超容量保存" }],
    ".cauldron",
  );
  await expect(importError(page)).toContainText("12");
  await expect(dialog(page).getByTestId("import-preview")).toHaveCount(0);
  expect(await records(page)).toHaveLength(14);
  expect(await records(page, "cauldronEntries")).toHaveLength(12);
  await dialog(page)
    .getByRole("button", { name: "移出熔炉", exact: true })
    .click();
  await expect(dialog(page)).toContainText("11 / 12");
  await dropFiles(
    page,
    [{ name: "after-removal.txt", text: "腾出位置之后" }],
    ".cauldron",
  );
  await expect(dialog(page).getByTestId("import-preview")).toHaveValue(
    "腾出位置之后",
  );
  await dialog(page)
    .getByRole("button", { name: "确认加入", exact: true })
    .click();
  await expect(dialog(page)).toContainText("12 / 12");
});

test("document drag highlights only the cauldron target and dropping elsewhere does not create a copy", async ({
  page,
}) => {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const handle = page.getByRole("button", {
    name: "拖入熔炉 场地说明",
    exact: true,
  });
  await handle.dispatchEvent("dragstart", { dataTransfer: transfer });
  await page
    .locator("body")
    .dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator("html")).toHaveAttribute(
    "data-cauldron-drop",
    "blocked",
  );
  await expect(page.locator(".cauldron-drop-feedback")).toContainText(
    "请拖向顶部",
  );
  await page
    .locator("[data-cauldron-target]")
    .dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator("html")).toHaveAttribute(
    "data-cauldron-drop",
    "allowed",
  );
  await expect(page.locator(".cauldron-drop-feedback")).toContainText(
    "确认保存后加入",
  );
  await page.screenshot({
    path: test.info().outputPath("document-drop-highlight.png"),
  });
  await page.locator("body").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(dialog(page)).toHaveCount(0);
  await expect(importError(page)).toContainText("请拖向顶部");
  await expect(page.locator("html")).not.toHaveAttribute("data-cauldron-drop");
  await expect(page.locator(".cauldron-drop-feedback")).toHaveCount(0);
  expect(await records(page)).toHaveLength(2);
  await transfer.dispose();
});

test("another tab changing the original before confirmation rejects the stale copy without losing its preview", async ({
  page,
  context,
}) => {
  const text = await page.getByLabel("场地说明正文").inputValue();
  await venue(page)
    .getByRole("button", { name: "全文副本入炉", exact: true })
    .click();
  await expect(dialog(page).getByTestId("copy-preview")).toHaveText(text);
  const other = await context.newPage();
  await other.route(
    /\/api\/(understand|check|create|connections)(\?|$)/,
    (route) => {
      throw new Error(
        "Copy conflict tests must not call a model: " + route.request().url(),
      );
    },
  );
  await other.goto("/");
  await other.getByLabel("场地说明正文").fill("另一标签保存的新原文");
  await expect(other.getByTestId("save-venue")).toHaveText("已保存");
  await page.bringToFront();
  await dialog(page)
    .getByRole("button", { name: "确认加入", exact: true })
    .click();
  await expect(dialog(page).getByRole("alert")).toContainText(
    "原文已变化或移除",
  );
  await expect(dialog(page).getByTestId("copy-preview")).toHaveText(text);
  expect(
    (await records(page)).filter((m) => m.source.endsWith("_copy")),
  ).toHaveLength(0);
  expect(await records(page, "cauldronEntries")).toHaveLength(0);
  await expect(page.locator(".wand-outcome")).not.toHaveAttribute(
    "data-outcome",
    "success",
  );
});
