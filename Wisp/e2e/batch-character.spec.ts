import { test, expect, type Page, type Route } from "@playwright/test";
import type {
  MaterialSnapshot,
  SummaryStyle,
} from "../apps/web/src/domain/model";

type BatchRequest = {
  id: string;
  snapshots: MaterialSnapshot[];
  instruction: string;
  summaryStyle: SummaryStyle;
};

function reply(route: Route) {
  const body = route.request().postDataJSON() as BatchRequest;
  return {
    id: body.id,
    scope: "batch",
    operation: "understand",
    status: "completed",
    execution: "gemini",
    schemaVersion: "gemini-batch-understand-1",
    snapshots: body.snapshots,
    instruction: body.instruction,
    summaryStyle: body.summaryStyle,
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "mock-batch-character",
      promptVersion: "mock",
      validatorVersion: "batch-evidence-1",
      durationMs: 1,
    },
    outcome: "ready",
    summary: "两份虚构材料的测试摘要。",
    summaryEvidence: body.snapshots.map((source, index) => ({
      sourceIndex: index + 1,
      start: 0,
      end: 2,
      quote: source.text.slice(0, 2),
    })),
    keyPoints: [],
    missingInformation: [],
  };
}

async function prepare(page: Page, entry = "Understand") {
  await page.getByRole("button", { name: "灵感熔炉", exact: true }).click();
  const cauldron = page.getByRole("dialog", {
    name: "灵感熔炉",
    exact: true,
  });
  const titles = ["角色集成甲", "角色集成乙"];
  for (const [index, title] of titles.entries()) {
    await cauldron
      .getByRole("button", { name: "粘贴文本", exact: true })
      .click();
    await cauldron.getByLabel("新材料标题").fill(title);
    await cauldron
      .getByLabel("粘贴正文")
      .fill(`虚构材料${index + 1}：周末阅读活动。`);
    await cauldron
      .getByRole("button", { name: "确认加入", exact: true })
      .click();
    await expect(cauldron.getByLabel("材料标题", { exact: true })).toHaveValue(
      title,
    );
  }
  await cauldron
    .getByRole("button", { name: "勾选多材料", exact: true })
    .click();
  for (const title of titles)
    await cauldron
      .getByRole("checkbox", { name: `处理材料 ${title}`, exact: true })
      .check();
  await cauldron
    .getByRole("button", { name: `${entry} 多材料`, exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "多材料确认", exact: true }),
  ).toBeVisible();
}

async function held(page: Page) {
  const requests: Route[] = [];
  await page.route("**/api/batch/understand", (route) => {
    requests.push(route);
  });
  return requests;
}

async function run(page: Page) {
  await page
    .getByRole("button", { name: "开始多材料处理", exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Offline batch character test" }),
  );
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
});

test("batch brewing begins with processing, celebrates saved success and clears on close", async ({
  page,
}) => {
  const requests = await held(page);
  await prepare(page);
  const character = page.locator(".companion");
  await expect(character).not.toHaveAttribute("data-state", "brewing");
  await run(page);
  await expect(character).toHaveAttribute("data-state", "brewing");
  await expect(character).toHaveAttribute("data-phase", "working");
  await expect(character).toHaveAttribute("data-activity-source", "foreground");
  const safe = await character.evaluate((element) => {
    if (getComputedStyle(element).visibility === "hidden") return true;
    const box = element.getBoundingClientRect();
    const panel = document
      .querySelector(".floating-panel")!
      .getBoundingClientRect();
    return (
      box.right <= panel.left ||
      box.left >= panel.right ||
      box.bottom <= panel.top ||
      box.top >= panel.bottom
    );
  });
  expect(safe).toBe(true);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].request().postDataJSON()).not.toHaveProperty(
    "presentation",
  );
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(
    page.getByRole("heading", { name: "多材料 Understand 结果", exact: true }),
  ).toBeVisible();
  await expect(character).toHaveAttribute("data-phase", "success");
  await page
    .getByRole("button", { name: "关闭多材料结果", exact: true })
    .click();
  await expect(character).not.toHaveAttribute("data-state", "brewing");
  await expect(character).toHaveAttribute("data-phase", "");
});

test("cancelled batch work and its late reply cannot restore an old brewing action", async ({
  page,
}) => {
  const requests = await held(page);
  await prepare(page);
  const character = page.locator(".companion");
  await run(page);
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole("button", { name: "停止等待", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(character).not.toHaveAttribute("data-state", "brewing");
  await run(page);
  await expect.poll(() => requests.length).toBe(2);
  await requests[0].fulfill({ json: reply(requests[0]) }).catch(() => {});
  await expect(character).toHaveAttribute("data-phase", "working");
  await expect(
    page.getByRole("heading", { name: "多材料 Understand 结果", exact: true }),
  ).toHaveCount(0);
  await requests[1].fulfill({ json: reply(requests[1]) });
  await expect(
    page.getByRole("heading", { name: "多材料 Understand 结果", exact: true }),
  ).toBeVisible();
  await expect(character).toHaveAttribute("data-phase", "success");
});

test("batch save failure ends brewing and retry only saves the frozen reply", async ({
  page,
}) => {
  const requests = await held(page);
  await prepare(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = add;
        throw Error("测试多材料保存失败");
      }
      return add.apply(this, args);
    };
  });
  await run(page);
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(page.getByRole("alert")).toContainText("测试多材料保存失败");
  const character = page.locator(".companion");
  await expect(character).not.toHaveAttribute("data-state", "brewing");
  await expect(character).toHaveAttribute("data-phase", "");
  await page
    .getByRole("button", { name: "重试保存多材料结果", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "多材料 Understand 结果", exact: true }),
  ).toBeVisible();
  await expect(character).toHaveAttribute("data-phase", "success");
  expect(requests).toHaveLength(1);
});

test("a batch familiar flies only after enqueue; keyboard retry and real completion are independent of flight", async ({
  page,
}) => {
  const requests = await held(page);
  await prepare(page, "Summon");
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "tasks") {
        IDBObjectStore.prototype.add = add;
        throw Error("测试多材料委托保存失败");
      }
      return add.apply(this, args);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains("familiar-flight")) {
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
  });
  const submit = page.getByRole("button", {
    name: "召唤多材料使魔",
    exact: true,
  });
  const flight = page.locator(".familiar-flight");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("测试多材料委托保存失败");
  await expect(flight).toHaveAttribute("data-flight", "none");
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "brewing",
  );
  expect(requests).toHaveLength(0);
  await submit.focus();
  await submit.scrollIntoViewIfNeeded();
  const origin = (await submit.boundingBox())!;
  await page.keyboard.press("Enter");
  await expect(flight).toHaveAttribute("data-flight", "flying");
  await expect(flight).toHaveAttribute("data-familiar", "page_sprite");
  const box = (await flight.boundingBox())!;
  expect(box.x + box.width / 2).toBeCloseTo(origin.x + origin.width / 2, 0);
  expect(box.y + box.height / 2).toBeCloseTo(origin.y + origin.height / 2, 0);
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  const character = page.locator(".companion");
  await expect(character).toHaveAttribute("data-state", "reading");
  await expect(character).toHaveAttribute("data-activity-source", "background");
  await character.evaluate((element) => {
    const phases: string[] = [];
    (
      window as Window & { __batchCharacterPhases?: string[] }
    ).__batchCharacterPhases = phases;
    new MutationObserver(() => {
      phases.push(element.getAttribute("data-phase") ?? "");
    }).observe(element, { attributes: true, attributeFilter: ["data-phase"] });
  });
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({ json: reply(requests[0]) });
  await expect(
    page.getByRole("complementary", { name: "使魔任务状态" }),
  ).toContainText("1 封未读");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __batchCharacterPhases?: string[] })
            .__batchCharacterPhases,
      ),
    )
    .toContain("success");
  await expect(flight).toHaveAttribute("data-flight", "flying");
  await flight.evaluate((element) => element.getAnimations()[0].finish());
  await expect(flight).toHaveAttribute("data-flight", "none");
});
