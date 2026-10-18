import { test, expect } from "@playwright/test";
test("Understand and Create share persistence, preserve source, and copy labelled output", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const editor = page.getByLabel("Bookstore event proposal text");
  const source =
    "Topic: 😀 Night reading\nTime: Saturday evening\nLocation: Bookstore\nHow to join: Reservation\n第五行\n第六行\n第七行\n第八行\n未摘录的第九行";
  await editor.fill(source);
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Understand" }).click();
  await page.getByRole("button", { name: "Organize source excerpts" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Source excerpt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Non-empty lines not shown: 1.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/english/local-understand.png" });
  await page.getByRole("button", { name: "Close result" }).click();
  await expect(editor).toHaveValue(source);
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Create" }).click();
  await page.getByRole("button", { name: "Create template draft" }).click();
  await expect(page.getByTestId("template-draft")).toContainText(
    "Topic: 😀 Night reading",
  );
  await expect(page.getByTestId("template-draft")).toContainText(
    "Introduction: [To be added",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).copied = text;
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy result" }).click();
  await expect(page.getByText("Result copied")).toBeVisible();
  expect(await page.evaluate(() => (window as any).copied)).toContain(
    "Local template draft",
  );
  await page.screenshot({ path: "test-results/english/local-create.png" });
  await page.getByRole("button", { name: "Close result" }).click();
  await expect(editor).toHaveValue(source);
  await page.reload();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View Understand result" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "View Create result" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Close run history" }).click();
  await editor.fill("Topic: New version");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page.getByRole("button", { name: "View Create result" }).click();
  await expect(
    page.getByText("The source has changed or is unavailable. This result uses an older version and does not represent the current material."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Process current full text again" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText("Topic: New version");
  await page.getByRole("button", { name: "Create template draft" }).click();
  await expect(page.getByTestId("template-draft")).toContainText(
    "Location: [To be added]",
  );
  expect(errors).toEqual([]);
});

test("Create only uses selected text and handles failed save with a retry", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByLabel("Bookstore event proposal text");
  await editor.fill("Topic: Selected topic\nLocation: Private address not to copy");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await editor.press("Control+Home");
  for (let i = 0; i < "Topic: Selected topic".length; i++)
    await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Create" }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText("Topic: Selected topic");
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟写入失败");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Create template draft" }).click();
  await expect(page.getByRole("alert")).toContainText("模拟写入失败");
  await expect(page.getByTestId("template-draft")).toHaveCount(0);
  await page.getByRole("button", { name: "Create template draft" }).click();
  await expect(page.getByTestId("template-draft")).not.toContainText(
    "Private address",
  );
  await expect(page.getByTestId("template-draft")).toContainText(
    "Location: [To be added]",
  );
});
