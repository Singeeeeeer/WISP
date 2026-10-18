import { test, expect, type Locator, type Page } from "@playwright/test";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const origin = "http://127.0.0.1:15361";
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const pageErrors = new WeakMap<Page, string[]>();
const unexpectedRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.includes("first visit"))
    await page.addInitScript(() =>
      localStorage.setItem("wisp-tour-seen", "true"),
    );
  const errors: string[] = [],
    requests: string[] = [];
  pageErrors.set(page, errors);
  unexpectedRequests.set(page, requests);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith("/api/")) {
      requests.push(route.request().url());
      await route.abort("blockedbyclient");
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(
      dist,
      pathname === "/" ? "index.html" : pathname.slice(1),
    );
    if (!file.startsWith(dist.endsWith(sep) ? dist : dist + sep)) {
      requests.push(route.request().url());
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({ path: file });
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
  expect(unexpectedRequests.get(page)).toEqual([]);
});

async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByLabel("Bookstore event proposal reading view", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".desktop-window")).toHaveCount(3);
}

async function fitsViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function persistedWindows(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("wisp-module-one");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<Array<Record<string, unknown>>>(
      (resolve, reject) => {
        const request = database
          .transaction("preferences")
          .objectStore("preferences")
          .get("windows");
        request.onsuccess = () => resolve(request.result ?? []);
        request.onerror = () => reject(request.error);
      },
    );
    database.close();
    return value;
  });
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1064, height: 956 },
]) {
  test(`prototype desktop stage and three windows at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await open(page);
    await expect(page.locator(".os-menubar")).toHaveCSS("height", "30px");
    await expect(page.locator(".desktop")).toHaveCSS(
      "background-color",
      "rgb(200, 212, 223)",
    );
    await expect(page.locator(".desktop-dock button")).toHaveCount(5);
    await expect(page.locator(".desktop-files button")).toHaveCount(4);
    await expect(
      page.getByRole("button", { name: "Inspiration Cauldron", exact: true }),
    ).toBeVisible();
    const pages = (await page.locator(".pages-window").boundingBox())!;
    const mail = (await page.locator(".mail-window").boundingBox())!;
    const sheet = (await page.locator(".sheets-window").boundingBox())!;
    expect(pages.x).toBeLessThan(mail.x);
    expect(pages.width).toBeGreaterThan(mail.width);
    expect(mail.y).toBeLessThan(sheet.y);
    expect(pages.height).toBeGreaterThan(sheet.height);
    for (const selector of [
      ".pages-window",
      ".mail-window",
      ".sheets-window",
      ".desktop-dock",
      ".furnace-anchor",
    ])
      await fitsViewport(page.locator(selector), page);
    const hint = (await page.locator(".demo-hint").boundingBox())!;
    for (const window of await page.locator(".desktop-window, .desktop-dock").all()) {
      const box = (await window.boundingBox())!;
      expect(
        hint.x >= box.x + box.width || hint.x + hint.width <= box.x ||
        hint.y >= box.y + box.height || hint.y + hint.height <= box.y,
      ).toBe(true);
    }
    await page.mouse.move(viewport.width - 20, viewport.height - 40);
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(
        `desktop-${viewport.width}x${viewport.height}.png`,
      ),
    });
  });
}

test("traffic lights preserve materials and Dock restores closed or minimized windows", async ({
  page,
}) => {
  await open(page);
  const pages = page.locator(".pages-window");
  const before = (await pages.boundingBox())!;
  await page
    .getByRole("button", {
      name: "Maximize Bookstore event proposal",
      exact: true,
    })
    .click();
  await expect(pages).toHaveClass(/maximized/);
  expect((await pages.boundingBox())!.width).toBeGreaterThan(before.width);
  await fitsViewport(pages, page);
  await page
    .getByRole("button", {
      name: "Restore Bookstore event proposal",
      exact: true,
    })
    .click();
  expect((await pages.boundingBox())!.width).toBe(before.width);
  await page
    .getByRole("button", { name: "Minimize Venue notes", exact: true })
    .click();
  await expect(page.locator(".mail-window")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Venue notes", exact: true })
    .click();
  await expect(page.locator(".mail-window")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Close Bookstore event proposal",
      exact: true,
    })
    .click();
  await expect(pages).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await persistedWindows(page)).find((w) => w.materialId === "proposal")
          ?.closed,
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Open Bookstore event proposal",
      exact: true,
    }),
  ).toBeVisible();
  await expect(pages).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Edit text of Bookstore event proposal",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Bookstore event proposal text", { exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByLabel("Bookstore event proposal text", { exact: true })
      .inputValue(),
  ).toContain("CNY 8,000");
});

test("Sheets edits survive reload and the same text enters local Understand", async ({
  page,
}, testInfo) => {
  await open(page);
  await page
    .getByRole("button", { name: "Open Event checklist", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Row 1 task", exact: true })
    .fill("Book the quiet room");
  await expect(page.getByTestId("save-wisp-demo-checklist")).toHaveText(
    "saved",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Open Event checklist", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Row 1 task", exact: true }),
  ).toHaveValue("Book the quiet room");
  await page
    .getByRole("button", { name: "Open core abilities", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Understand", exact: true }).click();
  await expect(page.getByTestId("snapshot-text")).toContainText(
    "Book the quiet room\tLin\tNov 6\tTo confirm",
  );
  await page
    .getByRole("button", { name: "Organize source excerpts", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Source excerpt", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".floating-panel")).toContainText(
    "Book the quiet room",
  );
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("sheets-understand.png"),
  });
  await page.getByRole("button", { name: "Close result", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Row 1 task", exact: true }),
  ).toHaveValue("Book the quiet room");
});

test("UI startup keeps existing user content and the saved window layout", async ({
  page,
}) => {
  await open(page);
  const layout = [
    {
      id: "window-proposal",
      materialId: "proposal",
      x: 175,
      y: 96,
      width: 510,
      height: 490,
      z: 88,
      minimized: false,
    },
  ];
  await page.evaluate(async (layout) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("wisp-module-one");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction(["materials", "preferences"], "readwrite");
    const materialRequest = tx.objectStore("materials").get("proposal");
    materialRequest.onsuccess = () =>
      tx.objectStore("materials").put({
        ...materialRequest.result,
        text: "Existing user words must stay byte-for-byte. 😀",
        version: materialRequest.result.version + 1,
      });
    tx.objectStore("preferences").put(layout, "windows");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, layout);
  await page.reload();
  await page
    .getByRole("button", {
      name: "Edit text of Bookstore event proposal",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Bookstore event proposal text", { exact: true }),
  ).toHaveValue("Existing user words must stay byte-for-byte. 😀");
  const box = (await page.locator(".pages-window").boundingBox())!;
  expect(box.x).toBe(175);
  expect(box.y).toBe(126);
  expect(box.width).toBe(510);
  expect(box.height).toBe(490);
  expect(await persistedWindows(page)).toEqual(layout);
});

test("Canvas still saves an added and edited note after the desktop redesign", async ({
  page,
}, testInfo) => {
  await open(page);
  await page
    .getByRole("button", { name: "Open Canvas board", exact: true })
    .click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title", { exact: true }).fill("Harbor light");
  await page
    .getByLabel("Note text", { exact: true })
    .fill("The lantern turns blue at low tide.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  const note = page.getByRole("article", {
    name: "Note Harbor light",
    exact: true,
  });
  await expect(note).toBeVisible();
  await note
    .getByRole("button", { name: "Edit text of Harbor light", exact: true })
    .click();
  await expect(note.getByLabel("Note text", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Canvas actions", { exact: true })).toBeHidden();
  await page
    .getByLabel("Note text", { exact: true })
    .fill("The lantern turns green at high tide.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(note).toContainText("The lantern turns green at high tide.");
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("canvas-edited.png"),
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Open Canvas board", exact: true })
    .click();
  await expect(note).toContainText("The lantern turns green at high tide.");
});

test("390px desktop keeps the main entries in bounds", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const selector of [
    ".os-menubar",
    ".pages-window",
    ".mail-window",
    ".sheets-window",
    ".desktop-dock",
    ".furnace-anchor",
  ])
    await fitsViewport(page.locator(selector), page);
  await page
    .getByRole("button", { name: "Show desktop files", exact: true })
    .click();
  await expect(page.locator(".desktop-window")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Desktop file Weekend event.docx",
      exact: true,
    })
    .click();
  await expect(page.locator(".pages-window")).toBeVisible();
  const document = (await page.locator(".pages-window").boundingBox())!;
  for (const selector of [".furnace-anchor", ".task-rail", ".desktop-dock"]) {
    await fitsViewport(page.locator(selector), page);
    const entry = (await page.locator(selector).boundingBox())!;
    expect(document.y + document.height).toBeLessThanOrEqual(entry.y);
  }
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("desktop-390.png"),
  });
  const resize = page.getByRole("button", { name: "Resize Bookstore event proposal", exact: true });
  await resize.press("ArrowRight");
  await expect.poll(async () => (await page.locator(".pages-window").boundingBox())!.height).toBe(document.height);
  await resize.press("Shift+ArrowUp");
  const beforeMove = (await page.locator(".pages-window").boundingBox())!;
  await page.getByLabel("Move Bookstore event proposal window", { exact: true }).press("ArrowDown");
  await expect.poll(async () => (await page.locator(".pages-window").boundingBox())!.y).toBe(beforeMove.y + 16);
  const moved = (await page.locator(".pages-window").boundingBox())!;
  expect(moved.y + moved.height).toBeLessThanOrEqual((await page.locator(".furnace-anchor").boundingBox())!.y);
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Grimoire", exact: true }),
  ).toBeVisible();
});

test("global panel entries cannot discard a cauldron paste draft or an unsaved Canvas note", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page
    .getByRole("button", { name: "Meet Wisp · walkthrough", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inspiration Cauldron", exact: true })
    .click();
  await page.getByRole("button", { name: "Paste text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pasted text", exact: true })
    .fill("Keep this unconfirmed paste draft.");
  await expect(
    page.getByRole("button", { name: "Try Summon", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Grimoire", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "File", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Open core abilities", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Open Canvas board", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Open Venue notes", exact: true })
    .click();
  await page
    .getByLabel("Venue notes reading view", { exact: true })
    .dispatchEvent("contextmenu", { button: 2 });
  await expect(
    page.getByRole("menu", { name: "Core abilities", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Pasted text", exact: true }),
  ).toHaveValue("Keep this unconfirmed paste draft.");
  await page
    .getByRole("button", { name: "Cancel new material", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close Inspiration Cauldron", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Canvas board", exact: true })
    .click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByLabel("Note text", { exact: true })
    .fill("Keep this unsaved idea.");
  await expect(
    page.getByRole("button", { name: "Show desktop files", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "File", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Inspiration Cauldron", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Grimoire", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close Grimoire", exact: true })
    .click();
  await expect(page.getByLabel("Note text", { exact: true })).toHaveValue(
    "Keep this unsaved idea.",
  );
});

test("reading layout retains every source character and selected sections freeze the exact range", async ({
  page,
}, testInfo) => {
  await open(page);
  const text =
    "Field notes 😀\n\n01 / First thought\nKeep the window quiet.\n\n02 / Next thought\nLet a lantern guide the way.";
  await page
    .getByRole("button", {
      name: "Edit text of Bookstore event proposal",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Bookstore event proposal text", { exact: true })
    .fill(text);
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  const reading = page.getByLabel("Bookstore event proposal reading view", {
    exact: true,
  });
  await expect(page.getByLabel("Bookstore event proposal text", { exact: true })).toHaveCount(0);
  await expect(reading).toHaveCSS("cursor", /wand-text\.svg/);
  expect(await reading.textContent()).toBe(text);
  await expect(reading.locator(".document-section-heading")).toHaveCount(2);
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("document-sections.png"),
  });
  const start = text.indexOf("window"),
    end = text.indexOf("guide") + "guide".length;
  await reading.evaluate(
    (root, { start, end }) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let offset = 0,
        began = false;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0;
        if (!began && start <= offset + length) {
          range.setStart(node, start - offset);
          began = true;
        }
        if (end <= offset + length) {
          range.setEnd(node, end - offset);
          break;
        }
        offset += length;
      }
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    },
    { start, end },
  );
  await reading.dispatchEvent("contextmenu", {
    button: 2,
    clientX: 420,
    clientY: 360,
  });
  await expect(
    page.getByRole("menu", { name: "Core abilities", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "Understand", exact: true })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.getByTestId("snapshot-text")).toHaveText(
    text.slice(start, end),
  );
});

test("first visit walkthrough persists dismissal and Help can reopen it", async ({
  page,
}, testInfo) => {
  await open(page);
  const tour = page.getByLabel("Demo walkthrough", { exact: true });
  await expect(tour).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("first-visit-tour.png"),
  });
  await page
    .getByRole("button", { name: "Just explore the desktop", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("wisp-tour-seen")),
  ).toBe("true");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Help", exact: true }),
  ).toBeVisible();
  await expect(tour).toHaveCount(0);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page
    .getByRole("button", { name: "Meet Wisp · walkthrough", exact: true })
    .click();
  await expect(tour).toBeVisible();
  await page.getByRole("button", { name: "Try Summon", exact: true }).click();
  await expect(tour).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Entrust one task to a familiar",
      exact: true,
    }),
  ).toBeVisible();
});

test("Edit menu selects the complete source from the reading view", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: /Select current document/ }).click();
  await page
    .getByRole("button", { name: "Open core abilities", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Understand", exact: true }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(
    "A little light for yourself this weekend\n\n01 / Event intent\nGive busy people time to stay in the bookstore. The event is scheduled to open on November 8, with a budget of CNY 8,000.\n\n02 / An unhurried experience\nTake a blank bookmark and write down one thing to let go of. Choose a book and sit by the window for a while.\n\n03 / Items to confirm\nThe poster is scheduled to be finalized on November 10, followed by registration opening. Venue, printing, and materials are quoted at CNY 6,500 in total.\n\nThis editable sample uses fictional information.",
  );
});

test("inline Canvas editing can be cancelled without changing the saved version", async ({
  page,
}, testInfo) => {
  await open(page);
  await page
    .getByRole("button", { name: "Open Canvas board", exact: true })
    .click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title", { exact: true }).fill("Moonlit tide");
  await page
    .getByLabel("Note text", { exact: true })
    .fill("An original thought.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  const note = page.getByRole("article", {
    name: "Note Moonlit tide",
    exact: true,
  });
  await note
    .getByRole("button", { name: "Edit text of Moonlit tide", exact: true })
    .click();
  await note
    .getByLabel("Note text", { exact: true })
    .fill("An unsaved thought.");
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("canvas-inline-edit.png"),
  });
  await note
    .getByRole("button", { name: "Cancel editing", exact: true })
    .click();
  await expect(note).toContainText("An original thought.");
  await expect(note).toContainText("Version 1");
  await page.reload();
  await page
    .getByRole("button", { name: "Open Canvas board", exact: true })
    .click();
  await expect(note).toContainText("An original thought.");
  await expect(note).toContainText("Version 1");
});
