import { editDocument } from "./document-editor";
import { test, expect, type Locator, type Page } from "./offline-app";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const chapters = ["Getting started", "Familiars", "About you", "Settings"];
const pageErrors = new WeakMap<Page, string[]>();
const unexpectedRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  pageErrors.set(page, errors);
  unexpectedRequests.set(page, requests);
  page.on("pageerror", (error) => errors.push(error.message));
  if (process.env.WISP_GRIMOIRE_DIST === "1") {
    const dist = fileURLToPath(new URL("../dist/", import.meta.url));
    await page.route("http://127.0.0.1:15351/**", async (route) => {
      const pathname = decodeURIComponent(
        new URL(route.request().url()).pathname,
      );
      const file = resolve(
        dist,
        pathname === "/" ? "index.html" : pathname.slice(1),
      );
      if (!file.startsWith(dist.endsWith(sep) ? dist : dist + sep)) {
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({ path: file });
    });
  }
  // This visual regression needs no API process, credentials or model call.
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/health") {
      await route.fulfill({
        json: {
          service: "wisp",
          jobs_enabled: false,
          model_connected: false,
          model_status: "unconfigured",
        },
      });
      return;
    }
    requests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view", { exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
  expect(unexpectedRequests.get(page)).toEqual([]);
});

async function openBook(page: Page) {
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  const book = page.getByRole("dialog", { name: "Grimoire", exact: true });
  await expect(book).toBeVisible();
  await settleBook(book);
  return book;
}

async function settleBook(book: Locator) {
  await book.evaluate(async (element) => {
    await document.fonts.ready;
    // The book unfolds from the pointer; layout assertions measure its resting pages.
    const opening = element
      .getAnimations({ subtree: true })
      .filter((animation) =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime),
      );
    await Promise.all(
      opening.map((animation) => animation.finished.catch(() => {})),
    );
  });
}

async function hasNoHorizontalOverflow(locator: Locator) {
  expect(
    await locator.evaluate(
      // Allow a subpixel difference between the CSS box and its rendered artwork.
      (element) =>
        element.scrollWidth + element.clientLeft <=
        element.getBoundingClientRect().width + 1,
    ),
  ).toBe(true);
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

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 800, height: 641 },
]) {
  test(`desktop book keeps both pages usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const book = await openBook(page);
    await expect(book.locator(".grimoire-art")).toBeVisible();
    expect(
      await book
        .locator(".grimoire-art")
        .evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
    ).toBe(true);
    const index = book.locator(".grimoire-index");
    const content = book.getByRole("region", {
      name: "Getting started",
      exact: true,
    });
    const left = (await index.boundingBox())!;
    const right = (await content.boundingBox())!;
    expect(left.x + left.width).toBeLessThanOrEqual(right.x + 1);
    expect(
      Math.min(left.y + left.height, right.y + right.height),
    ).toBeGreaterThan(Math.max(left.y, right.y));
    await fitsViewport(book, page);
    await hasNoHorizontalOverflow(book);
    expect(
      await index.evaluate(
        (element) => element.scrollHeight <= element.clientHeight + 1,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("desktop-book.png") });

    for (const chapter of chapters) {
      await book.getByRole("button", { name: chapter, exact: true }).click();
      await expect(
        book.getByRole("button", { name: chapter, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(book.locator("button[aria-pressed='true']")).toHaveCount(1);
      await expect(
        book.getByRole("region", { name: chapter, exact: true }),
      ).toBeVisible();
    }
    await expect(book.getByLabel("Reduce motion")).toBeVisible();
    await book.getByRole("button", { name: "About you", exact: true }).click();
    await expect(
      book.getByRole("heading", { name: "No preference recorded" }),
    ).toBeVisible();
    await book.getByRole("button", { name: "Familiars", exact: true }).click();
    await expect(book.getByText("No delegated tasks yet.")).toBeVisible();
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 800, height: 600 },
  { width: 900, height: 620 },
]) {
  test(`compact book keeps chapters and settings usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.keyboard.press("Alt+KeyM");
    const book = page.getByRole("dialog", { name: "Grimoire", exact: true });
    await expect(book).toBeVisible();
    await settleBook(book);
    const index = (await book.locator(".grimoire-index").boundingBox())!;
    const content = (await book
      .getByRole("region", { name: "Getting started", exact: true })
      .boundingBox())!;
    expect(index.y + index.height).toBeLessThanOrEqual(content.y + 1);
    await fitsViewport(book, page);
    for (const chapter of chapters) {
      const button = book.getByRole("button", { name: chapter, exact: true });
      await button.click();
      await fitsViewport(button, page);
      await hasNoHorizontalOverflow(book);
      await hasNoHorizontalOverflow(
        book.getByRole("region", { name: chapter, exact: true }),
      );
    }
    const proposals = book.getByRole("checkbox", {
      name: "Helpful proposals (local suggestions)",
      exact: true,
    });
    await proposals.scrollIntoViewIfNeeded();
    await fitsViewport(proposals, page);
    await page.screenshot({ path: testInfo.outputPath("narrow-settings.png") });
    for (const name of ["Export notebook", "Reset demo desktop"]) {
      const action = book.getByRole("button", { name, exact: true });
      await action.scrollIntoViewIfNeeded();
      await fitsViewport(action, page);
      await expect(action).toBeEnabled();
    }
    await book.getByRole("button", { name: "Reset demo desktop", exact: true }).click();
    const reset = book.getByRole("group", { name: "Confirm workspace reset" });
    await expect(reset).toBeVisible();
    const keep = reset.getByRole("button", { name: "Keep my session", exact: true });
    await keep.scrollIntoViewIfNeeded();
    await fitsViewport(keep, page);
    await hasNoHorizontalOverflow(book);
    await hasNoHorizontalOverflow(book.getByRole("region", { name: "Settings", exact: true }));
    await page.screenshot({ path: testInfo.outputPath("narrow-settings-actions.png") });
    await keep.click();
    await expect(reset).toHaveCount(0);
    await book.getByLabel("Close Grimoire", { exact: true }).click();
    await expect(book).not.toBeVisible();
  });
}

test("keyboard focus stays in the book and Escape returns to the opening control", async ({
  page,
}) => {
  const opener = page.getByRole("button", { name: "Grimoire", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const book = page.getByRole("dialog", { name: "Grimoire", exact: true });
  await expect(book).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    book.getByLabel("Close Grimoire", { exact: true }),
  ).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await book.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await book.getByRole("button", { name: "Settings", exact: true }).focus();
  await page.keyboard.press("Enter");
  await book.getByLabel("Close Grimoire", { exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await book.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await expect(
    book.getByLabel("Close Grimoire", { exact: true }),
  ).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(book).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test("settings on the paper page still save and survive a reload", async ({
  page,
}) => {
  let book = await openBook(page);
  await book.getByRole("button", { name: "Settings", exact: true }).click();
  await book.getByLabel("Show the witch", { exact: true }).uncheck();
  await book.getByLabel("Reduce motion", { exact: true }).check();
  await book
    .getByRole("combobox", { name: "Idle rhythm", exact: true })
    .selectOption("lively");
  await expect(book.getByRole("status")).toHaveText("Settings saved");
  await page.reload();
  book = await openBook(page);
  await book.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    book.getByLabel("Show the witch", { exact: true }),
  ).not.toBeChecked();
  await expect(book.getByLabel("Reduce motion", { exact: true })).toBeChecked();
  await expect(
    book.getByRole("combobox", { name: "Idle rhythm", exact: true }),
  ).toHaveValue("lively");
});

for (const viewport of [
  { width: 1200, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`long local reply scrolls inside the page and its final actions remain usable at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const text = Array.from(
      { length: 8 },
      (_, i) =>
        `材料第 ${i + 1} 行：${"可核对的原文内容与需要保留的上下文。".repeat(12)}${"long-source-token-".repeat(8)}`,
    ).join("\n");
    await page
      .getByRole("button", {
        name: "Open Bookstore event proposal",
        exact: true,
      })
      .click();
    await (await editDocument(page, "Bookstore event proposal")).fill(text);
    await expect(page.getByTestId("save-proposal")).toHaveText("saved");
    await page
      .getByRole("button", { name: "Open core abilities", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
    await page
      .getByRole("button", { name: "Page Sprite", exact: false })
      .click();
    await expect(
      page.getByLabel("Execution mode", { exact: true }),
    ).toHaveValue("local");
    await page
      .getByRole("button", { name: "Summon familiar", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Familiar task status" }),
    ).toContainText("1 unread");
    const book = await openBook(page);
    await book.getByRole("button", { name: "Familiars", exact: true }).click();
    await book.getByRole("button", { name: "View reply", exact: true }).click();
    await expect(
      book.getByRole("heading", { name: "Source excerpt", exact: true }),
    ).toBeVisible();
    await page.setViewportSize(viewport);
    const content = book.getByRole("region", {
      name: "Familiars",
      exact: true,
    });
    const indexBefore = (await book.locator(".grimoire-index").boundingBox())!;
    expect(
      await content.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    await content.hover({ position: { x: 30, y: 30 } });
    await page.mouse.wheel(0, 4000);
    await expect
      .poll(() => content.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    const closeResult = book.getByRole("button", {
      name: "Close result",
      exact: true,
    });
    await closeResult.scrollIntoViewIfNeeded();
    await fitsViewport(closeResult, page);
    await fitsViewport(book, page);
    await hasNoHorizontalOverflow(book);
    await hasNoHorizontalOverflow(content);
    const indexAfter = (await book.locator(".grimoire-index").boundingBox())!;
    expect(Math.abs(indexBefore.y - indexAfter.y)).toBeLessThan(1);
    await page.screenshot({
      path: testInfo.outputPath("long-reply-actions.png"),
    });
    await closeResult.click();
    await expect(book.getByTestId("task-card")).toHaveCount(1);
    await book
      .getByRole("button", { name: "Archive record", exact: true })
      .click();
    await expect(book.getByTestId("task-card")).toContainText("Archived");
  });
}
