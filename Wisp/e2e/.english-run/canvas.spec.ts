import { expect, test, type Page } from "./fixture";
import type { ConnectionRequest } from "../../apps/web/src/domain/canvas";

const first = { title: "潮汐魔石", text: "魔石只在退潮后的月光下显现。" };
const second = {
  title: "沿海节庆",
  text: "村民每逢满月退潮，会沿海岸收集发光的石头。",
};
const title = "退潮与月光连接了魔石和节庆";
function response(request: ConnectionRequest) {
  return {
    ...request,
    operation: "connect",
    schemaVersion: "gemini-connection-1",
    execution: "gemini",
    status: "completed",
    createdAt: new Date().toISOString(),
    connections: [
      {
        title,
        explanation:
          "两张便笺都提到退潮与月光，可以把节庆采石活动作为魔石出现的故事入口。",
        evidence: request.notes.map((note) => ({
          noteId: note.id,
          quote: note.text,
          start: 0,
          end: note.text.length,
        })),
      },
    ],
    reason: "",
    metadata: {
      modelId: "browser-test",
      promptVersion: "test",
      validatorVersion: "test",
      durationMs: 1,
    },
  };
}
async function isolateApi(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: route.request().url().endsWith("/health") ? 200 : 503,
      json: { service: "wisp", jobs_enabled: false, model_connected: false },
    }),
  );
}
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Canvas board" }).click();
  await expect(page.getByRole("region", { name: "Canvas board" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New note" })).toBeEnabled();
}
async function add(page: Page, note: typeof first) {
  await page.getByRole("button", { name: "New note" }).click();
  await page.getByLabel("Note title", { exact: true }).fill(note.title);
  await page.getByLabel("Note text", { exact: true }).fill(note.text);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveCount(0);
}
async function selectPair(page: Page) {
  await page
    .getByRole("article", { name: `Note ${first.title}`, exact: true })
    .click();
  await page
    .getByRole("article", { name: `Note ${second.title}`, exact: true })
    .click({ modifiers: ["Shift"] });
  await expect(page.getByText("Selected 2 / 2 notes", { exact: true })).toBeVisible();
}
async function proposals(page: Page, enabled: boolean) {
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Helpful proposals (local suggestions)")
    .setChecked(enabled);
  await page.getByRole("button", { name: "Close Grimoire" }).click();
}

test.beforeEach(async ({ page }) => {
  await isolateApi(page);
});

test("explicit analysis, evidence, keep, reload, movement, stale versions and cascade removal", async ({
  page,
}) => {
  const errors: string[] = [],
    requests: ConnectionRequest[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/connections", async (route) => {
    const request = route.request().postDataJSON() as ConnectionRequest;
    requests.push(request);
    await route.fulfill({ json: response(request) });
  });
  await open(page);
  await proposals(page, true);
  await add(page, first);
  await add(page, second);
  await selectPair(page);
  await expect(
    page.getByRole("region", { name: "Find connection proposal" }),
  ).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Find connection", exact: true }).click();
  await expect(
    page.locator(".canvas-lines path[data-state=candidate]"),
  ).toHaveCount(1);
  await expect(page.locator(".canvas-explanation blockquote")).toHaveCount(2);
  expect(requests).toHaveLength(1);
  expect(requests[0].notes.map((n) => n.text)).toEqual([
    first.text,
    second.text,
  ]);
  await expect(page.locator(".canvas-saved-item")).toHaveCount(0);
  await page.getByRole("button", { name: "Keep connection", exact: true }).click();
  await expect(
    page.locator(".canvas-lines path[data-state=confirmed]"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: title, exact: true }).click();
  await page.screenshot({ path: "test-results/english/pdf01-canvas.png" });
  const note = page.getByRole("article", {
    name: `Note ${first.title}`,
    exact: true,
  });
  const before = await note.boundingBox();
  const grip = page.getByRole("button", { name: `Move note ${first.title}` });
  await grip.focus();
  await grip.press("ArrowRight");
  await expect
    .poll(async () => (await note.boundingBox())!.x)
    .toBe(before!.x + 20);
  await expect(grip).toBeEnabled();
  const handle = await grip.boundingBox();
  await grip.hover();
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2 + 40,
    handle!.y + handle!.height / 2 + 70,
  );
  await page.mouse.up();
  await expect
    .poll(() => note.evaluate((element) => parseFloat(element.style.left)))
    .toBeCloseTo(88, 1);
  await expect
    .poll(() => note.evaluate((element) => parseFloat(element.style.top)))
    .toBeCloseTo(98, 1);
  await expect(grip).toBeEnabled();
  await expect(note.getByText("Version 1")).toBeVisible();
  await expect(
    page.locator(".canvas-lines path[data-state=confirmed]"),
  ).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Open Canvas board" }).click();
  await expect(page.locator(".canvas-saved-item")).toHaveCount(1);
  await expect(page.getByTestId("canvas-note")).toHaveCount(2);
  await expect
    .poll(() => note.evaluate((element) => parseFloat(element.style.left)))
    .toBeCloseTo(88, 1);
  await expect
    .poll(() => note.evaluate((element) => parseFloat(element.style.top)))
    .toBeCloseTo(98, 1);
  await note.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Note text", { exact: true })
    .fill(first.text + "第二天不再发光。");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.locator(".canvas-lines path[data-state=stale]"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(
    page.locator(".canvas-explanation blockquote").first(),
  ).toContainText(first.text);
  await expect(
    page.locator(".canvas-explanation blockquote").first(),
  ).not.toContainText("第二天");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Remove note ${first.title}`, exact: true })
    .click();
  await expect(page.getByTestId("canvas-note")).toHaveCount(1);
  await expect(page.locator(".canvas-lines path")).toHaveCount(0);
  await expect(page.locator(".canvas-saved-item")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("declining makes no request, manual action survives proposals off, and two-note selection is enforced", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/connections", async (route) => {
    calls++;
    await route.fulfill({
      json: {
        ...response(route.request().postDataJSON()),
        connections: [],
        reason: "这两张便笺目前没有足够依据。",
      },
    });
  });
  await open(page);
  await proposals(page, true);
  await add(page, first);
  await add(page, second);
  await add(page, { title: "独立想法", text: "书店需要一本新目录。" });
  await selectPair(page);
  await expect(
    page.getByRole("region", { name: "Find connection proposal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await page
    .getByRole("checkbox", { name: "Select note 独立想法", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Select exactly two notes");
  await expect(page.getByText("Selected 2 / 2 notes", { exact: true })).toBeVisible();
  await proposals(page, false);
  await expect(page.getByRole("region", { name: "Find connection proposal" })).toHaveCount(
    0,
  );
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Find connection", exact: true }).click();
  await expect(
    page.getByText("这两张便笺目前没有足够依据。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-lines path")).toHaveCount(0);
  expect(calls).toBe(1);
});

test("invalid evidence is rejected and storage retry does not call the model again", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/connections", async (route) => {
    const result = response(route.request().postDataJSON());
    if (++calls === 1)
      result.connections[0].evidence[0].quote = "并不存在的原文";
    await route.fulfill({ json: result });
  });
  await open(page);
  await add(page, first);
  await add(page, second);
  await selectPair(page);
  await page.getByRole("button", { name: "Find connection", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("validation");
  await expect(
    page.getByRole("button", { name: "Keep connection", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Retry finding connection" }).click();
  await expect(
    page.getByRole("button", { name: "Keep connection", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "canvasConnections") {
        IDBObjectStore.prototype.add = original;
        throw new DOMException("test quota", "QuotaExceededError");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Keep connection", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".canvas-saved-item")).toHaveCount(0);
  await page.getByRole("button", { name: "Keep connection", exact: true }).click();
  await expect(page.locator(".canvas-saved-item")).toHaveCount(1);
  expect(calls).toBe(2);
});

test("closing cancels analysis and a late response never reappears", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("**/api/connections", async (route) => {
    started = true;
    const result = response(route.request().postDataJSON());
    await pending;
    await route.fulfill({ json: result }).catch(() => {});
  });
  await open(page);
  await add(page, first);
  await add(page, second);
  await selectPair(page);
  await page.getByRole("button", { name: "Find connection", exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await expect(page.getByText("Finding a connection…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close canvas" }).click();
  release();
  await page.getByRole("button", { name: "Open Canvas board" }).click();
  await expect(
    page.getByRole("button", { name: "Find connection", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".canvas-explanation")).toHaveCount(0);
  await expect(page.locator(".canvas-saved-item")).toHaveCount(0);
});

test("cross-tab conflicts preserve drafts and deleting a relation clears open detail", async ({
  page,
  context,
}) => {
  await page.route("**/api/connections", (route) =>
    route.fulfill({ json: response(route.request().postDataJSON()) }),
  );
  await open(page);
  await add(page, first);
  await add(page, second);
  await selectPair(page);
  await page.getByRole("button", { name: "Find connection", exact: true }).click();
  await page.getByRole("button", { name: "Keep connection", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  const other = await context.newPage();
  await isolateApi(other);
  await open(other);
  other.once("dialog", (dialog) => dialog.accept());
  await other.getByRole("button", { name: `Remove connection ${title}` }).click();
  await expect(page.locator(".canvas-saved-item")).toHaveCount(0);
  await expect(page.locator(".canvas-explanation")).toHaveCount(0);
  await page
    .getByRole("article", { name: `Note ${first.title}`, exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByLabel("Note text", { exact: true })
    .fill("保留在本页的未保存草稿。");
  await other
    .getByRole("article", { name: `Note ${first.title}`, exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await other
    .getByLabel("Note text", { exact: true })
    .fill("另一个标签已保存的内容。");
  await other.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(other.getByLabel("Note text", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("another tab");
  await expect(page.getByLabel("Note text", { exact: true })).toHaveValue(
    "保留在本页的未保存草稿。",
  );
  await other.close();
});

test("drag cancellation and upper dialogs preserve the board and draft on a small viewport", async ({
  page,
}) => {
  await open(page);
  await add(page, first);
  const note = page.getByRole("article", {
    name: `Note ${first.title}`,
    exact: true,
  });
  const before = await note.boundingBox();
  const grip = page.getByRole("button", { name: `Move note ${first.title}` });
  await grip.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x + 350, before!.y + 200);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(note).toHaveCSS("left", "28px");
  expect(
    await page.locator("html").getAttribute("data-wisp-gesture"),
  ).toBeNull();
  await note.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Note text", { exact: true }).fill("暂存的想法");
  await proposals(page, false);
  await expect(page.getByLabel("Note text", { exact: true })).toHaveValue(
    "暂存的想法",
  );
  await page.setViewportSize({ width: 480, height: 780 });
  const bounds = await page
    .getByRole("region", { name: "Canvas board" })
    .boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(480);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByLabel("Note text", { exact: true })).toHaveCount(0);
});
