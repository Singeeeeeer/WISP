import { test, expect, type Page, type Route } from "@playwright/test";

function reply(route: Route, operation = "understand") {
  const body = route.request().postDataJSON();
  const quote = body.snapshot.text.slice(0, 6);
  const evidence = [{ start: 0, end: quote.length, quote }];
  return {
    id: body.snapshot.id,
    operation,
    status: "completed",
    execution: "gemini",
    schemaVersion: `gemini-${operation}-1`,
    snapshot: body.snapshot,
    instruction: body.instruction,
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "mock-character",
      promptVersion: "mock",
      validatorVersion: "evidence-1",
      durationMs: 1,
    },
    missingInformation: [],
    ...(operation === "understand"
      ? {
          outcome: "ready",
          summaryStyle: body.summaryStyle,
          summary: "测试摘要",
          summaryEvidence: evidence,
          keyPoints: [],
        }
      : operation === "check"
        ? {
            outcome: "needs_information",
            findings: [],
            missingInformation: ["测试待补充"],
          }
        : {
            outcome: "draft",
            draft: "待人工确认的测试草稿",
            alternatives: [],
            sourceFacts: [{ statement: "测试材料", evidence }],
            assumptions: [],
          }),
  };
}

async function open(page: Page, entry = "Understand") {
  await page.getByRole("button", { name: "打开基础能力", exact: true }).click();
  await page.getByRole("menuitem", { name: entry, exact: true }).click();
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
}
async function held(page: Page, operation = "understand") {
  const requests: Route[] = [];
  await page.route(`**/api/${operation}`, (route) => {
    requests.push(route);
  });
  return requests;
}
async function run(page: Page, label = "理解") {
  await page
    .getByRole("button", { name: `运行 Gemini ${label}`, exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Offline character test" }),
  );
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
});

test("reading follows real processing, avoids the panel, lights only on saved success and clears on close", async ({
  page,
}) => {
  const requests = await held(page);
  await open(page);
  await run(page);
  const companion = page.locator(".companion");
  await expect(companion).toHaveAttribute("data-state", "reading");
  await expect(companion).toHaveAttribute("data-phase", "working");
  await expect(companion.locator(".companion-pose")).toHaveAttribute(
    "data-pose",
    "reading",
  );
  const outside = await page.evaluate(() => {
    const c = document.querySelector(".companion")!.getBoundingClientRect();
    const p = document
      .querySelector(".floating-panel")!
      .getBoundingClientRect();
    return (
      c.right <= p.left ||
      c.left >= p.right ||
      c.bottom <= p.top ||
      c.top >= p.bottom
    );
  });
  expect(outside).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/pdf0710-reading-working.png",
  });
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(
    page.getByRole("heading", { name: "Gemini：材料摘要" }),
  ).toBeVisible();
  await expect(companion).toHaveAttribute("data-phase", "success");
  await page.getByRole("button", { name: "关闭处理结果", exact: true }).click();
  await expect(companion).not.toHaveAttribute("data-state", "reading");
  await expect(companion).toHaveAttribute("data-phase", "");
});

test("cancel, late response, failure and retry cannot resurrect an old reading action", async ({
  page,
}) => {
  const requests = await held(page);
  await open(page);
  await run(page);
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole("button", { name: "停止等待", exact: true }).click();
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "reading",
  );
  await run(page);
  await expect.poll(() => requests.length).toBe(2);
  await requests[0].fulfill({ json: reply(requests[0]) }).catch(() => {});
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-phase",
    "working",
  );
  await requests[1].fulfill({
    status: 503,
    json: { error: { code: "MODEL_UNAVAILABLE" } },
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "reading",
  );
  await run(page);
  await expect.poll(() => requests.length).toBe(3);
  await requests[2].fulfill({ json: reply(requests[2]) });
  await expect(
    page.getByRole("heading", { name: "Gemini：材料摘要" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "重新处理当前全文", exact: true })
    .click();
  await expect(page.locator(".companion")).toHaveAttribute("data-phase", "");
});

test("save failure ends reading and retry saves without a second model request", async ({
  page,
}) => {
  const requests = await held(page);
  await open(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = add;
        throw Error("测试保存失败");
      }
      return add.apply(this, args);
    };
  });
  await run(page);
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(page.getByRole("alert")).toContainText("测试保存失败");
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "reading",
  );
  await page.getByRole("button", { name: "重试保存结果", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Gemini：材料摘要" }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("Check and Create show distinct actions; native editing takes priority", async ({
  page,
}) => {
  for (const [entry, op, label, state] of [
    ["Check", "check", "检查", "checking"],
    ["Create", "create", "创作", "creating"],
  ]) {
    const requests = await held(page, op);
    await open(page, entry);
    await run(page, label);
    await expect(page.locator(".companion")).toHaveAttribute(
      "data-state",
      state,
    );
    await page.screenshot({ path: `docs/screenshots/pdf0710-${state}.png` });
    const editor = page.getByLabel("书店活动提案正文");
    await editor.focus();
    await page.keyboard.insertText("编辑仍有效");
    await expect(page.locator(".companion")).toHaveAttribute(
      "data-state",
      "yielding",
    );
    await page.getByRole("button", { name: "停止等待", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByLabel("关闭材料面板", { exact: true }).click();
    await requests[0].fulfill({ json: reply(requests[0], op) }).catch(() => {});
  }
});

test("system and application reduced motion keep active reading static; hidden character preserves results", async ({
  page,
}) => {
  for (const mode of ["system", "setting", "hidden"]) {
    await page.reload();
    await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
    if (mode === "system") await page.emulateMedia({ reducedMotion: "reduce" });
    else {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.getByRole("button", { name: "魔法书", exact: true }).click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      if (mode === "setting") await page.getByLabel("减少动态效果").check();
      else await page.getByLabel("显示小魔女").uncheck();
      await page.keyboard.press("Escape");
    }
    const requests = await held(page);
    await open(page);
    await run(page);
    if (mode === "hidden")
      await expect(page.locator(".companion")).toHaveCount(0);
    else {
      await expect(page.locator(".companion")).toHaveAttribute(
        "data-state",
        "reading",
      );
      const frames = await page
        .locator(".companion")
        .evaluate(async (element) => {
          const first = JSON.stringify(
            element.getBoundingClientRect().toJSON(),
          );
          await new Promise((r) => setTimeout(r, 200));
          return {
            first,
            last: JSON.stringify(element.getBoundingClientRect().toJSON()),
            animations: element
              .getAnimations({ subtree: true })
              .filter((a) => a.playState === "running").length,
          };
        });
      expect(frames.first).toBe(frames.last);
      expect(frames.animations).toBe(0);
    }
    await expect.poll(() => requests.length).toBe(1);
    await requests[0].fulfill({ json: reply(requests[0]) });
    await expect(
      page.getByRole("heading", { name: "Gemini：材料摘要" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "关闭处理结果", exact: true })
      .click();
  }
});

test("narrow viewport suppresses decoration when no space is available and keeps cancellation usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await held(page);
  await open(page);
  await run(page);
  const panel = page.locator(".floating-panel");
  await expect(panel).toBeVisible();
  const safe = await page.evaluate(() => {
    const c = document.querySelector(".companion")!;
    if (getComputedStyle(c).visibility === "hidden") return true;
    const r = c.getBoundingClientRect(),
      p = document.querySelector(".floating-panel")!.getBoundingClientRect();
    return (
      r.right <= p.left ||
      r.left >= p.right ||
      r.bottom <= p.top ||
      r.top >= p.bottom
    );
  });
  expect(safe).toBe(true);
  await page.getByRole("button", { name: "停止等待", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("idle thresholds remain distinct from hover and settings persist; movement interrupts the action", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  await page.mouse.move(1100, 700);
  await expect(companion).toHaveAttribute("data-state", "idle");
  await expect(companion).toHaveAttribute("data-idle-action", "");
  await expect(companion).toHaveAttribute("data-idle-action", "hat");
  await page.mouse.move(1050, 700);
  await expect(companion).toHaveAttribute("data-idle-action", "");
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("待机节奏").selectOption("lively");
  await expect(
    page.getByRole("dialog", { name: "魔法书" }).getByRole("status"),
  ).toContainText("设置已保存");
  await page.reload();
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("待机节奏")).toHaveValue("lively");
  await page.keyboard.press("Escape");
  await page.mouse.move(1050, 700);
  await expect(companion).toHaveAttribute("data-idle-action", "hat", {
    timeout: 1000,
  });
});

async function summon(page: Page, role = "Page Sprite") {
  await page.getByRole("button", { name: "打开基础能力", exact: true }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await page.getByRole("button", { name: role }).click();
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
  await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
  await expect(page.locator(".floating-panel")).toHaveCount(0);
}

test("background uses the latest running task and foreground work has priority", async ({
  page,
}) => {
  const reads = await held(page);
  const creates = await held(page, "create");
  const checks = await held(page, "check");
  const character = page.locator(".companion");
  await summon(page);
  await expect(character).toHaveAttribute("data-state", "reading");
  await expect(character).toHaveAttribute("data-activity-source", "background");
  await summon(page, "Alchemy Imp");
  await expect(character).toHaveAttribute("data-state", "brewing");
  await page.screenshot({
    path: "docs/screenshots/pdf0710-background-brewing.png",
  });
  await open(page, "Check");
  await run(page, "检查");
  await expect(character).toHaveAttribute("data-state", "checking");
  await expect(character).toHaveAttribute("data-activity-source", "foreground");
  await page.getByRole("button", { name: "停止等待", exact: true }).click();
  await page.getByLabel("关闭材料面板", { exact: true }).click();
  await expect(character).toHaveAttribute("data-state", "brewing");
  await expect.poll(() => creates.length).toBe(1);
  await creates[0].fulfill({ json: reply(creates[0], "create") });
  await expect(character).toHaveAttribute("data-state", "reading");
  await expect(character).toHaveAttribute("data-phase", "working");
  await reads[0].fulfill({ json: reply(reads[0]) });
  await expect(character).toHaveAttribute("data-phase", "success");
  await expect(character).toHaveAttribute("data-phase", "");
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("2 封未读");
  await checks[0].fulfill({ json: reply(checks[0], "check") }).catch(() => {});
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("2 封未读");
  await expect(character).toHaveAttribute("data-phase", "");
});

test("failed and recalled background work restores following without a false completion", async ({
  page,
}) => {
  const checks = await held(page, "check");
  const character = page.locator(".companion");
  await summon(page, "Scout Bat");
  await expect(character).toHaveAttribute("data-state", "checking");
  await expect.poll(() => checks.length).toBe(1);
  await checks[0].fulfill({
    status: 503,
    json: { error: { code: "MODEL_UNAVAILABLE" } },
  });
  await expect(character).not.toHaveAttribute("data-state", "checking");
  await expect(character).toHaveAttribute("data-phase", "");
  await summon(page, "Scout Bat");
  await expect(character).toHaveAttribute("data-state", "checking");
  await page.getByRole("button", { name: "查看使魔任务", exact: true }).click();
  await page.getByRole("button", { name: "召回任务", exact: true }).click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: "已召回" }),
  ).toHaveCount(1);
  await page.getByLabel("关闭魔法书", { exact: true }).click();
  await expect(character).not.toHaveAttribute("data-state", "checking");
  await checks[1].fulfill({ json: reply(checks[1], "check") }).catch(() => {});
  await expect(character).toHaveAttribute("data-phase", "");
});

test("cauldron starts brewing only during the confirmed processing call", async ({
  page,
}) => {
  const requests = await held(page);
  await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "灵感熔炉" });
  await dialog
    .getByRole("button", { name: "全部本地材料", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "选择材料 书店活动提案", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Understand", exact: true }).click();
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "brewing",
  );
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
  await run(page);
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "brewing",
  );
  await page.screenshot({
    path: "docs/screenshots/pdf0710-foreground-brewing.png",
  });
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().postDataJSON()).not.toHaveProperty(
    "presentation",
  );
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(
    page.getByRole("heading", { name: "Gemini：材料摘要" }),
  ).toBeVisible();
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-phase",
    "success",
  );
});

test("idle cycles through the three gestures and a keyboard operation interrupts it", async ({
  page,
}) => {
  const character = page.locator(".companion");
  await page.mouse.move(1100, 700);
  for (const action of ["hat", "sweep", "nap"]) {
    await expect(character).toHaveAttribute("data-idle-action", action);
    await expect(character.locator(".companion-pose")).toHaveAttribute(
      "data-pose",
      action,
    );
  }
  await page.screenshot({ path: "docs/screenshots/pdf0710-idle-nap.png" });
  await page.keyboard.press("q");
  await expect(character).toHaveAttribute("data-state", "casting");
  await expect(character).toHaveAttribute("data-idle-action", "");
  await page.keyboard.press("Escape");
  await expect(character).toHaveAttribute("data-state", "following");
});

test("a real task completion cannot end yielding while a window drag is still held", async ({
  page,
}) => {
  const requests = await held(page);
  await summon(page);
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "reading",
  );
  await expect.poll(() => requests.length).toBe(1);
  const bar = (await page
    .getByRole("region", { name: "书店活动提案窗口" })
    .locator(".window-titlebar")
    .boundingBox())!;
  await page.mouse.move(bar.x + 130, bar.y + 20);
  await page.mouse.down();
  await page.mouse.move(bar.x + 180, bar.y + 45, { steps: 4 });
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "yielding",
  );
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
  await expect(page.locator("html")).toHaveAttribute(
    "data-wisp-gesture",
    "drag",
  );
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "yielding",
  );
  await page.mouse.up();
  await expect(page.locator("html")).not.toHaveAttribute("data-wisp-gesture");
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "yielding",
  );
});
