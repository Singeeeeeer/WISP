import { test, expect, type Page } from "@playwright/test";

async function open(page: Page, entry: string) {
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: entry, exact: true }).click();
}
test("Understand and Create expose explicit Gemini mode and default to local", async ({
  page,
}) => {
  await page.goto("/");
  for (const entry of ["Understand", "Create"]) {
    await open(page, entry);
    await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
      "local",
    );
    await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
    await expect(
      page.getByRole("button", {
        name: entry === "Understand" ? "Run Gemini Understand" : "Run Gemini Create",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Close material panel", { exact: true }).click();
  }
});

const draftText = "<script>unsafe()</script>阅读活动草稿【待补充：日期】";
const reply = (body: any, operation: "understand" | "create") => {
  const quote = body.snapshot.text.slice(0, 6);
  const evidence = [{ start: 0, end: quote.length, quote }];
  return {
    id: body.snapshot.id,
    operation,
    status: "completed",
    execution: "gemini",
    schemaVersion: "gemini-" + operation + "-1",
    snapshot: body.snapshot,
    instruction: body.instruction,
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "mock-gemini-text",
      promptVersion: operation + "-1",
      validatorVersion: "evidence-1",
      durationMs: 12,
    },
    missingInformation: ["请确认活动日期"],
    ...(operation === "understand"
      ? {
          outcome: "ready",
          summaryStyle: body.summaryStyle,
          summary: "本次材料介绍阅读活动。",
          summaryEvidence: evidence,
          keyPoints: [
            { title: "阅读安排", explanation: "材料包含阅读主题。", evidence },
          ],
        }
      : {
          outcome: "draft",
          draft: draftText,
          alternatives: [
            { title: "备选阅读角", description: "建议设置安静阅读区域。" },
          ],
          sourceFacts: [{ statement: "材料中的主题", evidence }],
          assumptions: ["阅读区域为创作建议，尚未确认。"],
        }),
  };
};
async function clipboard(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__copied = text;
        },
      },
    });
  });
}
async function localExcerpt(page: Page) {
  await page.getByLabel("Excerpt length for this run").selectOption("3");
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await expect(page.getByLabel("Summary length for this run")).toHaveValue("standard");
  await page.getByLabel("Summary length for this run").selectOption("brief");
  await page.getByLabel("Execution mode", { exact: true }).selectOption("local");
  await expect(page.getByLabel("Excerpt length for this run")).toHaveValue("3");
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await expect(page.getByLabel("Summary length for this run")).toHaveValue("brief");
}
test("Understand freezes selection, retries only saving, copies evidence and preserves brief in history and continuation", async ({
  page,
}) => {
  let calls = 0;
  let sent: any;
  await page.route("**/api/understand", (route) => {
    calls++;
    sent = route.request().postDataJSON();
    return route.fulfill({ json: reply(sent, "understand") });
  });
  await page.goto("/");
  const editor = page.getByLabel("Bookstore event proposal text");
  await editor.fill("只发送这句。私有未选中内容");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await editor.press("Control+Home");
  for (let i = 0; i < 6; i++) await editor.press("Shift+ArrowRight");
  await open(page, "Understand");
  await localExcerpt(page);
  await page.getByLabel("Summary length for this run").selectOption("brief");
  await page.getByLabel("Additional instruction", { exact: true }).fill("概括本次选区");
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = add;
        throw Error("模拟文本落盘失败");
      }
      return add.apply(this, args);
    };
  });
  await page
    .getByRole("button", { name: "Run Gemini Understand", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("模拟文本落盘失败");
  await expect(page.getByLabel("Summary length for this run")).toBeDisabled();
  await expect(page.getByLabel("Execution mode", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Additional instruction", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving result", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Gemini: material summary" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/english/gemini-understand-mocked-20261018.png",
  });
  expect(calls).toBe(1);
  expect(sent.snapshot.text).toBe("只发送这句。");
  expect(sent.summaryStyle).toBe("brief");
  expect(sent).not.toHaveProperty("excerptLimit");
  await clipboard(page);
  await page.getByRole("button", { name: "Copy result", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copied))
    .toContain("原文依据 [0,6)：只发送这句。");
  await page.getByRole("button", { name: "Summon familiar again" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText("只发送这句。");
  await expect(
    page.getByRole("button", { name: /Page Sprite/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Summary length for this run")).toHaveValue("brief");
  await page.getByLabel("Close material panel", { exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page
    .getByRole("button", { name: "View Understand result", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini: material summary" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Process current full text again" }).click();
  await expect(page.getByLabel("Summary length for this run")).toHaveValue("brief");
});
test("Create renders pure text, copies labelled complete result or only draft and continues original material", async ({
  page,
}) => {
  let sent: any;
  await page.route("**/api/create", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: reply(sent, "create") });
  });
  await page.goto("/");
  await open(page, "Create");
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await page
    .getByRole("button", { name: "Run Gemini Create", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini: creative draft" }),
  ).toBeVisible();
  await expect(page.getByTestId("gemini-draft")).toHaveText(draftText);
  await expect(page.getByTestId("gemini-draft").locator("script")).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "test-results/english/gemini-create-mocked-20261018.png",
  });
  expect(sent).not.toHaveProperty("summaryStyle");
  expect(sent).not.toHaveProperty("excerptLimit");
  await clipboard(page);
  await page.getByRole("button", { name: "Copy result", exact: true }).click();
  for (const text of [
    "AI draft (requires human review)",
    "备选方向",
    "Source evidence used",
    "Creative assumptions",
    "Information to add",
    "mock-gemini-text",
    "Prompt",
  ]) {
    await expect
      .poll(() => page.evaluate(() => (window as any).__copied))
      .toContain(text);
  }
  await page.getByRole("button", { name: "Copy draft only", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copied))
    .toBe(draftText);
  await page.getByRole("button", { name: "Summon familiar again" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(
    sent.snapshot.text,
  );
  await expect(
    page.getByRole("button", { name: /Alchemy Imp/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
    "gemini",
  );
  await page.getByLabel("Close material panel", { exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page
    .getByRole("button", { name: "View Create result", exact: true })
    .click();
  await expect(page.getByTestId("gemini-draft")).toHaveText(draftText);
});
for (const [role, operation] of [
  ["Page Sprite", "understand"],
  ["Alchemy Imp", "create"],
] as const) {
  test(
    role +
      " Gemini saves unread reply, preserves repeat settings and role switches reset local",
    async ({ page }) => {
      let sent: any;
      await page.route("**/api/" + operation, (route) => {
        sent = route.request().postDataJSON();
        return route.fulfill({ json: reply(sent, operation) });
      });
      await page.goto("/");
      await open(page, "Summon");
      await page.getByRole("button", { name: role, exact: false }).click();
      await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
        "local",
      );
      if (operation === "understand") await localExcerpt(page);
      else
        await page
          .getByLabel("Execution mode", { exact: true })
          .selectOption("gemini");
      if (operation === "understand")
        await page.getByLabel("Summary length for this run").selectOption("brief");
      await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
      await expect(
        page.getByRole("complementary", { name: "Familiar task status" }),
      ).toContainText("1 unread");
      expect(sent).not.toHaveProperty("excerptLimit");
      await page.getByRole("button", { name: "View familiar tasks" }).click();
      await page.getByRole("button", { name: "View reply" }).click();
      await expect(
        page.getByRole("heading", {
          name:
            operation === "understand"
              ? "Gemini: material summary"
              : "Gemini: creative draft",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("complementary", { name: "Familiar task status" }),
      ).toContainText("0 unread");
      await page.getByRole("button", { name: "Delegate current full text again" }).click();
      await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
        "gemini",
      );
      if (operation === "understand")
        await expect(page.getByLabel("Summary length for this run")).toHaveValue("brief");
      await page.getByRole("button", { name: /Scout Bat/ }).click();
      await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
        "local",
      );
      await expect(page.getByLabel("Summary length for this run")).toHaveCount(0);
      await page.getByRole("button", { name: /Page Sprite/ }).click();
      await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
      await expect(page.getByLabel("Summary length for this run")).toHaveValue("standard");
    },
  );
  test(
    role + " cancel and refresh reject late replies without resubmission",
    async ({ page }) => {
      let release = () => {};
      let calls = 0;
      await page.route("**/api/" + operation, async (route) => {
        calls++;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await route
          .fulfill({ json: reply(route.request().postDataJSON(), operation) })
          .catch(() => {});
      });
      await page.goto("/");
      await open(page, "Summon");
      await page.getByRole("button", { name: role, exact: false }).click();
      await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
      await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
      await expect.poll(() => calls).toBe(1);
      await page.getByRole("button", { name: "View familiar tasks" }).click();
      await page.getByRole("button", { name: "Recall task" }).click();
      release();
      await expect(page.getByTestId("task-card")).toContainText("Cancelled");
      await expect(page.getByRole("button", { name: "View reply" })).toHaveCount(
        0,
      );
      await page.getByRole("button", { name: "Delegate current full text again" }).click();
      await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
      await expect.poll(() => calls).toBe(2);
      await page.reload();
      release();
      await page.getByRole("button", { name: "View familiar tasks" }).click();
      await expect(
        page.getByTestId("task-card").filter({ hasText: "Interrupted" }),
      ).toHaveCount(1);
      expect(calls).toBe(2);
    },
  );
}
test("Gemini text completion does not trigger local proposals or alter local excerpt preference", async ({
  page,
}) => {
  await page.route("**/api/understand", (route) =>
    route.fulfill({
      json: reply(route.request().postDataJSON(), "understand"),
    }),
  );
  await page.route("**/api/create", (route) =>
    route.fulfill({ json: reply(route.request().postDataJSON(), "create") }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).check();
  await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  for (const entry of ["Understand", "Understand", "Understand", "Create"]) {
    await open(page, entry);
    await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
    if (entry === "Understand")
      await page.getByLabel("Summary length for this run").selectOption("brief");
    await page
      .getByRole("button", {
        name: entry === "Understand" ? "Run Gemini Understand" : "Run Gemini Create",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Close result", exact: true })
      .click();
  }
  await expect(page.getByRole("button", { name: "View watch scope" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("complementary", { name: "Helpful proposal", exact: true }),
  ).toHaveCount(0);
  await open(page, "Understand");
  await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
    "local",
  );
  await expect(page.getByLabel("Excerpt length for this run")).toHaveValue("8");
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await expect(page.getByLabel("Summary length for this run")).toHaveValue("standard");
});

for (const operation of ["understand", "create"] as const) {
  test(
    operation + " needs information renders no fabricated summary or draft",
    async ({ page }) => {
      await page.route("**/api/" + operation, (route) => {
        const result = reply(route.request().postDataJSON(), operation);
        return route.fulfill({
          json: {
            ...result,
            outcome: "needs_information",
            ...(operation === "understand"
              ? { summary: "", summaryEvidence: [], keyPoints: [] }
              : { draft: "", alternatives: [] }),
          },
        });
      });
      await page.goto("/");
      await open(page, operation === "understand" ? "Understand" : "Create");
      await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
      await page
        .getByRole("button", {
          name:
            operation === "understand"
              ? "Run Gemini Understand"
              : "Run Gemini Create",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: "Gemini: more information needed" }),
      ).toBeVisible();
      await expect(
        page.getByText("请确认活动日期", { exact: true }),
      ).toBeVisible();
      if (operation === "create")
        await expect(
          page.getByRole("button", { name: "Copy draft only", exact: true }),
        ).toBeDisabled();
      else
        await expect(
          page.getByText("Not enough material to generate a summary.", { exact: true }),
        ).toBeVisible();
    },
  );
}

test("Gemini continuation does not read local excerpt defaults", async ({
  page,
}) => {
  await page.route("**/api/understand", (route) =>
    route.fulfill({
      json: reply(route.request().postDataJSON(), "understand"),
    }),
  );
  await page.goto("/");
  await open(page, "Understand");
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await page
    .getByRole("button", { name: "Run Gemini Understand", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini: material summary" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const { useProposals } = await import("/src/services/proposal-runtime.ts");
    const original = useProposals.getState;
    (window as any).__defaultReads = 0;
    useProposals.getState = () => {
      if (new Error().stack?.includes("defaultExcerptLimit"))
        (window as any).__defaultReads++;
      return original();
    };
  });
  await page.getByRole("button", { name: "Summon familiar again" }).click();
  await expect(page.getByLabel("Summary length for this run")).toHaveValue("standard");
  expect(await page.evaluate(() => (window as any).__defaultReads)).toBe(0);
  await page.getByLabel("Execution mode", { exact: true }).selectOption("local");
  await expect(page.getByLabel("Excerpt length for this run")).toHaveValue("8");
  expect(
    await page.evaluate(() => (window as any).__defaultReads),
  ).toBeGreaterThan(0);
});
