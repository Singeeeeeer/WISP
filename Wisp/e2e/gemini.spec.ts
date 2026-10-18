import { editDocument } from "./document-editor";
import { test, expect, type Page } from "./offline-app";
const reply = (body: any) => ({
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
  missingInformation: ["请补充报名渠道"],
  metadata: {
    modelId: "mock-gemini",
    promptVersion: "check-1",
    validatorVersion: "evidence-1",
    durationMs: 10,
    usage: {
      total_input_tokens: 550,
      total_output_tokens: 315,
      total_tokens: 865,
      total_cached_tokens: 0,
      total_tool_use_tokens: 0,
      total_thought_tokens: 0,
    },
  },
});
async function open(page: Page, entry = "Check") {
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: entry, exact: true }).click();
  if (entry === "Summon")
    await page.getByRole("button", { name: "Scout Bat", exact: false }).click();
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
}
test("Gemini direct Check retries save only and persists the frozen selection with real-mode labels", async ({
  page,
}) => {
  let count = 0;
  let sent: any;
  await page.route("**/api/check", async (route) => {
    count++;
    sent = route.request().postDataJSON();
    await route.fulfill({ json: reply(sent) });
  });
  await page.goto("/");
  const editor = (await editDocument(page, "Bookstore event proposal"));
  await editor.fill("只发送这句。私有未选中内容");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await editor.press("Control+Home");
  for (let i = 0; i < 6; i++) await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = add;
        throw Error("模拟落盘失败");
      }
      return add.apply(this, args);
    };
  });
  await page.getByLabel("Additional instruction", { exact: true }).fill("核对安排");
  await page
    .getByRole("button", { name: "Run Gemini Check", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("模拟落盘失败");
  expect(count).toBe(1);
  expect(sent.snapshot.text).toBe("只发送这句。");
  await expect(page.getByLabel("Additional instruction", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving result", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Gemini: more information needed" }),
  ).toBeVisible();
  expect(count).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page.getByRole("button", { name: "View check result" }).click();
  await page.getByText("Execution details", { exact: true }).click();
  await expect(page.getByText("mock-gemini", { exact: false })).toBeVisible();
  await expect(page.getByTestId("check-source")).not.toContainText(
    "私有未选中内容",
  );
});
test("Scout Gemini returns unread reply and switching familiars defaults to local", async ({
  page,
}) => {
  await page.route("**/api/check", (route) =>
    route.fulfill({ json: reply(route.request().postDataJSON()) }),
  );
  await page.goto("/");
  await open(page, "Summon");
  await page.getByRole("button", { name: "Page Sprite", exact: false }).click();
  await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
    "local",
  );
  await page.getByRole("button", { name: "Scout Bat", exact: false }).click();
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("1 unread");
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await page.getByRole("button", { name: "View reply" }).click();
  await expect(
    page.getByRole("heading", { name: "Gemini: more information needed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delegate current full text again" }).click();
  await expect(page.getByLabel("Execution mode", { exact: true })).toHaveValue(
    "gemini",
  );
});
test("Scout Gemini cancellation rejects a late reply and reload interrupts without resubmission", async ({
  page,
}) => {
  let release: () => void = () => {};
  let calls = 0;
  await page.route("**/api/check", async (route) => {
    calls++;
    await new Promise<void>((resolve) => (release = resolve));
    await route
      .fulfill({ json: reply(route.request().postDataJSON()) })
      .catch(() => {});
  });
  await page.goto("/");
  await open(page, "Summon");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "View familiar tasks" }).click();
  await page.getByRole("button", { name: "Recall task" }).click();
  release();
  await expect(page.getByTestId("task-card")).toContainText("Cancelled");
  await expect(page.getByRole("button", { name: "View reply" })).toHaveCount(0);
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
});

test("Gemini Check does not offer Watch while the existing local Check still does", async ({
  page,
}) => {
  await page.route("**/api/check", (route) =>
    route.fulfill({ json: reply(route.request().postDataJSON()) }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: /Helpful proposals/ }).check();
  await expect(page.getByText("Settings saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Grimoire" }).click();
  await open(page);
  await page
    .getByRole("button", { name: "Run Gemini Check", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gemini: more information needed" }),
  ).toBeVisible();
  await page.getByText("Execution details", { exact: true }).click();
  await expect(
    page.locator("details").filter({ hasText: "Provider-reported usage" }),
  ).toBeVisible();
  expect(
    await page
      .locator("details")
      .filter({ hasText: "Provider-reported usage" })
      .evaluate((el) =>
        Array.from(el.querySelectorAll("p")).every(
          (p) => p.scrollWidth <= p.clientWidth,
        ),
      ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/english/gemini-check-mocked.png" });
  await page.getByRole("button", { name: "Close check result" }).click();
  await expect(page.getByRole("button", { name: "View watch scope" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check", exact: true }).click();
  await page.getByLabel("Execution mode", { exact: true }).selectOption("local");
  await page.getByRole("button", { name: "Run local check" }).click();
  await page.getByRole("button", { name: "Close check result" }).click();
  await expect(
    page.getByRole("button", { name: "View watch scope" }),
  ).toBeVisible();
});
