import { test, expect, type Locator, type Page } from "@playwright/test";
import type {
  MaterialSnapshot,
  SummaryStyle,
} from "../apps/web/src/domain/model";

type Operation = "understand" | "check" | "create";
type BatchRequest = {
  id: string;
  snapshots: MaterialSnapshot[];
  instruction: string;
  summaryStyle?: SummaryStyle;
};
const titles = ["虚构提案甲", "虚构场地乙"];
const prefixes = ["前言甲。", "前言乙。"];
const selections = ["项目甲😀：周六阅读。", "场地乙：仅十个座位。"];
const privateText = ["未选私有甲", "未选私有乙"];
const texts = selections.map((text, i) => prefixes[i] + text + privateText[i]);
const labels = { understand: "Understand", check: "Check", create: "Create" };
const draftText = "<script>unsafe()</script>虚构读书会建议【待补充：日期】";

function reply(body: BatchRequest, operation: Operation) {
  const evidence = body.snapshots.slice(0, 2).map((snapshot, index) => {
    const quote = [...snapshot.text].slice(0, 4).join("");
    return { sourceIndex: index + 1, start: 0, end: quote.length, quote };
  });
  const base = {
    id: body.id,
    scope: "batch",
    snapshots: body.snapshots,
    operation,
    status: "completed",
    execution: "gemini",
    schemaVersion: `gemini-batch-${operation}-1`,
    instruction: body.instruction,
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "mock-gemini-batch",
      promptVersion: `batch-${operation}-1`,
      validatorVersion: "batch-evidence-1",
      durationMs: 12,
    },
    missingInformation: ["请确认活动日期"],
  };
  if (operation === "understand")
    return {
      ...base,
      outcome: "ready",
      summaryStyle: body.summaryStyle,
      summary: "综合两份材料，读书活动需要按座位数安排。",
      summaryEvidence: evidence,
      keyPoints: [
        {
          title: "统筹活动",
          explanation: "结合活动意图与场地限制。",
          evidence,
        },
      ],
    };
  if (operation === "check")
    return {
      ...base,
      outcome: "findings",
      findings: [
        {
          title: "跨材料安排待核对",
          explanation: "活动计划须与场地容量一致。",
          suggestion: "确认报名人数。",
          evidence,
        },
      ],
    };
  return {
    ...base,
    outcome: "draft",
    draft: draftText,
    alternatives: [{ title: "分场活动", description: "建议安排不同场次。" }],
    sourceFacts: [{ statement: "材料中的活动及场地条件", evidence }],
    assumptions: ["分场为创作建议，尚未确认。"],
  };
}

async function openCauldron(page: Page) {
  await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
  return page.getByRole("dialog", { name: "灵感熔炉", exact: true });
}

async function paste(dialog: Locator, title: string, text: string) {
  await dialog.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await dialog.getByLabel("新材料标题").fill(title);
  await dialog.getByLabel("粘贴正文").fill(text);
  await dialog.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(dialog.getByLabel("材料标题", { exact: true })).toHaveValue(
    title,
  );
}

async function addPair(page: Page, contents = texts) {
  const dialog = await openCauldron(page);
  await paste(dialog, titles[0], contents[0]);
  await dialog.getByRole("button", { name: "导入文件", exact: true }).click();
  await dialog.getByLabel("选择文件").setInputFiles({
    name: "虚构来源乙.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(contents[1]),
  });
  await expect(dialog.getByTestId("import-preview")).toHaveValue(contents[1]);
  await dialog.getByLabel("新材料标题").fill(titles[1]);
  await dialog.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(dialog.getByLabel("材料标题", { exact: true })).toHaveValue(
    titles[1],
  );
  return dialog;
}

async function prepare(
  page: Page,
  dialog: Locator,
  entry = "Understand",
  names = titles,
) {
  await dialog.getByRole("button", { name: "勾选多材料", exact: true }).click();
  for (const name of names)
    await dialog
      .getByRole("checkbox", { name: "处理材料 " + name, exact: true })
      .check();
  await dialog
    .getByRole("button", { name: entry + " 多材料", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "多材料确认",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  return confirmation;
}

async function selectSegment(
  confirmation: Locator,
  index: number,
  prefix: string,
  text: string,
) {
  await confirmation
    .getByText(`调整材料 ${index} 的处理范围`, { exact: true })
    .click();
  const preview = confirmation.getByRole("textbox", {
    name: `材料 ${index} 范围预览`,
    exact: true,
  });
  await preview.scrollIntoViewIfNeeded();
  const points = await preview.evaluate(
    (element: HTMLTextAreaElement, selection) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      const metrics = canvas.getContext("2d")!;
      metrics.font = style.font;
      const left =
        rect.left +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft);
      return {
        start: left + metrics.measureText(selection.prefix).width + 0.5,
        end:
          left +
          metrics.measureText(selection.prefix + selection.text).width +
          0.5,
        y:
          rect.top +
          parseFloat(style.borderTopWidth) +
          parseFloat(style.paddingTop) +
          parseFloat(style.lineHeight) / 2,
      };
    },
    { prefix, text },
  );
  // Chrome read-only textareas use arrow keys to scroll. Drag the actual text.
  const page = preview.page();
  await page.mouse.move(points.start, points.y);
  await page.mouse.down();
  await page.mouse.move(points.end, points.y, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      preview.evaluate((element: HTMLTextAreaElement) =>
        element.value.slice(element.selectionStart, element.selectionEnd),
      ),
    )
    .toBe(text);
  await confirmation
    .getByRole("button", { name: `使用材料 ${index} 选中片段`, exact: true })
    .click();
  await expect(confirmation.getByTestId(`batch-snapshot-${index}`)).toHaveText(
    text,
  );
}

async function readStore(page: Page, store: "checks" | "tasks" | "materials") {
  return page.evaluate(async (storeName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("wisp-module-one");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<any[]>((resolve, reject) => {
        const request = db
          .transaction(storeName)
          .objectStore(storeName)
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, store);
}

async function clipboard(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__batchCopied = text;
        },
      },
    });
  });
}

test.beforeEach(async ({ context }) => {
  // A missing route fails closed instead of reaching an API or a real model.
  await context.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "NOT_CONFIGURED" } },
    }),
  );
});

for (const operation of ["understand", "check", "create"] as const) {
  test(`${operation}: two independent sources and exact selected ranges survive result, copy and reload`, async ({
    page,
  }) => {
    const sent: BatchRequest[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/batch/" + operation, (route) => {
      const body = route.request().postDataJSON();
      sent.push(body);
      return route.fulfill({ json: reply(body, operation) });
    });
    await page.goto("/");
    const dialog = await addPair(page);
    const confirmation = await prepare(page, dialog, labels[operation]);
    await expect(confirmation).toContainText("粘贴文本");
    await expect(confirmation).toContainText("虚构来源乙.txt");
    for (let i = 0; i < 2; i++)
      await selectSegment(confirmation, i + 1, prefixes[i], selections[i]);
    if (operation === "understand")
      await confirmation.getByLabel("本次摘要长度").selectOption("brief");
    await confirmation
      .getByLabel("多材料补充要求")
      .fill("综合两份虚构材料，保留出处");
    expect(sent).toHaveLength(0);
    if (operation === "understand")
      await page.screenshot({
        path: "test-results/batch/screenshots/confirmation.png",
      });
    await confirmation
      .getByRole("button", { name: "开始多材料处理", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: `多材料 ${labels[operation]} 结果`,
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/batch/screenshots/${operation}-result.png`,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].snapshots.map((snapshot) => snapshot.text)).toEqual(
      selections,
    );
    expect(sent[0].snapshots.map((snapshot) => snapshot.source)).toEqual([
      "pasted_text",
      "txt_file",
    ]);
    expect(sent[0].snapshots.map((snapshot) => snapshot.start)).toEqual(
      prefixes.map((text) => text.length),
    );
    expect(new Set(sent[0].snapshots.map((snapshot) => snapshot.id)).size).toBe(
      2,
    );
    expect(
      new Set(sent[0].snapshots.map((snapshot) => snapshot.materialId)).size,
    ).toBe(2);
    expect(
      sent[0].snapshots.every((snapshot) => snapshot.materialVersion === 1),
    ).toBe(true);
    for (const text of privateText)
      expect(JSON.stringify(sent[0])).not.toContain(text);
    if (operation === "understand") expect(sent[0].summaryStyle).toBe("brief");
    else expect(sent[0]).not.toHaveProperty("summaryStyle");
    await expect
      .poll(async () => (await readStore(page, "checks")).length)
      .toBe(1);
    expect(await readStore(page, "tasks")).toHaveLength(0);
    await clipboard(page);
    await page
      .getByRole("button", { name: "复制多材料结果", exact: true })
      .click();
    const copied = await page.evaluate(() => (window as any).__batchCopied);
    for (const title of titles) expect(copied).toContain(title);
    for (const text of privateText) expect(copied).not.toContain(text);
    expect(copied).toContain("材料 1");
    expect(copied).toContain("材料 2");
    if (operation === "create") {
      await expect(page.getByText(draftText, { exact: true })).toBeVisible();
      await expect(
        page.locator("script").filter({ hasText: "unsafe()" }),
      ).toHaveCount(0);
    }
    await page.reload();
    await page.getByRole("button", { name: "处理记录", exact: true }).click();
    await page.getByRole("button", { name: /查看多材料.*结果/ }).click();
    await expect(
      page.getByRole("heading", {
        name: `多材料 ${labels[operation]} 结果`,
        exact: true,
      }),
    ).toBeVisible();
    const [record] = await readStore(page, "checks");
    expect(record.snapshots).toEqual(sent[0].snapshots);
    expect(record.scope).toBe("batch");
    expect(sent).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

test("read-only preview permits Unicode-safe keyboard range selection without changing the source", async ({
  page,
}) => {
  await page.goto("/");
  const original = "甲😀乙丙";
  const confirmation = await prepare(
    page,
    await addPair(page, [original, texts[1]]),
  );
  await confirmation
    .getByText("调整材料 1 的处理范围", { exact: true })
    .click();
  const preview = confirmation.getByRole("textbox", {
    name: "材料 1 范围预览",
    exact: true,
  });
  await preview.click();
  await preview.press("Control+Home");
  await preview.press("ArrowRight");
  await preview.press("Shift+ArrowRight");
  await expect
    .poll(() =>
      preview.evaluate((element: HTMLTextAreaElement) => ({
        start: element.selectionStart,
        end: element.selectionEnd,
        text: element.value.slice(element.selectionStart, element.selectionEnd),
      })),
    )
    .toEqual({ start: 1, end: 3, text: "😀" });
  await preview.press("Shift+ArrowRight");
  await preview.press("Shift+ArrowLeft");
  await confirmation
    .getByRole("button", { name: "使用材料 1 选中片段", exact: true })
    .click();
  await expect(confirmation.getByTestId("batch-snapshot-1")).toHaveText("😀");
  await expect(preview).toHaveValue(original);
  await preview.click();
  await preview.press("Control+End");
  await preview.press("Shift+ArrowLeft");
  await preview.press("Shift+ArrowLeft");
  await preview.press("Shift+ArrowLeft");
  await confirmation
    .getByRole("button", { name: "使用材料 1 选中片段", exact: true })
    .click();
  await expect(confirmation.getByTestId("batch-snapshot-1")).toHaveText(
    "😀乙丙",
  );
  await expect(preview).toHaveValue(original);
  const materials = await readStore(page, "materials");
  expect(materials.find((material) => material.title === titles[0]).text).toBe(
    original,
  );
  expect(await readStore(page, "checks")).toHaveLength(0);
});

test("selection requires two current cauldron members and opening or dismissing confirmation makes no request", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/batch/**", (route) => {
    calls++;
    return route.abort();
  });
  await page.goto("/");
  const dialog = await addPair(page);
  await dialog.getByRole("button", { name: "勾选多材料", exact: true }).click();
  const start = dialog.getByRole("button", {
    name: "Understand 多材料",
    exact: true,
  });
  await expect(start).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: "处理材料 " + titles[0], exact: true })
    .check();
  await expect(start).toBeDisabled();
  await dialog
    .getByRole("button", { name: "全部本地材料", exact: true })
    .click();
  await expect(
    dialog.getByRole("checkbox", { name: "处理材料 场地说明", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: "处理材料 " + titles[1], exact: true })
    .check();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByTestId("batch-snapshot-1")).toHaveText(texts[0]);
  await page
    .getByRole("button", { name: "关闭多材料确认", exact: true })
    .click();
  expect(calls).toBe(0);
  expect(await readStore(page, "checks")).toHaveLength(0);
  expect(await readStore(page, "tasks")).toHaveLength(0);
});

test("60001 UTF-16 units are never truncated or sent; reducing scope to exactly 60000 enables processing", async ({
  page,
}) => {
  const sent: BatchRequest[] = [];
  await page.route("**/api/batch/check", (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    return route.fulfill({ json: reply(body, "check") });
  });
  await page.goto("/");
  const contents = ["甲".repeat(30001), "乙".repeat(30000)];
  const dialog = await addPair(page, contents);
  const confirmation = await prepare(page, dialog, "Check");
  const start = confirmation.getByRole("button", {
    name: "开始多材料处理",
    exact: true,
  });
  await expect(start).toBeDisabled();
  await expect(confirmation).toContainText("60,000");
  await expect(confirmation.getByTestId("batch-snapshot-1")).toHaveText(
    contents[0],
  );
  expect(sent).toHaveLength(0);
  await confirmation
    .getByText("调整材料 1 的处理范围", { exact: true })
    .click();
  const preview = confirmation.getByRole("textbox", {
    name: "材料 1 范围预览",
    exact: true,
  });
  // The large boundary fixture uses the native selection API; the primary
  // capability tests above exercise real mouse selection, including emoji.
  await preview.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(0, 30000);
  });
  await preview.press("Shift");
  await confirmation
    .getByRole("button", { name: "使用材料 1 选中片段", exact: true })
    .click();
  await expect(confirmation.getByTestId("batch-snapshot-1")).toHaveText(
    "甲".repeat(30000),
  );
  await expect(start).toBeEnabled();
  await confirmation
    .getByRole("button", { name: "恢复材料 1 全文", exact: true })
    .click();
  await expect(start).toBeDisabled();
  await preview.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(0, 30000);
  });
  await preview.press("Shift");
  await confirmation
    .getByRole("button", { name: "使用材料 1 选中片段", exact: true })
    .click();
  await start.click();
  await expect(
    page.getByRole("heading", { name: "多材料 Check 结果", exact: true }),
  ).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0].snapshots.map((snapshot) => snapshot.text.length)).toEqual([
    30000, 30000,
  ]);
});

test("saving failure retains frozen result and retry only saves once", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/batch/understand", (route) => {
    calls++;
    return route.fulfill({
      json: reply(route.request().postDataJSON(), "understand"),
    });
  });
  await page.goto("/");
  const confirmation = await prepare(page, await addPair(page));
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟批量落盘失败");
      }
      return original.apply(this, args);
    };
  });
  await confirmation
    .getByRole("button", { name: "开始多材料处理", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("模拟批量落盘失败");
  expect(calls).toBe(1);
  expect(await readStore(page, "checks")).toHaveLength(0);
  await expect(confirmation.getByLabel("多材料补充要求")).toBeDisabled();
  await expect(confirmation.getByLabel("本次摘要长度")).toBeDisabled();
  await page
    .getByRole("button", { name: "重试保存多材料结果", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "多材料 Understand 结果", exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect(await readStore(page, "checks")).toHaveLength(1);
});

test("foreground cancellation discards late output without saving a result", async ({
  page,
}) => {
  let release: () => void = () => {};
  let calls = 0;
  const completed: Promise<void>[] = [];
  await page.route("**/api/batch/create", async (route) => {
    calls++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    completed.push(
      route
        .fulfill({ json: reply(route.request().postDataJSON(), "create") })
        .catch(() => {}),
    );
    await completed[completed.length - 1];
  });
  await page.goto("/");
  const confirmation = await prepare(page, await addPair(page), "Create");
  await confirmation
    .getByRole("button", { name: "开始多材料处理", exact: true })
    .click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "停止等待", exact: true }).click();
  release();
  await expect.poll(() => completed.length).toBe(1);
  await Promise.all(completed);
  await expect(
    page.getByRole("heading", { name: "多材料 Create 结果", exact: true }),
  ).toHaveCount(0);
  expect(await readStore(page, "checks")).toHaveLength(0);
});

for (const failure of ["provider", "evidence"] as const) {
  test(`${failure} failure never creates a fake batch result`, async ({
    page,
  }) => {
    await page.route("**/api/batch/check", (route) => {
      if (failure === "provider")
        return route.fulfill({
          status: 503,
          json: { error: { code: "MODEL_UNAVAILABLE" } },
        });
      const result = reply(route.request().postDataJSON(), "check") as any;
      result.findings[0].evidence[0].sourceIndex = 3;
      return route.fulfill({ json: result });
    });
    await page.goto("/");
    const confirmation = await prepare(page, await addPair(page), "Check");
    await confirmation
      .getByRole("button", { name: "开始多材料处理", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "多材料 Check 结果", exact: true }),
    ).toHaveCount(0);
    expect(await readStore(page, "checks")).toHaveLength(0);
    await expect(confirmation.getByTestId("batch-snapshot-1")).toHaveText(
      texts[0],
    );
  });
}

for (const [role, operation] of [
  ["Page Sprite", "understand"],
  ["Scout Bat", "check"],
  ["Alchemy Imp", "create"],
] as const) {
  test(`${role} returns one batch task reply, preserves sources and persists on refresh`, async ({
    page,
  }) => {
    const sent: BatchRequest[] = [];
    await page.route("**/api/batch/" + operation, (route) => {
      const body = route.request().postDataJSON();
      sent.push(body);
      return route.fulfill({ json: reply(body, operation) });
    });
    await page.goto("/");
    const confirmation = await prepare(page, await addPair(page), "Summon");
    await confirmation.getByRole("button", { name: new RegExp(role) }).click();
    await selectSegment(confirmation, 1, prefixes[0], selections[0]);
    expect(sent).toHaveLength(0);
    await confirmation
      .getByRole("button", { name: "召唤多材料使魔", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "使魔任务状态" }),
    ).toContainText("1 封未读");
    expect(sent).toHaveLength(1);
    expect(sent[0].snapshots.map((snapshot) => snapshot.text)).toEqual([
      selections[0],
      texts[1],
    ]);
    expect(await readStore(page, "checks")).toHaveLength(0);
    expect(await readStore(page, "tasks")).toHaveLength(1);
    await page.reload();
    await page.getByRole("button", { name: "查看使魔任务" }).click();
    await expect(page.getByTestId("task-card")).toHaveCount(1);
    for (const title of titles)
      await expect(page.getByTestId("task-card")).toContainText(title);
    await page.getByRole("button", { name: "查看回信", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: `多材料 ${labels[operation]} 结果`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "关闭多材料结果", exact: true })
      .click();
    await page.getByRole("button", { name: "收好记录", exact: true }).click();
    await expect(page.getByTestId("task-card")).toContainText("已收好");
    expect(sent).toHaveLength(1);
  });
}

test("a pending batch reply retains its live task lock across tabs and retry saves without another model request", async ({
  page,
  context,
}) => {
  let calls = 0;
  await page.route("**/api/batch/understand", (route) => {
    calls++;
    return route.fulfill({
      json: reply(route.request().postDataJSON(), "understand"),
    });
  });
  await page.goto("/");
  const confirmation = await prepare(page, await addPair(page), "Summon");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "tasks" && args[0]?.status === "completed") {
        IDBObjectStore.prototype.put = original;
        throw new Error("模拟批量回信落盘失败");
      }
      return original.apply(this, args);
    };
  });
  await confirmation
    .getByRole("button", { name: "召唤多材料使魔", exact: true })
    .click();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toContainText(
    "模型处理已结束，回信尚未保存",
  );
  await expect(
    page.getByRole("button", { name: "查看回信", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("0 封未读");
  expect(calls).toBe(1);
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(other.getByTestId("task-card")).toContainText("处理中");
  await expect(other.getByTestId("task-card")).not.toContainText("已中断");
  await page.getByRole("button", { name: "重试保存回信", exact: true }).click();
  await expect(page.getByTestId("task-card")).toContainText("已完成");
  await expect(other.getByTestId("task-card")).toContainText("已完成");
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
  expect(calls).toBe(1);
  const tasks = await readStore(page, "tasks");
  expect(tasks).toHaveLength(1);
  expect(tasks[0].result.scope).toBe("batch");
  expect(await readStore(page, "checks")).toHaveLength(0);
  await page.reload();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(page.getByTestId("task-card")).toContainText("已完成");
  expect(calls).toBe(1);
});

test("batch recall wins over a late response and reload interrupts unfinished work without resubmitting", async ({
  page,
}) => {
  const releases: (() => void)[] = [];
  let calls = 0;
  await page.route("**/api/batch/understand", async (route) => {
    calls++;
    await new Promise<void>((resolve) => releases.push(resolve));
    await route
      .fulfill({ json: reply(route.request().postDataJSON(), "understand") })
      .catch(() => {});
  });
  await page.goto("/");
  const confirmation = await prepare(page, await addPair(page), "Summon");
  await confirmation
    .getByRole("button", { name: "召唤多材料使魔", exact: true })
    .click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await page.getByRole("button", { name: "召回任务", exact: true }).click();
  releases[0]();
  await expect(page.getByTestId("task-card")).toContainText("已召回");
  await expect(
    page.getByRole("button", { name: "查看回信", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "重新确认当前材料", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "多材料确认", exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page
    .getByRole("button", { name: "召唤多材料使魔", exact: true })
    .click();
  await expect.poll(() => calls).toBe(2);
  await page.reload();
  releases[1]();
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: "已中断" }),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("task-card").filter({ hasText: "已召回" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "查看回信", exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(2);
});

test("continuation keeps confirmed snapshots after source changes; fresh confirmation takes the new version", async ({
  page,
  context,
}) => {
  const sent: BatchRequest[] = [];
  await page.route("**/api/batch/understand", (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    return route.fulfill({ json: reply(body, "understand") });
  });
  await page.goto("/");
  const confirmation = await prepare(page, await addPair(page));
  await selectSegment(confirmation, 1, prefixes[0], selections[0]);
  await confirmation.getByLabel("本次摘要长度").selectOption("brief");
  await confirmation
    .getByRole("button", { name: "开始多材料处理", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "多材料 Understand 结果", exact: true }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  const otherCauldron = await openCauldron(other);
  await otherCauldron
    .getByRole("button", { name: "选择材料 " + titles[0], exact: true })
    .click();
  await otherCauldron
    .getByRole("button", { name: "打开编辑", exact: true })
    .click();
  const updated = "新版项目甲：改为周日阅读。";
  await other.getByLabel(titles[0] + "正文", { exact: true }).fill(updated);
  await expect
    .poll(
      async () =>
        (await readStore(other, "materials")).find(
          (material) => material.title === titles[0],
        )?.text,
    )
    .toBe(updated);
  await expect(page.getByText(/旧版本/).first()).toBeVisible();
  await page.getByRole("button", { name: "继续召唤使魔", exact: true }).click();
  await expect(page.getByTestId("batch-snapshot-1")).toHaveText(selections[0]);
  await expect(page.getByLabel("本次摘要长度")).toHaveValue("brief");
  expect(sent).toHaveLength(1);
  await page
    .getByRole("button", { name: "召唤多材料使魔", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
  expect(sent).toHaveLength(2);
  expect(sent[1].snapshots.map((snapshot) => snapshot.text)).toEqual([
    selections[0],
    texts[1],
  ]);
  expect(sent[1].snapshots[0].materialVersion).toBe(1);
  await page.getByRole("button", { name: "查看使魔任务" }).click();
  await page.getByRole("button", { name: "查看回信", exact: true }).click();
  await expect(page.getByText(/旧版本/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "重新确认当前材料", exact: true })
    .click();
  await expect(page.getByTestId("batch-snapshot-1")).toHaveText(updated);
  await expect(page.getByTestId("batch-snapshot-2")).toHaveText(texts[1]);
  expect(sent).toHaveLength(2);
});
