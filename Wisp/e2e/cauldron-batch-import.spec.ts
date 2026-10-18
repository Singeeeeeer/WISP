import { test, expect, type Page } from "./offline-app";
import { readFile } from "node:fs/promises";

const txt = (name: string, text: string) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(text),
});
const cauldron = (page: Page) =>
  page.getByRole("dialog", { name: "Inspiration Cauldron", exact: true });
async function start(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Inspiration Cauldron", exact: true })
    .click();
  const panel = cauldron(page);
  await panel.getByRole("button", { name: "Import file", exact: true }).click();
  return panel;
}
async function imported(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("wisp-module-one");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const values = await new Promise<
        Array<{ title: string; text: string; source: string }>
      >((resolve, reject) => {
        const request = db
          .transaction("materials")
          .objectStore("materials")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return values.filter((item) => item.source.endsWith("_file"));
    } finally {
      db.close();
    }
  });
}
async function drop(page: Page, files: Array<{ name: string; text: string }>) {
  await page.evaluate((files) => {
    const dataTransfer = new DataTransfer();
    for (const item of files)
      dataTransfer.items.add(new File([item.text], item.name));
    document.body.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }),
    );
  }, files);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname !== "/api/health")
      throw new Error("Unexpected API request: " + pathname);
    await route.fulfill({
      json: {
        service: "wisp",
        jobs_enabled: false,
        model_connected: false,
        model_status: "unconfigured",
      },
    });
  });
});

test("files require individual confirmation, retain edits after save failure, and export a sourced Markdown result", async ({
  page,
}) => {
  const panel = await start(page);
  await panel
    .getByLabel("Choose file")
    .setInputFiles([
      txt("first.txt", "First frozen text."),
      txt("second.txt", "Second frozen text."),
    ]);
  await expect(panel).toContainText("File 1 of 2: first.txt");
  await expect(panel.getByTestId("import-preview")).toHaveValue(
    "First frozen text.",
  );
  await panel.getByTestId("import-preview").fill("First reviewed text.");
  await panel
    .getByRole("button", { name: "Close Inspiration Cauldron", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("not been added");
  expect(await imported(page)).toHaveLength(0);
  await panel
    .getByRole("button", { name: "Confirm addition", exact: true })
    .click();
  await expect(panel).toContainText("File 2 of 2: second.txt");
  await expect(panel.getByTestId("import-preview")).toHaveValue(
    "Second frozen text.",
  );
  expect(await imported(page)).toMatchObject([
    { title: "first.txt", text: "First reviewed text." },
  ]);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "cauldronEntries") {
        IDBObjectStore.prototype.add = original;
        throw new Error("Save temporarily unavailable");
      }
      return original.apply(this, args);
    };
  });
  await panel
    .getByRole("button", { name: "Confirm addition", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "Save temporarily unavailable",
  );
  await expect(panel).toContainText("File 2 of 2: second.txt");
  await expect(panel.getByTestId("import-preview")).toHaveValue(
    "Second frozen text.",
  );
  await panel
    .getByRole("button", { name: "Confirm addition", exact: true })
    .click();
  await expect(panel.getByTestId("material-detail")).toContainText(
    "second.txt",
  );
  expect(await imported(page)).toHaveLength(2);
  await panel.getByRole("button", { name: "Understand", exact: true }).click();
  await page
    .getByRole("button", { name: "Organize source excerpts", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save result as Markdown", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Wisp-understand-result.md");
  const content = await readFile((await file.path())!, "utf8");
  expect(content).toContain("# Wisp understand result");
  expect(content).toContain("Second frozen text.");
  expect(content).toContain("second.txt");
  expect(content).toContain("Version 1");
  expect(content).toContain("No AI used");
});

test("a failed file can retry while later dropped files remain queued", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/import-text?format=docx", async (route) => {
    reads++;
    await route.fulfill(
      reads === 1
        ? { status: 422, json: { error: { code: "IMPORT_FAILED" } } }
        : {
            json: {
              schemaVersion: "import-text-1",
              format: "docx",
              text: "Recovered document.",
              warnings: [],
            },
          },
    );
  });
  await page.goto("/");
  await page.getByLabel("Bookstore event proposal reading view").waitFor();
  const readyPanel = cauldron(page);
  await page
    .getByRole("button", { name: "Inspiration Cauldron", exact: true })
    .click();
  await expect(readyPanel).toContainText("0 / 12");
  await readyPanel
    .getByRole("button", { name: "Close Inspiration Cauldron", exact: true })
    .click();
  await drop(page, [
    { name: "retry.docx", text: "fixture" },
    { name: "waiting.txt", text: "Keep this file." },
  ]);
  const panel = cauldron(page);
  await expect(panel.getByRole("alert")).toContainText("Failed to read");
  await expect(panel).toContainText("1 files waiting");
  await panel
    .getByRole("button", { name: "Retry reading this file", exact: true })
    .click();
  await expect(panel.getByTestId("import-preview")).toHaveValue(
    "Recovered document.",
  );
  await panel
    .getByRole("button", { name: "Confirm addition", exact: true })
    .click();
  await expect(panel.getByTestId("import-preview")).toHaveValue(
    "Keep this file.",
  );
  await panel
    .getByRole("button", { name: "Skip this file", exact: true })
    .click();
  expect(reads).toBe(2);
  expect(await imported(page)).toMatchObject([
    { title: "retry.docx", text: "Recovered document." },
  ]);
  await expect(panel).toContainText("1 / 12");
});

test("stopping and skipping a slow file does not let its late response replace the next preview", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/import-text?format=pdf", async (route) => {
    await gate;
    await route
      .fulfill({
        json: {
          schemaVersion: "import-text-1",
          format: "pdf",
          text: "Late old result.",
          warnings: [],
        },
      })
      .catch(() => {});
  });
  const panel = await start(page);
  await panel
    .getByLabel("Choose file")
    .setInputFiles([
      txt("slow.pdf", "fixture"),
      txt("next.txt", "Next reviewed file."),
    ]);
  await expect(
    panel.getByRole("button", { name: "Stop reading", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Stop reading", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Skip this file", exact: true })
    .click();
  await expect(panel.getByTestId("import-preview")).toHaveValue(
    "Next reviewed file.",
  );
  release();
  await panel
    .getByRole("button", { name: "Confirm addition", exact: true })
    .click();
  await expect(panel.getByTestId("material-detail")).toContainText("next.txt");
  expect(await imported(page)).toMatchObject([
    { title: "next.txt", text: "Next reviewed file." },
  ]);
});

test("twelve files are retained for review and an oversized drop never silently truncates", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Bookstore event proposal reading view").waitFor();
  const readyPanel = cauldron(page);
  await page
    .getByRole("button", { name: "Inspiration Cauldron", exact: true })
    .click();
  await expect(readyPanel).toContainText("0 / 12");
  await readyPanel
    .getByRole("button", { name: "Close Inspiration Cauldron", exact: true })
    .click();
  const files = Array.from({ length: 13 }, (_, index) => ({
    name: `${index}.txt`,
    text: `File ${index}.`,
  }));
  await drop(page, files);
  await expect(page.locator(".cauldron-import-error")).toContainText(
    "up to 12 files",
  );
  await expect(cauldron(page)).toHaveCount(0);
  expect(await imported(page)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Close import notice", exact: true })
    .click();
  await drop(page, files.slice(0, 12));
  const panel = cauldron(page);
  await expect(panel).toContainText("File 1 of 12: 0.txt");
  await expect(panel).toContainText("11 files waiting");
  await drop(page, [{ name: "replacement.txt", text: "Do not replace." }]);
  await expect(page.locator(".cauldron-import-error")).toContainText(
    "preview is still open",
  );
  await expect(panel.getByTestId("import-preview")).toHaveValue("File 0.");
  await panel
    .getByRole("button", {
      name: "Discard all 12 remaining files",
      exact: true,
    })
    .click();
  await expect(panel).toContainText("0 / 12");
  expect(await imported(page)).toHaveLength(0);
});
