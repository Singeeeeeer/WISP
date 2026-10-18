import { test, expect, type Page, type Route } from "@playwright/test";
import type { MaterialSnapshot } from "../apps/web/src/domain/model";

type ClipboardWindow = Window & {
  __outcomeCopies: { text: string; resolve: () => void; reject: () => void }[];
};

function reply(route: Route) {
  const body = route.request().postDataJSON() as {
    snapshot: MaterialSnapshot;
    instruction: string;
  };
  return {
    id: body.snapshot.id,
    operation: "check",
    status: "completed",
    execution: "gemini",
    schemaVersion: "gemini-check-1",
    snapshot: body.snapshot,
    instruction: body.instruction,
    createdAt: new Date().toISOString(),
    outcome: "needs_information",
    findings: [],
    missingInformation: ["测试：请补充报名渠道"],
    metadata: {
      modelId: "mock-wand-outcome",
      promptVersion: "check-1",
      validatorVersion: "evidence-1",
      durationMs: 1,
    },
  };
}

async function delayRequests(page: Page) {
  const requests: Route[] = [];
  await page.route("**/api/check", (route) => {
    requests.push(route);
  });
  return requests;
}

async function succeed(route: Route) {
  await route.fulfill({ json: reply(route) });
}

async function fail(route: Route) {
  await route.fulfill({
    status: 503,
    json: { error: { code: "MODEL_UNAVAILABLE" } },
  });
}

async function openCheck(page: Page) {
  await page
    .getByRole("button", { name: "打开书店活动提案", exact: true })
    .click();
  await page.mouse.click(1100, 300, { button: "right" });
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
}

async function completeCheck(page: Page) {
  await page.route("**/api/check", succeed);
  await openCheck(page);
  await page
    .getByRole("button", { name: "运行 Gemini 检查", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini：需要补充信息", exact: true }),
  ).toBeVisible();
}

async function observeOutcomes(page: Page) {
  await page.locator(".wand-outcome").evaluate((element) => {
    const values = [element.getAttribute("data-outcome")];
    element.setAttribute("data-test-history", JSON.stringify(values));
    new MutationObserver((records) => {
      // Old values preserve even transitions that share a single render frame.
      for (const record of records) values.push(record.oldValue);
      values.push(element.getAttribute("data-outcome"));
      element.setAttribute("data-test-history", JSON.stringify(values));
    }).observe(element, {
      attributes: true,
      attributeFilter: ["data-outcome"],
      attributeOldValue: true,
    });
  });
}

async function outcomeHistory(page: Page): Promise<string[]> {
  return JSON.parse(
    (await page.locator(".wand-outcome").getAttribute("data-test-history"))!,
  );
}

async function clipboardPromises(page: Page) {
  await page.evaluate(() => {
    const state = window as ClipboardWindow;
    state.__outcomeCopies = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) =>
          new Promise<void>((resolve, reject) => {
            state.__outcomeCopies.push({
              text,
              resolve,
              reject: () => reject(new Error("模拟剪贴板拒绝")),
            });
          }),
      },
    });
  });
}

async function settleCopy(page: Page, index: number, success: boolean) {
  await page.evaluate(
    ({ index, success }) => {
      const copy = (window as ClipboardWindow).__outcomeCopies[index];
      if (success) copy.resolve();
      else copy.reject();
    },
    { index, success },
  );
}

async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

test.beforeEach(async ({ page }) => {
  // No API process, environment file or real model participates in this suite.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Outcome test: API disabled" }),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
  await expect(page.locator(".wand-outcome")).toHaveAttribute(
    "data-outcome",
    "none",
  );
});

test("pending work and failed persistence never claim success, while retry succeeds only after saving", async ({
  page,
}) => {
  const requests = await delayRequests(page);
  await openCheck(page);
  await observeOutcomes(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = add;
        throw new Error("模拟结果落盘失败");
      }
      return add.apply(this, args);
    };
  });
  const outcome = page.locator(".wand-outcome");
  await page
    .getByRole("button", { name: "运行 Gemini 检查", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "正在处理并保存…", exact: true }),
  ).toBeDisabled();
  await expect(outcome).toHaveAttribute("data-outcome", "none");
  await succeed(requests[0]);
  await expect(page.getByRole("alert")).toContainText("模拟结果落盘失败");
  await expect(outcome).toHaveAttribute("data-outcome", "error");
  expect(await outcomeHistory(page)).not.toContain("success");
  await expect(
    page.getByRole("heading", { name: "Gemini：需要补充信息", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "重试保存结果", exact: true }).click();
  await expect(outcome).toHaveAttribute("data-outcome", "success");
  await expect(
    page.getByRole("heading", { name: "Gemini：需要补充信息", exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  const records = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open("wisp-module-one");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const count = db
            .transaction("checks", "readonly")
            .objectStore("checks")
            .count();
          count.onsuccess = () => {
            resolve(count.result);
            db.close();
          };
          count.onerror = () => {
            reject(count.error);
            db.close();
          };
        };
      }),
  );
  expect(records).toBe(1);
  await expect(outcome).toHaveCSS("pointer-events", "none");
});

test("request failure, retry and cancellation report the actual result and ignore an aborted late reply", async ({
  page,
}) => {
  const requests = await delayRequests(page);
  await openCheck(page);
  await observeOutcomes(page);
  const outcome = page.locator(".wand-outcome");
  const run = page.getByRole("button", {
    name: "运行 Gemini 检查",
    exact: true,
  });
  await run.click();
  await expect.poll(() => requests.length).toBe(1);
  await fail(requests[0]);
  await expect(page.getByRole("alert")).toContainText("Gemini 服务暂时不可用");
  await expect(outcome).toHaveAttribute("data-outcome", "error");
  await run.click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(outcome).toHaveAttribute("data-outcome", "none");
  await page.getByRole("button", { name: "停止等待", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("已停止等待");
  await expect(outcome).toHaveAttribute("data-outcome", "cancel");
  await run.click();
  await expect.poll(() => requests.length).toBe(3);
  await expect(outcome).toHaveAttribute("data-outcome", "none");
  await succeed(requests[1]).catch(() => {});
  await frames(page);
  await expect(outcome).toHaveAttribute("data-outcome", "none");
  await expect(
    page.getByRole("heading", { name: "Gemini：需要补充信息", exact: true }),
  ).toHaveCount(0);
  await fail(requests[2]);
  await expect(outcome).toHaveAttribute("data-outcome", "error");
  expect(await outcomeHistory(page)).not.toContain("success");
});

test("copy feedback waits for the real clipboard promise and distinguishes resolve from reject", async ({
  page,
}) => {
  await completeCheck(page);
  await clipboardPromises(page);
  const outcome = page.locator(".wand-outcome");
  const copy = page.getByRole("button", { name: "复制结果", exact: true });
  await copy.click();
  await expect(outcome).toHaveAttribute("data-outcome", "none");
  expect(
    await page.evaluate(
      () => (window as ClipboardWindow).__outcomeCopies[0].text,
    ),
  ).toContain("Check · Gemini");
  await settleCopy(page, 0, true);
  await expect(page.getByText("已复制结果", { exact: true })).toBeVisible();
  await expect(outcome).toHaveAttribute("data-outcome", "success");
  const anchor = await outcome.evaluate((element) => ({
    left: getComputedStyle(element).left,
    top: getComputedStyle(element).top,
  }));
  await page.mouse.move(50, 50);
  expect(
    await outcome.evaluate((element) => ({
      left: getComputedStyle(element).left,
      top: getComputedStyle(element).top,
    })),
  ).toEqual(anchor);
  await copy.click();
  await expect(outcome).toHaveAttribute("data-outcome", "none");
  await settleCopy(page, 1, false);
  await expect(
    page.getByText("复制失败，请手动选择结果文字复制。", { exact: true }),
  ).toBeVisible();
  await expect(outcome).toHaveAttribute("data-outcome", "error");
});

test("newer copy wins over an older completion and removing the source suppresses its late feedback", async ({
  page,
}) => {
  await completeCheck(page);
  await clipboardPromises(page);
  await observeOutcomes(page);
  const outcome = page.locator(".wand-outcome");
  const copy = page.getByRole("button", { name: "复制结果", exact: true });
  await copy.click();
  await copy.click();
  await settleCopy(page, 1, true);
  await expect(outcome).toHaveAttribute("data-outcome", "success");
  await settleCopy(page, 0, false);
  await frames(page);
  await expect(outcome).toHaveAttribute("data-outcome", "success");
  await expect(page.getByText("已复制结果", { exact: true })).toBeVisible();
  await expect(
    page.getByText("复制失败，请手动选择结果文字复制。", { exact: true }),
  ).toHaveCount(0);
  expect(await outcomeHistory(page)).not.toContain("error");
  await copy.click();
  await expect(outcome).toHaveAttribute("data-outcome", "none");
  const beforeUnmount = (await outcomeHistory(page)).length;
  await page.getByRole("button", { name: "关闭检查结果", exact: true }).click();
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "魔法书", exact: true }),
  ).toBeVisible();
  await settleCopy(page, 2, true);
  await frames(page);
  await expect(outcome).toHaveAttribute("data-outcome", "none");
  expect((await outcomeHistory(page)).slice(beforeUnmount)).not.toContain(
    "success",
  );
  await expect(
    page.getByRole("dialog", { name: "魔法书", exact: true }),
  ).toBeVisible();
});

test("cauldron cancellation and saved removal report results even when the action button disappears", async ({
  page,
}) => {
  await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "灵感熔炉", exact: true });
  const outcome = page.locator(".wand-outcome");
  await dialog.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await dialog.getByLabel("粘贴正文").fill("这份输入将明确取消。");
  await dialog.getByRole("button", { name: "取消新增", exact: true }).click();
  await expect(outcome).toHaveAttribute("data-outcome", "cancel");
  await expect(dialog).toContainText("0 / 12");
  await dialog.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await dialog.getByLabel("新材料标题").fill("结果反馈材料");
  await dialog.getByLabel("粘贴正文").fill("移出熔炉仍然保留已保存正文。");
  await dialog.getByRole("button", { name: "确认加入", exact: true }).click();
  await expect(outcome).toHaveAttribute("data-outcome", "success");
  await expect(dialog.getByLabel("材料标题", { exact: true })).toHaveValue(
    "结果反馈材料",
  );
  await expect(outcome).toHaveAttribute("data-outcome", "none", {
    timeout: 2000,
  });
  await dialog.getByRole("button", { name: "移出熔炉", exact: true }).click();
  await expect(outcome).toHaveAttribute("data-outcome", "success");
  await expect(dialog).toContainText("0 / 12");
  await expect(
    dialog.getByRole("button", { name: "移出熔炉", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "全部本地材料", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "选择材料 结果反馈材料", exact: true })
    .click();
  await expect(dialog.getByTestId("material-detail")).toContainText(
    "移出熔炉仍然保留已保存正文。",
  );
});

for (const source of ["application", "system"] as const) {
  test(`${source} reduced motion and a hidden witch keep a static, brief outcome without blocking editing`, async ({
    page,
  }) => {
    await page.getByRole("button", { name: "魔法书", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("显示小魔女").uncheck();
    if (source === "application") await page.getByLabel("减少动态效果").check();
    else await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("Escape");
    await expect(page.locator(".companion")).toHaveCount(0);
    await completeCheck(page);
    const outcome = page.locator(".wand-outcome");
    await expect(outcome).toHaveAttribute("data-outcome", "success");
    expect(
      await outcome.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await expect(outcome).toHaveCSS("pointer-events", "none");
    const editor = page.getByLabel("书店活动提案正文");
    await editor.fill("结果提示显示期间仍可编辑原文。");
    await expect(editor).toHaveValue("结果提示显示期间仍可编辑原文。");
    await expect(outcome).toHaveAttribute("data-outcome", "none", {
      timeout: 2000,
    });
  });
}
