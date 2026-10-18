import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "./offline-app";
import { editDocument } from "./document-editor";

async function settings(page: Page) {
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  return page.getByRole("dialog", { name: "Grimoire", exact: true });
}

test("notebook export keeps saved evidence separate from document and Canvas drafts", async ({ page }, testInfo) => {
  await page.goto("/");
  const editor = await editDocument(page);
  const savedText = await editor.inputValue();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "materials") {
        IDBObjectStore.prototype.put = put;
        throw new Error("Offline test: document save unavailable");
      }
      return put.apply(this, args);
    };
  });
  await editor.fill("Keep this unsaved document 😀");
  await expect(page.getByTestId("save-proposal")).toHaveText("failed");
  await page.getByRole("button", { name: "Open Canvas board", exact: true }).click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title", { exact: true }).fill("Unfinished note");
  await page.getByLabel("Note text", { exact: true }).fill("Keep the draft without inventing a saved version.");
  const book = await settings(page);
  await book.getByRole("checkbox", { name: "Idle antics", exact: true }).uncheck();
  await expect(book.getByText("Settings saved", { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await book.getByRole("button", { name: "Export notebook", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^wisp-notebook-\d{4}-\d{2}-\d{2}\.json$/);
  const notebook = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(notebook.stores.materials.find((entry: { key: string }) => entry.key === "proposal").value.text).toBe(savedText);
  expect(notebook.sessionDrafts.materials).toEqual(expect.arrayContaining([
    expect.objectContaining({ saveStatus: "failed", material: expect.objectContaining({ id: "proposal", text: "Keep this unsaved document 😀" }) }),
  ]));
  expect(notebook.stores.canvasNotes).toEqual([]);
  expect(notebook.sessionDrafts.canvasNote).toMatchObject({ title: "Unfinished note", text: "Keep the draft without inventing a saved version." });
  expect(notebook.sessionDrafts.canvasNote.original).toBeUndefined();
  expect(notebook.sessionPreferences).toMatchObject({ settings: { idleAntics: false }, tourSeen: true });
  await expect(book.getByRole("checkbox", { name: "Show the witch", exact: true })).toBeChecked();
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("notebook-settings.png") });
  await book.getByRole("button", { name: "Close Grimoire", exact: true }).click();
  await expect(page.getByLabel("Note text", { exact: true })).toHaveValue("Keep the draft without inventing a saved version.");
});

test("Idle antics persists independently from witch visibility", async ({ page }) => {
  await page.goto("/");
  const book = await settings(page);
  await book.getByRole("checkbox", { name: "Idle antics", exact: true }).uncheck();
  await expect(book.getByText("Settings saved", { exact: true })).toBeVisible();
  await book.getByRole("button", { name: "Close Grimoire", exact: true }).click();
  await page.reload();
  const reopened = await settings(page);
  await expect(reopened.getByRole("checkbox", { name: "Idle antics", exact: true })).not.toBeChecked();
  await expect(reopened.getByRole("checkbox", { name: "Show the witch", exact: true })).toBeChecked();
});

test("reset requires confirmation and closes storage in the other isolated Wisp tab", async ({ page, context }, testInfo) => {
  await page.goto("/");
  const editor = await editDocument(page);
  const seed = await editor.inputValue();
  await editor.fill("A saved custom version for this isolated reset test.");
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByLabel("Bookstore event proposal reading view", { exact: true })).toContainText("A saved custom version");
  const book = await settings(page);
  await book.getByRole("button", { name: "Reset demo desktop", exact: true }).click();
  const confirm = book.getByRole("group", { name: "Confirm workspace reset", exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Keep my session", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await book.getByRole("button", { name: "Close Grimoire", exact: true }).click();
  await expect(editor).toHaveValue("A saved custom version for this isolated reset test.");
  await settings(page);
  await book.getByRole("button", { name: "Reset demo desktop", exact: true }).click();
  await expect(confirm).toBeVisible();
  await confirm.scrollIntoViewIfNeeded();
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("reset-confirm.png") });
  await confirm.getByRole("button", { name: "Confirm reset", exact: true }).click();
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toHaveText(seed);
  await expect(other.locator("html")).toHaveAttribute("data-workspace-reset", "true");
  await expect(other.getByRole("alert")).toContainText("reset in another Wisp tab");
});
