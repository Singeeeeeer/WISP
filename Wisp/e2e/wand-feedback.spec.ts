import {
  test,
  expect,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import type { MaterialSnapshot } from "../apps/web/src/domain/model";

async function cursor(target: Locator) {
  return target.evaluate((element) => getComputedStyle(element).cursor);
}

async function expectCursorResource(
  target: Locator,
  filename: string,
  hotspot: [number, number],
  fallback: string,
) {
  const value = await cursor(target);
  expect(value).toContain(filename);
  expect(value.match(/\)\s+(\d+)\s+(\d+),/)?.slice(1)).toEqual(
    hotspot.map(String),
  );
  expect(value.endsWith(`, ${fallback}`)).toBe(true);
  const resource = value.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
  expect(resource).toBeTruthy();
  expect(
    await target.evaluate(async (_element, src) => {
      const image = new Image();
      image.src = src!;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, resource),
  ).toEqual([24, 24]);
}

async function expectNoClickEffect(page: Page) {
  expect(
    await page
      .locator(".wand-click")
      .evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((entry) => entry.playState === "running").length,
      ),
  ).toBe(0);
}

async function delayedCheck(page: Page) {
  const requests: Route[] = [];
  await page.route("**/api/check", (route) => {
    requests.push(route);
  });
  return requests;
}

async function openGemini(page: Page, entry = "Check") {
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  await page.mouse.click(1100, 300, { button: "right" });
  await page.getByRole("menuitem", { name: entry, exact: true }).click();
  if (entry === "Summon")
    await page.getByRole("button", { name: /Scout Bat/ }).click();
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
}

async function success(route: Route) {
  const body = route.request().postDataJSON() as {
    snapshot: MaterialSnapshot;
    instruction: string;
  };
  await route.fulfill({
    json: {
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
      missingInformation: ["测试：请补充报名渠道"],
      metadata: {
        modelId: "mock-wand-feedback",
        promptVersion: "check-1",
        validatorVersion: "evidence-1",
        durationMs: 1,
      },
    },
  });
}

async function failure(route: Route) {
  await route.fulfill({
    status: 503,
    json: { error: { code: "MODEL_UNAVAILABLE" } },
  });
}

test.beforeEach(async ({ page }) => {
  // Every API request stays in the browser test; no local service or model is used.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Wand test: API disabled" }),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal text")).toBeVisible();
});

test("hover and pressed cursors share the hotspot and one valid click gives a brief fixed effect", async ({
  page,
}) => {
  const feedback = page.locator(".wand-feedback");
  const book = page.getByRole("button", { name: "Grimoire", exact: true });
  await page.mouse.move(1200, 700);
  await expect(feedback).toHaveAttribute("data-state", "none");
  const ordinary = await cursor(page.locator(".desktop"));
  expect(ordinary).toContain("wand-cursor.svg");
  await book.hover();
  await expect(feedback).toHaveAttribute("data-state", "hover");
  const hover = await cursor(book);
  expect(hover).toContain("wand-hover.svg");
  await page.mouse.down();
  await expect(feedback).toHaveAttribute("data-state", "pressed");
  const pressed = await cursor(book);
  expect(pressed).toContain("wand-pressed.svg");
  for (const value of [ordinary, hover, pressed])
    expect(value.match(/\)\s+(\d+)\s+(\d+),/)?.slice(1)).toEqual(["5", "1"]);
  await page.mouse.up();
  const flash = page.locator("svg.wand-click");
  const animation = await flash.evaluate((element) =>
    element.getAnimations().map((entry) => ({
      state: entry.playState,
      duration: entry.effect?.getTiming().duration,
    })),
  );
  expect(animation).toHaveLength(1);
  expect(animation[0]).toEqual({ state: "running", duration: 160 });
  const fixed = await flash.evaluate((element) => ({
    left: getComputedStyle(element).left,
    top: getComputedStyle(element).top,
  }));
  await page.mouse.move(1200, 700);
  expect(
    await flash.evaluate((element) => ({
      left: getComputedStyle(element).left,
      top: getComputedStyle(element).top,
    })),
  ).toEqual(fixed);
  await expect(
    page.getByRole("dialog", { name: "Grimoire", exact: true }),
  ).toBeVisible();
  await expect(flash).toHaveCSS("opacity", "0");
});

test("dragging out or losing focus cancels a press and the next click still works once", async ({
  page,
}) => {
  const feedback = page.locator(".wand-feedback");
  const book = page.getByRole("button", { name: "Grimoire", exact: true });
  await book.hover();
  await page.mouse.down();
  await expect(feedback).toHaveAttribute("data-state", "pressed");
  await page.mouse.move(1200, 700, { steps: 5 });
  await page.mouse.up();
  await expect(feedback).toHaveAttribute("data-state", "none");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page
      .locator(".wand-click")
      .evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((entry) => entry.playState === "running").length,
      ),
  ).toBe(0);
  await book.hover();
  await page.mouse.down();
  await expect(feedback).toHaveAttribute("data-state", "pressed");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(feedback).toHaveAttribute("data-state", "none");
  await page.mouse.move(1200, 700);
  await page.mouse.up();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await book.click();
  await expect(
    page.getByRole("dialog", { name: "Grimoire", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".wand-feedback")).toHaveCount(1);
  await expect(page.locator(".wand-click")).toHaveCount(1);
});

test("title controls keep hover priority while window drag and resize capture survive crossing other regions", async ({
  page,
}) => {
  const feedback = page.locator(".wand-feedback");
  const html = page.locator("html");
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  const window = page.getByRole("region", { name: "Bookstore event proposal window" });
  const title = window.locator(".window-titlebar");
  const before = (await window.boundingBox())!;
  const minimize = page.getByRole("button", {
    name: "Minimize Bookstore event proposal",
    exact: true,
  });
  await minimize.hover();
  await expectCursorResource(minimize, "wand-hover.svg", [5, 1], "pointer");
  await expect(feedback).toHaveAttribute("data-state", "hover");
  const bar = (await title.boundingBox())!;
  await page.mouse.move(bar.x + 120, bar.y + bar.height / 2);
  await expectCursorResource(title, "wand-grab.svg", [12, 12], "grab");
  await expect(feedback).toHaveAttribute("data-state", "none");
  await page.mouse.down();
  await page.mouse.move(1150, 350, { steps: 8 });
  await expect(html).toHaveAttribute("data-wisp-gesture", "drag");
  await expect(window).toHaveAttribute("data-wisp-dragging", "true");
  await expect(feedback).toHaveAttribute("data-state", "dragging");
  await expect(page.locator(".desktop")).toHaveCSS("cursor", "grabbing");
  expect((await window.boundingBox())!.x).toBeGreaterThan(before.x);
  await page.mouse.up();
  await expect(html).not.toHaveAttribute("data-wisp-gesture", "drag");
  await expect(window).not.toHaveAttribute("data-wisp-dragging", "true");
  await expect(feedback).not.toHaveAttribute("data-state", "dragging");
  const editor = page.getByLabel("Bookstore event proposal text");
  await editor.hover();
  await expectCursorResource(editor, "wand-text.svg", [12, 12], "text");
  await expect(feedback).toHaveAttribute("data-state", "none");
  const handle = page.getByLabel("Resize Bookstore event proposal");
  await handle.hover();
  await expectCursorResource(
    handle,
    "wand-resize.svg",
    [12, 12],
    "nwse-resize",
  );
  const beforeResize = (await window.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(1000, 700);
  await expect(html).toHaveAttribute("data-wisp-gesture", "resize");
  await expect(feedback).not.toHaveAttribute("data-state", "pressed");
  await expectCursorResource(
    page.locator(".desktop"),
    "wand-resize.svg",
    [12, 12],
    "nwse-resize",
  );
  const resized = (await window.boundingBox())!;
  expect(
    Math.abs(resized.width - beforeResize.width) +
      Math.abs(resized.height - beforeResize.height),
  ).toBeGreaterThan(20);
  await page.mouse.up();
  await expect(html).not.toHaveAttribute("data-wisp-gesture", "resize");
  await page.mouse.move(1300, 850);
  const released = (await window.boundingBox())!;
  expect([released.width, released.height]).toEqual([
    resized.width,
    resized.height,
  ]);
  expect(await cursor(page.locator(".desktop"))).toContain("wand-cursor.svg");
  const updatedBar = (await title.boundingBox())!;
  await page.mouse.move(
    updatedBar.x + 120,
    updatedBar.y + updatedBar.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    updatedBar.x + 140,
    updatedBar.y + updatedBar.height / 2 + 10,
  );
  await expect(html).toHaveAttribute("data-wisp-gesture", "drag");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(html).not.toHaveAttribute("data-wisp-gesture", "drag");
  await expect(window).not.toHaveAttribute("data-wisp-dragging", "true");
  await expect(feedback).toHaveAttribute("data-state", "none");
  await page.mouse.up();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
});

test("text cursor preserves real drag selection, native copy and replacing selected text", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Open Bookstore event proposal", exact: true })
    .click();
  const editor = page.getByLabel("Bookstore event proposal text");
  const original = "Wisp keeps selection and editing usable.";
  await editor.fill(original);
  const textGeometry = await editor.evaluate((element: HTMLTextAreaElement) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    const measure = canvas.getContext("2d")!;
    measure.font = style.font;
    return {
      x:
        rect.left +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft) +
        1,
      y:
        rect.top +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.paddingTop) +
        parseFloat(style.lineHeight) / 2,
      width: measure.measureText("Wisp keeps selection").width,
    };
  });
  await page.mouse.move(textGeometry.x, textGeometry.y);
  await expectCursorResource(editor, "wand-text.svg", [12, 12], "text");
  await page.mouse.down();
  await page.mouse.move(textGeometry.x + textGeometry.width, textGeometry.y, {
    steps: 10,
  });
  await page.mouse.up();
  const selected = await editor.evaluate((element: HTMLTextAreaElement) => ({
    start: element.selectionStart,
    end: element.selectionEnd,
    text: element.value.slice(element.selectionStart, element.selectionEnd),
  }));
  expect(selected.text).toContain("Wisp keeps");
  expect(selected.end).toBeLessThan(original.length);
  await expect(page.locator(".wand-feedback")).toHaveAttribute(
    "data-state",
    "none",
  );
  // Observe the native shortcut without replacing the browser copy handler.
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.addEventListener(
      "copy",
      (event) => {
        queueMicrotask(() => {
          element.dataset.copiedSelection = element.value.slice(
            element.selectionStart,
            element.selectionEnd,
          );
          element.dataset.copyPrevented = String(event.defaultPrevented);
        });
      },
      { once: true },
    );
  });
  await page.keyboard.press("Control+c");
  await expect(editor).toHaveAttribute("data-copied-selection", selected.text);
  await expect(editor).toHaveAttribute("data-copy-prevented", "false");
  await page.keyboard.insertText("Selected text replaced");
  await expect(editor).toHaveValue(
    original.slice(0, selected.start) +
      "Selected text replaced" +
      original.slice(selected.end),
  );
});

test("aria-disabled ancestors override hovered and text descendants without click effects", async ({
  page,
}) => {
  // A browser fixture exercises ARIA compatibility; the app currently uses native disabled controls.
  await page.locator(".app-shell").evaluate((shell) => {
    const region = document.createElement("div");
    region.dataset.testid = "aria-disabled-region";
    region.setAttribute("aria-disabled", "true");
    Object.assign(region.style, {
      position: "fixed",
      left: "1100px",
      top: "650px",
      width: "260px",
      zIndex: "9999",
    });
    const button = document.createElement("button");
    button.textContent = "Unavailable test action";
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", "Unavailable test text");
    region.append(button, input);
    shell.append(region);
  });
  const region = page.getByTestId("aria-disabled-region");
  const button = region.getByRole("button");
  const input = region.getByRole("textbox");
  for (const target of [button, input]) {
    await target.hover();
    await expectCursorResource(
      target,
      "wand-forbidden.svg",
      [5, 1],
      "not-allowed",
    );
    await page.mouse.down();
    await expect(page.locator(".wand-feedback")).toHaveAttribute(
      "data-state",
      "none",
    );
    await page.mouse.up();
    await expectNoClickEffect(page);
  }
  await region.evaluate((element) => element.removeAttribute("aria-disabled"));
  await button.hover();
  await expectCursorResource(button, "wand-hover.svg", [5, 1], "pointer");
  await expect(page.locator(".wand-feedback")).toHaveAttribute(
    "data-state",
    "hover",
  );
  await input.hover();
  await expectCursorResource(input, "wand-text.svg", [12, 12], "text");
});
test("busy feedback stays within its panel while native controls and document editing work through failure and success", async ({
  page,
}) => {
  const requests = await delayedCheck(page);
  const feedback = page.locator(".wand-feedback");
  await openGemini(page);
  await page
    .getByRole("button", { name: "Run Gemini Check", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(1);
  const panel = page.locator(".floating-panel");
  const title = panel.locator(".floating-heading > span");
  await expect(panel).toHaveAttribute("aria-busy", "true");
  await title.hover();
  await expect(feedback).toHaveAttribute("data-state", "progress");
  const disabled = page.getByRole("button", {
    name: "Processing and saving…",
    exact: true,
  });
  // Disabled buttons must also override descendants that carry their own cursor class.
  await disabled.evaluate((element) => {
    const child = document.createElement("span");
    child.className = "resize-handle";
    child.dataset.testid = "disabled-cursor-child";
    child.setAttribute("aria-hidden", "true");
    child.textContent = "×";
    Object.assign(child.style, {
      position: "static",
      display: "inline-block",
      width: "14px",
      height: "14px",
    });
    element.append(child);
  });
  const disabledChild = disabled.getByTestId("disabled-cursor-child");
  await disabledChild.hover();
  await expectCursorResource(
    disabledChild,
    "wand-forbidden.svg",
    [5, 1],
    "not-allowed",
  );
  await expect(feedback).toHaveAttribute("data-state", "none");
  await disabled.hover();
  await expectCursorResource(
    disabled,
    "wand-forbidden.svg",
    [5, 1],
    "not-allowed",
  );
  await expect(feedback).toHaveAttribute("data-state", "none");
  await expect(page.locator(".wand-click")).toHaveCSS("opacity", "0");
  await page.mouse.down();
  await expect(feedback).toHaveAttribute("data-state", "none");
  await page.mouse.up();
  await expectNoClickEffect(page);
  expect(requests).toHaveLength(1);
  const stop = page.getByRole("button", { name: "Stop waiting", exact: true });
  await stop.hover();
  await expect(stop).toBeEnabled();
  await expect(feedback).toHaveAttribute("data-state", "hover");
  const editor = page.getByLabel("Bookstore event proposal text");
  await editor.hover();
  await expectCursorResource(editor, "wand-text.svg", [12, 12], "text");
  await expect(feedback).toHaveAttribute("data-state", "none");
  await editor.fill("等待过程中，原文仍然可以编辑。");
  await expect(editor).toHaveValue("等待过程中，原文仍然可以编辑。");
  await page.mouse.move(1350, 750);
  await expect(feedback).toHaveAttribute("data-state", "none");
  await title.hover();
  await expect(feedback).toHaveAttribute("data-state", "progress");
  await failure(requests[0]);
  await expect(page.getByRole("alert")).toContainText("Gemini is temporarily unavailable");
  await expect(panel).toHaveAttribute("aria-busy", "false");
  await expect(feedback).toHaveAttribute("data-state", "none");
  await page
    .getByRole("button", { name: "Run Gemini Check", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  await title.hover();
  await expect(feedback).toHaveAttribute("data-state", "progress");
  await success(requests[1]);
  await expect(
    page.getByRole("heading", { name: "Gemini: more information needed", exact: true }),
  ).toBeVisible();
  await expect(feedback).toHaveAttribute("data-state", "none");
  await expect(editor).toHaveValue("等待过程中，原文仍然可以编辑。");
});

test("cancelling a local wait clears busy feedback and a background familiar never makes the desktop busy", async ({
  page,
}) => {
  const requests = await delayedCheck(page);
  const feedback = page.locator(".wand-feedback");
  await openGemini(page);
  await page
    .getByRole("button", { name: "Run Gemini Check", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(1);
  await page.locator(".floating-heading > span").hover();
  await expect(feedback).toHaveAttribute("data-state", "progress");
  await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Waiting stopped");
  await expect(page.locator(".floating-panel")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(feedback).not.toHaveAttribute("data-state", "progress");
  await success(requests[0]).catch(() => {});
  await page.getByRole("button", { name: "Close material panel", exact: true }).click();
  await openGemini(page, "Summon");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.locator(".floating-panel")).toHaveCount(0);
  await page.mouse.move(1200, 700);
  await expect(feedback).toHaveAttribute("data-state", "none");
  await page.getByLabel("Bookstore event proposal text").fill("使魔工作时也能编辑。");
  await page.getByRole("button", { name: "View familiar tasks", exact: true }).click();
  await page.getByRole("button", { name: "Recall task", exact: true }).click();
  await success(requests[1]).catch(() => {});
  await expect(page.getByTestId("task-card")).toContainText("Cancelled");
});

for (const source of ["application", "system"] as const) {
  test(`${source} reduced motion and a hidden witch retain static feedback and usable controls`, async ({
    page,
  }) => {
    const requests = await delayedCheck(page);
    await page.getByRole("button", { name: "Grimoire", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Show the witch").uncheck();
    if (source === "application") await page.getByLabel("Reduce motion").check();
    else await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("Escape");
    const feedback = page.locator(".wand-feedback");
    await expect(page.locator(".companion")).toHaveCount(0);
    await expect(feedback).toHaveAttribute("data-reduced", "true");
    const book = page.getByRole("button", { name: "Grimoire", exact: true });
    await book.hover();
    await expect(feedback).toHaveAttribute("data-state", "hover");
    await page.mouse.down();
    await expect(feedback).toHaveAttribute("data-state", "pressed");
    expect(
      await feedback.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await page.mouse.up();
    await expect(
      page.getByRole("dialog", { name: "Grimoire", exact: true }),
    ).toBeVisible();
    expect(
      await page
        .locator(".wand-click")
        .evaluate(
          (element) =>
            element
              .getAnimations()
              .filter((entry) => entry.playState === "running").length,
        ),
    ).toBe(0);
    await page.keyboard.press("Escape");
    await openGemini(page);
    await page
      .getByRole("button", { name: "Run Gemini Check", exact: true })
      .click();
    await expect.poll(() => requests.length).toBe(1);
    await page.locator(".floating-heading > span").hover();
    await expect(feedback).toHaveAttribute("data-state", "progress");
    expect(
      await feedback
        .locator(".wand-progress")
        .evaluate((element) => element.getAnimations({ subtree: true }).length),
    ).toBe(0);
    await failure(requests[0]);
    await expect(feedback).toHaveAttribute("data-state", "none");
  });
}
