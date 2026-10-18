import { editDocument } from "./document-editor";
import { test, expect, type Page, type Route } from "./offline-app";

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
  await page.getByRole("button", { name: "Open core abilities", exact: true }).click();
  await page.getByRole("menuitem", { name: entry, exact: true }).click();
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
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
    .getByRole("button", { name: `Run Gemini ${label}`, exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Offline character test" }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
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
    path: "test-results/english/pdf0710-reading-working.png",
  });
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(
    page.getByRole("heading", { name: "Gemini: material summary" }),
  ).toBeVisible();
  await expect(companion).toHaveAttribute("data-phase", "success");
  await page.getByRole("button", { name: "Close result", exact: true }).click();
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
  await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
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
    page.getByRole("heading", { name: "Gemini: material summary" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Process current full text again", exact: true })
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
  await page.getByRole("button", { name: "Retry saving result", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Gemini: material summary" }),
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
    await page.screenshot({ path: `test-results/english/pdf0710-${state}.png` });
    const editor = (await editDocument(page, "Bookstore event proposal"));
    await editor.focus();
    await page.keyboard.insertText("编辑仍有效");
    await expect(page.locator(".companion")).toHaveAttribute(
      "data-state",
      "yielding",
    );
    await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByLabel("Close material panel", { exact: true }).click();
    await requests[0].fulfill({ json: reply(requests[0], op) }).catch(() => {});
  }
});

test("system and application reduced motion keep active reading static; hidden character preserves results", async ({
  page,
}) => {
  for (const mode of ["system", "setting", "hidden"]) {
    await page.reload();
    await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
    if (mode === "system") await page.emulateMedia({ reducedMotion: "reduce" });
    else {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.getByRole("button", { name: "Grimoire", exact: true }).click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      if (mode === "setting") await page.getByLabel("Reduce motion").check();
      else await page.getByLabel("Show the witch").uncheck();
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
      page.getByRole("heading", { name: "Gemini: material summary" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close result", exact: true })
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
  await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
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
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Idle rhythm").selectOption("lively");
  await expect(
    page.getByRole("dialog", { name: "Grimoire" }).getByRole("status"),
  ).toContainText("Settings saved");
  await page.reload();
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Idle rhythm")).toHaveValue("lively");
  await page.keyboard.press("Escape");
  await page.mouse.move(1050, 700);
  await expect(companion).toHaveAttribute("data-idle-action", "hat", {
    timeout: 1000,
  });
});

async function summon(page: Page, role = "Page Sprite") {
  await page.getByRole("button", { name: "Open core abilities", exact: true }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await page.getByRole("button", { name: role }).click();
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
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
    path: "test-results/english/pdf0710-background-brewing.png",
  });
  await open(page, "Check");
  await run(page, "检查");
  await expect(character).toHaveAttribute("data-state", "checking");
  await expect(character).toHaveAttribute("data-activity-source", "foreground");
  await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
  await page.getByLabel("Close material panel", { exact: true }).click();
  await expect(character).toHaveAttribute("data-state", "brewing");
  await expect.poll(() => creates.length).toBe(1);
  await creates[0].fulfill({ json: reply(creates[0], "create") });
  await expect(character).toHaveAttribute("data-state", "reading");
  await expect(character).toHaveAttribute("data-phase", "working");
  await reads[0].fulfill({ json: reply(reads[0]) });
  await expect(character).toHaveAttribute("data-phase", "success");
  await expect(character).toHaveAttribute("data-phase", "");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("2 unread");
  await checks[0].fulfill({ json: reply(checks[0], "check") }).catch(() => {});
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("2 unread");
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
  await page.getByRole("button", { name: "View familiar tasks", exact: true }).click();
  await page.getByRole("button", { name: "Recall task", exact: true }).click();
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Cancelled" }),
  ).toHaveCount(1);
  await page.getByLabel("Close Grimoire", { exact: true }).click();
  await expect(character).not.toHaveAttribute("data-state", "checking");
  await checks[1].fulfill({ json: reply(checks[1], "check") }).catch(() => {});
  await expect(character).toHaveAttribute("data-phase", "");
});

test("cauldron starts brewing only during the confirmed processing call", async ({
  page,
}) => {
  const requests = await held(page);
  await page.getByRole("button", { name: "Inspiration Cauldron", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Inspiration Cauldron" });
  await dialog
    .getByRole("button", { name: "All local materials", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Select material Bookstore event proposal", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Understand", exact: true }).click();
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "brewing",
  );
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await run(page);
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "brewing",
  );
  await page.screenshot({
    path: "test-results/english/pdf0710-foreground-brewing.png",
  });
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().postDataJSON()).not.toHaveProperty(
    "presentation",
  );
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(
    page.getByRole("heading", { name: "Gemini: material summary" }),
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
  await page.screenshot({ path: "test-results/english/pdf0710-idle-nap.png" });
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
    .getByRole("region", { name: "Bookstore event proposal window" })
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
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 unread");
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
