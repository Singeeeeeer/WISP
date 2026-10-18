import { editDocument } from "./document-editor";
import { test, expect } from "./offline-app";
test("local Check persists exact evidence, detects stale source and recomputes on explicit confirmation", async ({
  page,
}) => {
  await page.goto("/");
  const editor = (await editDocument(page, "Bookstore event proposal"));
  await editor.fill(
    "😀 Event notes. The event is scheduled to open on November 8. The poster is scheduled to be finalized on November 10, followed by registration opening.",
  );
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await page.getByRole("button", { name: "Run local check" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "An arrangement needs review" }),
  ).toBeVisible();
  await expect(
    page.getByText("The poster is scheduled to be finalized on November 10, followed by registration opening", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Check result" }),
  ).toBeFocused();
  await page.screenshot({ path: "test-results/english/local-check-findings.png" });
  await page.getByRole("button", { name: "Close check result" }).click();
  await editor.fill("The event is scheduled to open on November 8. The poster is scheduled to be finalized on November 5, followed by registration opening.");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await page.reload();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await expect(page.getByRole("button", { name: "View check result" })).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "View check result" }).click();
  await expect(
    page.getByText("The source has changed or is unavailable. This result uses an older version and does not represent the current material."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check current full text again" }).click();
  await expect(page.getByTestId("snapshot-text")).toContainText("November 5");
  await page.getByRole("button", { name: "Run local check" }).click();
  await expect(
    page.getByRole("heading", { name: "Local rules found no reportable issue" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/english/local-check.png" });
});

test("selection only, empty input and failed persistence never claim success", async ({
  page,
}) => {
  await page.goto("/");
  const editor = (await editDocument(page, "Bookstore event proposal"));
  await editor.fill("The event is scheduled to open on November 8. The poster is scheduled to be finalized on November 10, followed by registration opening.");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await editor.press("Control+Home");
  for (let i = 0; i < "The event is scheduled to open on November 8.".length; i++)
    await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await page.getByRole("button", { name: "Run local check" }).click();
  await expect(
    page.getByRole("heading", { name: "This material is outside the local rules' scope" }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.getByRole("button", { name: "Copy result" }).click();
  await expect(
    page.getByText("Copy failed. Select and copy the result text manually."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close check result" }).click();
  await editor.fill("");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await page.getByRole("button", { name: "Run local check" }).click();
  await expect(page.getByRole("alert")).toContainText("Material is empty");
  await page.getByRole("button", { name: "Close material panel" }).click();
  await editor.fill("The event is scheduled to open on November 8. The poster is scheduled to be finalized on November 10, followed by registration opening.");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Check" }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "checks") {
        IDBObjectStore.prototype.add = original;
        throw new Error("模拟磁盘写入失败");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Run local check" }).click();
  await expect(page.getByRole("alert")).toContainText("模拟磁盘写入失败");
  await expect(
    page.getByRole("heading", { name: "An arrangement needs review" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Run local check" }).click();
  await expect(
    page.getByRole("heading", { name: "An arrangement needs review" }),
  ).toBeVisible();
});
