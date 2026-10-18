import { test, expect, type Page } from "@playwright/test";

async function open(page: Page, entry: string) {
  await page.getByRole("button", { name: "打开基础能力" }).click();
  await page.getByRole("menuitem", { name: entry, exact: true }).click();
}
test("Understand and Create expose explicit Gemini mode and default to local", async ({
  page,
}) => {
  await page.goto("/");
  for (const entry of ["Understand", "Create"]) {
    await open(page, entry);
    await expect(page.getByLabel("执行方式", { exact: true })).toHaveValue(
      "local",
    );
    await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
    await expect(
      page.getByRole("button", {
        name: entry === "Understand" ? "运行 Gemini 理解" : "运行 Gemini 创作",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("关闭材料面板", { exact: true }).click();
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
  await page.getByLabel("本次摘录长度").selectOption("3");
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
  await expect(page.getByLabel("本次摘要长度")).toHaveValue("standard");
  await page.getByLabel("本次摘要长度").selectOption("brief");
  await page.getByLabel("执行方式", { exact: true }).selectOption("local");
  await expect(page.getByLabel("本次摘录长度")).toHaveValue("3");
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
  await expect(page.getByLabel("本次摘要长度")).toHaveValue("brief");
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
  const editor = page.getByLabel("书店活动提案正文");
  await editor.fill("只发送这句。私有未选中内容");
  await expect(page.getByTestId("save-proposal")).toHaveText("已保存");
  await editor.press("Control+Home");
  for (let i = 0; i < 6; i++) await editor.press("Shift+ArrowRight");
  await open(page, "Understand");
  await localExcerpt(page);
  await page.getByLabel("本次摘要长度").selectOption("brief");
  await page.getByLabel("补充要求", { exact: true }).fill("概括本次选区");
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
    .getByRole("button", { name: "运行 Gemini 理解", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("模拟文本落盘失败");
  await expect(page.getByLabel("本次摘要长度")).toBeDisabled();
  await expect(page.getByLabel("执行方式", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("补充要求", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "重试保存结果", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Gemini：材料摘要" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/gemini-understand-mocked-20261018.png",
  });
  expect(calls).toBe(1);
  expect(sent.snapshot.text).toBe("只发送这句。");
  expect(sent.summaryStyle).toBe("brief");
  expect(sent).not.toHaveProperty("excerptLimit");
  await clipboard(page);
  await page.getByRole("button", { name: "复制结果", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copied))
    .toContain("原文依据 [0,6)：只发送这句。");
  await page.getByRole("button", { name: "继续召唤使魔" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText("只发送这句。");
  await expect(
    page.getByRole("button", { name: /Page Sprite/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("本次摘要长度")).toHaveValue("brief");
  await page.getByLabel("关闭材料面板", { exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await page
    .getByRole("button", { name: "查看Understand结果", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini：材料摘要" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新处理当前全文" }).click();
  await expect(page.getByLabel("本次摘要长度")).toHaveValue("brief");
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
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
  await page
    .getByRole("button", { name: "运行 Gemini 创作", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini：创作草稿" }),
  ).toBeVisible();
  await expect(page.getByTestId("gemini-draft")).toHaveText(draftText);
  await expect(page.getByTestId("gemini-draft").locator("script")).toHaveCount(
    0,
  );
  await page.screenshot({
    path: "docs/screenshots/gemini-create-mocked-20261018.png",
  });
  expect(sent).not.toHaveProperty("summaryStyle");
  expect(sent).not.toHaveProperty("excerptLimit");
  await clipboard(page);
  await page.getByRole("button", { name: "复制结果", exact: true }).click();
  for (const text of [
    "AI草稿（待人工确认）",
    "备选方向",
    "采用的原文依据",
    "创作假设",
    "待补充信息",
    "mock-gemini-text",
    "提示词",
  ]) {
    await expect
      .poll(() => page.evaluate(() => (window as any).__copied))
      .toContain(text);
  }
  await page.getByRole("button", { name: "仅复制草稿", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__copied))
    .toBe(draftText);
  await page.getByRole("button", { name: "继续召唤使魔" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(
    sent.snapshot.text,
  );
  await expect(
    page.getByRole("button", { name: /Alchemy Imp/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("执行方式", { exact: true })).toHaveValue(
    "gemini",
  );
  await page.getByLabel("关闭材料面板", { exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "处理记录", exact: true }).click();
  await page
    .getByRole("button", { name: "查看Create结果", exact: true })
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
      await expect(page.getByLabel("执行方式", { exact: true })).toHaveValue(
        "local",
      );
      if (operation === "understand") await localExcerpt(page);
      else
        await page
          .getByLabel("执行方式", { exact: true })
          .selectOption("gemini");
      if (operation === "understand")
        await page.getByLabel("本次摘要长度").selectOption("brief");
      await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
      await expect(
        page.getByRole("complementary", { name: "使魔任务状态" }),
      ).toContainText("1 封未读");
      expect(sent).not.toHaveProperty("excerptLimit");
      await page.getByRole("button", { name: "查看使魔任务" }).click();
      await page.getByRole("button", { name: "查看回信" }).click();
      await expect(
        page.getByRole("heading", {
          name:
            operation === "understand"
              ? "Gemini：材料摘要"
              : "Gemini：创作草稿",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("complementary", { name: "使魔任务状态" }),
      ).toContainText("0 封未读");
      await page.getByRole("button", { name: "重新委托当前全文" }).click();
      await expect(page.getByLabel("执行方式", { exact: true })).toHaveValue(
        "gemini",
      );
      if (operation === "understand")
        await expect(page.getByLabel("本次摘要长度")).toHaveValue("brief");
      await page.getByRole("button", { name: /Scout Bat/ }).click();
      await expect(page.getByLabel("执行方式", { exact: true })).toHaveValue(
        "local",
      );
      await expect(page.getByLabel("本次摘要长度")).toHaveCount(0);
      await page.getByRole("button", { name: /Page Sprite/ }).click();
      await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
      await expect(page.getByLabel("本次摘要长度")).toHaveValue("standard");
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
      await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
      await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
      await expect.poll(() => calls).toBe(1);
      await page.getByRole("button", { name: "查看使魔任务" }).click();
      await page.getByRole("button", { name: "召回任务" }).click();
      release();
      await expect(page.getByTestId("task-card")).toContainText("已召回");
      await expect(page.getByRole("button", { name: "查看回信" })).toHaveCount(
        0,
      );
      await page.getByRole("button", { name: "重新委托当前全文" }).click();
      await page.getByRole("button", { name: "召唤使魔", exact: true }).click();
      await expect.poll(() => calls).toBe(2);
      await page.reload();
      release();
      await page.getByRole("button", { name: "查看使魔任务" }).click();
      await expect(
        page.getByTestId("task-card").filter({ hasText: "已中断" }),
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
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).check();
  await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭魔法书" }).click();
  for (const entry of ["Understand", "Understand", "Understand", "Create"]) {
    await open(page, entry);
    await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
    if (entry === "Understand")
      await page.getByLabel("本次摘要长度").selectOption("brief");
    await page
      .getByRole("button", {
        name: entry === "Understand" ? "运行 Gemini 理解" : "运行 Gemini 创作",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "关闭处理结果", exact: true })
      .click();
  }
  await expect(page.getByRole("button", { name: "查看关注范围" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("complementary", { name: "主动提议", exact: true }),
  ).toHaveCount(0);
  await open(page, "Understand");
  await expect(page.getByLabel("执行方式", { exact: true })).toHaveValue(
    "local",
  );
  await expect(page.getByLabel("本次摘录长度")).toHaveValue("8");
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
  await expect(page.getByLabel("本次摘要长度")).toHaveValue("standard");
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
      await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
      await page
        .getByRole("button", {
          name:
            operation === "understand"
              ? "运行 Gemini 理解"
              : "运行 Gemini 创作",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: "Gemini：需要补充信息" }),
      ).toBeVisible();
      await expect(
        page.getByText("请确认活动日期", { exact: true }),
      ).toBeVisible();
      if (operation === "create")
        await expect(
          page.getByRole("button", { name: "仅复制草稿", exact: true }),
        ).toBeDisabled();
      else
        await expect(
          page.getByText("材料不足，尚未生成摘要。", { exact: true }),
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
  await page.getByLabel("执行方式", { exact: true }).selectOption("gemini");
  await page
    .getByRole("button", { name: "运行 Gemini 理解", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini：材料摘要" }),
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
  await page.getByRole("button", { name: "继续召唤使魔" }).click();
  await expect(page.getByLabel("本次摘要长度")).toHaveValue("standard");
  expect(await page.evaluate(() => (window as any).__defaultReads)).toBe(0);
  await page.getByLabel("执行方式", { exact: true }).selectOption("local");
  await expect(page.getByLabel("本次摘录长度")).toHaveValue("8");
  expect(
    await page.evaluate(() => (window as any).__defaultReads),
  ).toBeGreaterThan(0);
});
