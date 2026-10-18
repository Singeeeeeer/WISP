import { editDocument } from "./document-editor";
import { test, expect, type Locator, type Page } from "./offline-app";

type TextPoint = {
  x: number;
  y: number;
  height: number;
  protected?: { x: number; y: number; width: number; height: number }[];
};

// Independent canvas measurements for the ASCII fixture text. Browser keyboard
// navigation supplies soft-wrap boundaries, rather than application geometry.
async function editorPoint(
  editor: Locator,
  options: {
    offset?: number;
    lineStart?: number;
    lineEnd?: number;
    visualLine?: number;
  } = {},
): Promise<TextPoint> {
  return editor.evaluate((element: HTMLTextAreaElement, options) => {
    const offset =
      options.offset ??
      (element.selectionDirection === "backward"
        ? element.selectionStart
        : element.selectionEnd);
    const prefix = element.value.slice(0, offset);
    const start = options.lineStart ?? prefix.lastIndexOf("\n") + 1;
    const line = options.visualLine ?? prefix.split("\n").length - 1;
    const css = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    const text = element.value.slice(start, offset);
    const newline = element.value.indexOf("\n", start);
    const lineText = element.value.slice(
      start,
      options.lineEnd ?? (newline < 0 ? element.value.length : newline),
    );
    const spacing = parseFloat(css.letterSpacing) || 0;
    const height = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.2;
    const left =
      rect.left + parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft);
    const top =
      rect.top +
      parseFloat(css.borderTopWidth) +
      parseFloat(css.paddingTop) +
      line * height -
      element.scrollTop;
    return {
      x:
        left +
        context.measureText(text).width +
        text.length * spacing -
        element.scrollLeft,
      y: top + height / 2,
      height,
      protected: [
        {
          x: left,
          y: top,
          width: Math.min(
            context.measureText(lineText).width +
              lineText.length * spacing -
              element.scrollLeft,
            element.clientWidth -
              parseFloat(css.paddingLeft) -
              parseFloat(css.paddingRight),
          ),
          height,
        },
      ],
    };
  }, options);
}

async function wandTip(page: Page) {
  return page.locator(".companion-pose").evaluate((element: SVGSVGElement) => {
    const tip = element.createSVGPoint();
    // Visible light center in the original calibrated casting artwork.
    tip.x = 596;
    tip.y = 100;
    const screen = tip.matrixTransform(element.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
}

async function pointsAt(page: Page, target: TextPoint) {
  const companion = page.locator(".companion");
  await expect(companion).toHaveAttribute("data-state", "text-pointing");
  await expect(companion).toBeVisible();
  await expect(companion.locator(".companion-pose")).toHaveAttribute(
    "viewBox",
    "341.5 55 270 260",
  );
  const sprite = (await companion.locator(".companion-pose").boundingBox())!;
  await expect
    .poll(async () => {
      const tip = await wandTip(page);
      return Math.hypot(tip.x - target.x, tip.y - target.y);
    })
    .toBeLessThanOrEqual(sprite.height + 8);
  const viewport = page.viewportSize()!;
  expect(sprite.x).toBeGreaterThanOrEqual(-0.1);
  expect(sprite.y).toBeGreaterThanOrEqual(-0.1);
  expect(sprite.x + sprite.width).toBeLessThanOrEqual(viewport.width + 0.1);
  expect(sprite.y + sprite.height).toBeLessThanOrEqual(viewport.height + 0.1);
  // The actor must leave the active character/caret corridor unobscured.
  expect(
    sprite.x < target.x + 2 &&
      sprite.x + sprite.width > target.x - 2 &&
      sprite.y < target.y + target.height / 2 &&
      sprite.y + sprite.height > target.y - target.height / 2,
  ).toBe(false);
  for (const text of target.protected ?? [])
    expect(
      sprite.x < text.x + text.width &&
        sprite.x + sprite.width > text.x &&
        sprite.y < text.y + text.height &&
        sprite.y + sprite.height > text.y,
    ).toBe(false);
  await expect(companion).toHaveCSS("pointer-events", "none");
}

async function titleEditor(page: Page) {
  await page
    .getByRole("button", { name: "Open Venue notes", exact: true })
    .click();
  const editor = page.locator("#title-venue");
  await editor.fill("Witch beside the words");
  return editor;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Text companion test: API disabled" }),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(
    page.getByLabel("Bookstore event proposal reading view", { exact: true }),
  ).toBeVisible();
});

test("title caret follows real typing and keyboard movement independently of the mouse", async ({
  page,
}, testInfo) => {
  const editor = await titleEditor(page);
  await page.keyboard.press("Control+End");
  await pointsAt(page, await editorPoint(editor));
  const before = await wandTip(page);
  await page.mouse.move(1400, 950);
  await page.keyboard.insertText(" glow");
  await expect(editor).toHaveValue("Witch beside the words glow");
  await pointsAt(page, await editorPoint(editor));
  expect((await wandTip(page)).x).toBeGreaterThan(before.x + 20);
  await page.keyboard.press("Home");
  await pointsAt(page, await editorPoint(editor));
  expect((await wandTip(page)).x).toBeLessThan(before.x - 100);
  await page.screenshot({
    path: testInfo.outputPath("title-caret.png"),
    animations: "disabled",
  });
  await page.mouse.click(1370, 700);
  await expect(editor).not.toBeFocused();
  await page.mouse.move(1300, 700);
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "following",
  );
});

test("keyboard forward and reverse selections point at the active end", async ({
  page,
}, testInfo) => {
  const editor = await titleEditor(page);
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  expect(
    await editor.evaluate((el: HTMLTextAreaElement) => el.selectionDirection),
  ).toBe("forward");
  await pointsAt(page, await editorPoint(editor));
  const forward = await wandTip(page);
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  expect(
    await editor.evaluate((el: HTMLTextAreaElement) => el.selectionDirection),
  ).toBe("backward");
  await pointsAt(page, await editorPoint(editor));
  expect((await wandTip(page)).x).toBeLessThan(forward.x - 100);
  await page.screenshot({
    path: testInfo.outputPath("title-reverse-selection.png"),
    animations: "disabled",
  });
  await page.keyboard.insertText("Replacement");
  await expect(editor).toHaveValue("Replacement");
  await pointsAt(page, await editorPoint(editor));
});

test("mouse selections retain the active end after release in either direction", async ({
  page,
}) => {
  const editor = await titleEditor(page);
  const start = await editorPoint(editor, { offset: 2 });
  const end = await editorPoint(editor, { offset: 20 });
  for (const [from, to, direction] of [
    [start, end, "forward"],
    [
      await editorPoint(editor, { offset: 18 }),
      await editorPoint(editor, { offset: 4 }),
      "backward",
    ],
  ] as const) {
    // Collapse the previous range so the next press starts a new selection,
    // rather than the browser's native drag of already selected text.
    await editor.press("ArrowLeft");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await pointsAt(page, await editorPoint(editor));
    await page.mouse.up();
    expect(
      await editor.evaluate(
        (el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart,
      ),
    ).toBeGreaterThan(10);
    expect(
      await editor.evaluate((el: HTMLTextAreaElement) => el.selectionDirection),
    ).toBe(direction);
    await page.mouse.move(1400, 950);
    await pointsAt(page, await editorPoint(editor));
  }
});

test("body caret tracks new lines and internal scrolling", async ({
  page,
}, testInfo) => {
  const editor = await editDocument(page);
  await editor.fill(
    Array.from(
      { length: 40 },
      (_, i) => `Line ${String(i).padStart(2, "0")} short text`,
    ).join("\n"),
  );
  await page.keyboard.press("Control+Home");
  await pointsAt(page, await editorPoint(editor));
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("A new line");
  await pointsAt(page, await editorPoint(editor));
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
  await pointsAt(page, await editorPoint(editor));
  const before = await editorPoint(editor);
  const box = (await editor.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 38);
  await expect
    .poll(() => editor.evaluate((el: HTMLTextAreaElement) => el.scrollTop))
    .toBeGreaterThan(15);
  await pointsAt(page, await editorPoint(editor));
  expect((await editorPoint(editor)).y).toBeLessThan(before.y - 15);
  await page.keyboard.press("Control+End");
  await pointsAt(page, await editorPoint(editor));
  await expect
    .poll(() => editor.evaluate((el: HTMLTextAreaElement) => el.scrollTop))
    .toBeGreaterThan(300);
  await page.screenshot({
    path: testInfo.outputPath("body-scrolled-caret.png"),
    animations: "disabled",
  });
});

test("soft wrapped body uses the browser's visual line when moving the caret", async ({
  page,
}) => {
  const editor = await editDocument(page);
  await editor.fill("abcdefghij".repeat(35));
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("End");
  const firstEnd = await editor.evaluate(
    (el: HTMLTextAreaElement) => el.selectionEnd,
  );
  expect(firstEnd).toBeGreaterThan(10);
  expect(firstEnd).toBeLessThan(350);
  await pointsAt(
    page,
    await editorPoint(editor, {
      lineStart: 0,
      lineEnd: firstEnd,
      visualLine: 0,
    }),
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  const secondStart = await editor.evaluate(
    (el: HTMLTextAreaElement) => el.selectionEnd,
  );
  expect(secondStart).toBeGreaterThanOrEqual(firstEnd);
  await pointsAt(
    page,
    await editorPoint(editor, { lineStart: secondStart, visualLine: 1 }),
  );
});

async function readingCharacter(reading: Locator, offset: number) {
  return reading.evaluate((element, offset) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (offset < node.textContent!.length) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + 1, y: rect.y + rect.height / 2 };
      }
      offset -= node.textContent!.length;
    }
    throw new Error("Reading character is absent");
  }, offset);
}

async function readingFocus(page: Page): Promise<TextPoint> {
  return page.evaluate(() => {
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(selection.focusNode!, selection.focusOffset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y + rect.height / 2,
      height: rect.height,
      protected: Array.from(
        selection.getRangeAt(0).getClientRects(),
        (rect) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }),
      ),
    };
  });
}

test("DOM reading selections follow the focus end and remain indicated after mouseup", async ({
  page,
}, testInfo) => {
  const editor = await editDocument(page);
  await editor.fill("The quick brown fox keeps each idea beside the text.");
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  const reading = page.getByLabel("Bookstore event proposal reading view", {
    exact: true,
  });
  const start = await readingCharacter(reading, 2);
  const end = await readingCharacter(reading, 25);
  const reset = await readingCharacter(reading, 46);
  for (const [from, to] of [
    [start, end],
    [await readingCharacter(reading, 23), await readingCharacter(reading, 4)],
  ]) {
    await page.mouse.click(reset.x, reset.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    expect(
      await page.evaluate(() => document.getSelection()?.toString().length),
    ).toBeGreaterThan(10);
    await page.mouse.move(1400, 950);
    await pointsAt(page, await readingFocus(page));
  }
  await page.screenshot({
    path: testInfo.outputPath("reading-reverse-selection.png"),
    animations: "disabled",
  });
  await page.mouse.click(1380, 700);
  await page.mouse.move(1300, 700);
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "following",
  );
});

test("moving keyboard focus to a window titlebar does not revive its old reading selection", async ({
  page,
}) => {
  const editor = await editDocument(page);
  await editor.fill("The quick brown fox keeps each idea beside the text.");
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  const reading = page.getByLabel("Bookstore event proposal reading view", {
    exact: true,
  });
  const start = await readingCharacter(reading, 2);
  const end = await readingCharacter(reading, 25);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await pointsAt(page, await readingFocus(page));
  const selected = await page.evaluate(() =>
    document.getSelection()!.toString(),
  );
  expect(selected.length).toBeGreaterThan(10);
  await page.getByTestId("drag-proposal").focus();
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "text-pointing",
  );
  await page.mouse.move(1350, 700);
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "following",
  );
  expect(await page.evaluate(() => document.getSelection()!.toString())).toBe(
    selected,
  );
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "idle",
  );
});

test("Sheets cell typing and reverse selection keep pointing at the cell caret", async ({
  page,
}, testInfo) => {
  await page
    .getByRole("button", { name: "Open Event checklist", exact: true })
    .click();
  const cell = page.getByRole("textbox", { name: "Row 1 task", exact: true });
  await cell.fill("Book quiet room");
  await page.keyboard.press("End");
  await pointsAt(page, await editorPoint(cell));
  await page.keyboard.insertText(" now");
  await expect(cell).toHaveValue("Book quiet room now");
  await pointsAt(page, await editorPoint(cell));
  await page.keyboard.press("Shift+Home");
  await pointsAt(page, await editorPoint(cell));
  await page.screenshot({
    path: testInfo.outputPath("sheets-selection.png"),
    animations: "disabled",
  });
});

for (const source of ["application", "system"] as const) {
  test(`${source} reduced motion keeps text pointing static but updates on editing`, async ({
    page,
  }) => {
    if (source === "application") {
      await page.getByRole("button", { name: "Grimoire", exact: true }).click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByLabel("Reduce motion").check();
      await page.keyboard.press("Escape");
    } else await page.emulateMedia({ reducedMotion: "reduce" });
    const editor = await titleEditor(page);
    const companion = page.locator(".companion");
    await pointsAt(page, await editorPoint(editor));
    await expect(companion).toHaveClass("companion still");
    expect(
      await companion.evaluate(
        (el) => el.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    const before = await companion.boundingBox();
    await page.mouse.move(1400, 950);
    expect(await companion.boundingBox()).toEqual(before);
    await page.keyboard.press("Home");
    await pointsAt(page, await editorPoint(editor));
    expect(await companion.boundingBox()).not.toEqual(before);
  });
}

test("dragging a focused text window still yields and release resumes at its moved caret", async ({
  page,
}) => {
  const editor = await titleEditor(page);
  const window = editor.locator(
    "xpath=ancestor::section[contains(@class,'desktop-window')]",
  );
  const title = (await window.locator(".window-titlebar").boundingBox())!;
  await pointsAt(page, await editorPoint(editor));
  await page.mouse.move(title.x + 110, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + 200, title.y + title.height / 2 + 50, {
    steps: 8,
  });
  await expect(page.locator(".companion")).toHaveAttribute(
    "data-state",
    "yielding",
  );
  await page.mouse.up();
  await expect(editor).toBeFocused();
  await pointsAt(page, await editorPoint(editor));
});

test("window blur hides the text actor and focus restores the current caret", async ({
  page,
}) => {
  const editor = await titleEditor(page);
  await pointsAt(page, await editorPoint(editor));
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".companion")).toHaveCSS("visibility", "hidden");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await pointsAt(page, await editorPoint(editor));
  await expect(page.locator(".companion")).toHaveCSS("visibility", "visible");
});

test("near viewport edges the actor swaps sides and leaves the caret unobscured", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 640, height: 650 });
  const editor = await titleEditor(page);
  const window = editor.locator(
    "xpath=ancestor::section[contains(@class,'desktop-window')]",
  );
  const leftBar = (await window.locator(".window-titlebar").boundingBox())!;
  await page.mouse.move(leftBar.x + 110, leftBar.y + leftBar.height / 2);
  await page.mouse.down();
  await page.mouse.move(1, leftBar.y + leftBar.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("Home");
  await pointsAt(page, await editorPoint(editor));
  const left = await editorPoint(editor);
  let actor = (await page.locator(".companion-pose").boundingBox())!;
  expect(actor.x + actor.width / 2).toBeGreaterThan(left.x);
  const count = await editor.evaluate((el: HTMLTextAreaElement) => {
    const css = getComputedStyle(el);
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    return Math.floor(
      (el.clientWidth -
        parseFloat(css.paddingLeft) -
        parseFloat(css.paddingRight) -
        3) /
        context.measureText("M").width,
    );
  });
  await editor.fill("M".repeat(count));
  const bar = (await window.locator(".window-titlebar").boundingBox())!;
  await page.mouse.move(bar.x + 100, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(635, bar.y + bar.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("End");
  const right = await editorPoint(editor);
  await pointsAt(page, right);
  actor = (await page.locator(".companion-pose").boundingBox())!;
  expect(actor.x + actor.width / 2).toBeLessThan(right.x);
  await page.screenshot({
    path: testInfo.outputPath("edge-caret.png"),
    animations: "disabled",
  });
});
