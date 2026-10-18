import { test, expect, type Locator, type Page } from "@playwright/test";

async function pitch(heading: Locator) {
  return heading.evaluate((element) => {
    const rotation = (element as HTMLElement).style.transform.match(
      /rotate\((-?[\d.]+)deg\)/,
    );
    return rotation ? Number(rotation[1]) : 0;
  });
}

async function insideViewport(target: Locator, width: number, height: number) {
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      return (
        !!box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width &&
        box.y + box.height <= height
      );
    })
    .toBe(true);
}

async function connectedTrace(page: Page, x: number, y: number) {
  const trace = page.locator(".magic-trace");
  await expect(trace).toHaveAttribute("data-anchor-x", String(x));
  await expect(trace).toHaveAttribute("data-anchor-y", String(y));
  await expect(trace.locator(".magic-trace-arrival")).toHaveAttribute(
    "cx",
    String(x),
  );
  await expect(trace.locator(".magic-trace-arrival")).toHaveAttribute(
    "cy",
    String(y),
  );
  const tip = trace.locator(".magic-trace-tip");
  const tipX = Number(await tip.getAttribute("cx"));
  const tipY = Number(await tip.getAttribute("cy"));
  const caster = (await page.locator(".companion .wisp-sprite").boundingBox())!;
  expect(tipX).toBeGreaterThanOrEqual(caster.x);
  expect(tipX).toBeLessThanOrEqual(caster.x + caster.width);
  expect(tipY).toBeGreaterThanOrEqual(caster.y);
  expect(tipY).toBeLessThanOrEqual(caster.y + caster.height);
  const menu = (await page
    .getByRole("menu", { name: "基础能力" })
    .boundingBox())!;
  const path = (await trace.locator(".magic-trace-path").getAttribute("d"))!;
  expect(path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)).toEqual([
    tipX,
    tipY,
    x,
    y,
    menu.x + menu.width / 2,
    menu.y + menu.height / 2,
  ]);
  return path;
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Casting test: API disabled" }),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByLabel("书店活动提案正文")).toBeVisible();
});

test("flight turns horizontally, pitches vertically, and preserves direction through idle and jitter", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  const heading = companion.locator(".companion-heading");
  await page.mouse.move(1000, 650);
  await page.mouse.move(650, 650);
  await expect(companion).toHaveAttribute("data-facing", "left");
  await expect(heading).toHaveAttribute("style", /scaleX\(-1\)/);
  await page.mouse.move(900, 650);
  await expect(companion).toHaveAttribute("data-facing", "right");
  await expect(heading).toHaveAttribute("style", /scaleX\(1\)/);
  await page.mouse.move(900, 400);
  await expect.poll(() => pitch(heading)).not.toBe(0);
  const upward = await pitch(heading);
  const stopped = await heading.getAttribute("style");
  await expect(companion).toHaveAttribute("data-state", "idle");
  await expect(heading).toHaveAttribute("style", stopped!);
  await page.mouse.move(901, 400);
  await page.mouse.move(900, 400);
  await expect(companion).toHaveAttribute("data-facing", "right");
  await expect(heading).toHaveAttribute("style", stopped!);
  await page.mouse.move(900, 700);
  await expect
    .poll(async () => (await pitch(heading)) * upward)
    .toBeLessThan(0);
  await page.mouse.move(600, 400);
  await expect(companion).toHaveAttribute("data-facing", "left");
  await expect.poll(() => pitch(heading)).not.toBe(0);
  await page.mouse.move(800, 500);
  await expect(companion).toHaveAttribute("data-facing", "right");
  for (let step = 1; step <= 8; step++)
    await page.mouse.move(800 - step * 2, 500 + step * 3);
  await expect(companion).toHaveAttribute("data-facing", "left");
  for (let step = 1; step <= 8; step++)
    await page.mouse.move(784 + step * 2, 524 + step * 3);
  await expect(companion).toHaveAttribute("data-facing", "right");
});

test("opening a menu keeps the same witch, switches pose, and freezes the casting position", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  await page.mouse.move(900, 700);
  const original = await companion.elementHandle();
  const flightPose = await companion
    .locator(".companion-pose")
    .getAttribute("viewBox");
  await page.mouse.click(700, 700, { button: "right" });
  const menu = page.getByRole("menu", { name: "基础能力" });
  await expect(menu).toBeVisible();
  await expect(companion).toHaveAttribute("data-state", "casting");
  expect(
    await original!.evaluate(
      (element) =>
        element.isConnected && element === document.querySelector(".companion"),
    ),
  ).toBe(true);
  await expect(companion).toHaveCount(1);
  await expect(companion.locator(".wisp-sprite")).toHaveCount(1);
  await expect(page.locator(".ring-center .wisp-sprite")).toHaveCount(0);
  await expect(companion.locator(".companion-pose")).not.toHaveAttribute(
    "viewBox",
    flightPose!,
  );
  const ringBounds = (await menu.boundingBox())!;
  const witchBounds = await companion.boundingBox();
  const tracePath = await connectedTrace(page, 700, 700);
  expect(ringBounds.x + ringBounds.width / 2).toBeCloseTo(700, 0);
  expect(ringBounds.y + ringBounds.height / 2).toBeCloseTo(700, 0);
  await page.mouse.move(1150, 200);
  expect(await menu.boundingBox()).toEqual(ringBounds);
  expect(await companion.boundingBox()).toEqual(witchBounds);
  expect(await connectedTrace(page, 700, 700)).toBe(tracePath);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  expect(
    await original!.evaluate(
      (element) =>
        element.isConnected && element === document.querySelector(".companion"),
    ),
  ).toBe(true);
  await expect(companion).not.toHaveAttribute("data-state", "casting");
});

test("casting and menu remain visible at all corners and after viewport resize", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  const menu = page.getByRole("menu", { name: "基础能力" });
  for (const [x, y] of [
    [1, 1],
    [1438, 1],
    [1438, 998],
    [1, 998],
  ]) {
    await page.mouse.move(x, y);
    await page.keyboard.press("q");
    await expect(companion).toHaveAttribute("data-state", "casting");
    await insideViewport(companion.locator(".wisp-sprite"), 1440, 1000);
    await insideViewport(menu, 1440, 1000);
    const frozen = await menu.boundingBox();
    const tracePath = await connectedTrace(page, x, y);
    await page.mouse.move(700, 650);
    expect(await menu.boundingBox()).toEqual(frozen);
    expect(await connectedTrace(page, x, y)).toBe(tracePath);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
  await page.mouse.move(1300, 800);
  await page.keyboard.press("q");
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 640, height: 650 });
  await insideViewport(companion.locator(".wisp-sprite"), 640, 650);
  await insideViewport(menu, 640, 650);
});

test("rapid cancellation and reopening use the new target without duplicate characters", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  const menu = page.getByRole("menu", { name: "基础能力" });
  const original = await companion.elementHandle();
  for (const [x, y] of [
    [600, 650],
    [1000, 650],
    [500, 700],
  ]) {
    await page.mouse.move(x, y);
    await page.keyboard.press("q");
    await expect(menu).toBeVisible();
    await expect(companion).toHaveCount(1);
    const box = (await menu.boundingBox())!;
    expect(box.x + box.width / 2).toBeCloseTo(x, 0);
    expect(box.y + box.height / 2).toBeCloseTo(y, 0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
  expect(
    await original!.evaluate(
      (element) =>
        element.isConnected && element === document.querySelector(".companion"),
    ),
  ).toBe(true);
  await page.mouse.move(1100, 700);
  await expect(companion).toHaveAttribute("data-state", "following");
});

test("menu entries accept a pointer click while the opening animation is running", async ({
  page,
}) => {
  await page.mouse.move(700, 700);
  await page.keyboard.press("q");
  const menu = page.getByRole("menu", { name: "基础能力" });
  const check = page.getByRole("menuitem", { name: "Check", exact: true });
  const opening = await menu.evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      .some((animation) => animation.playState === "running"),
  );
  expect(opening).toBe(true);
  expect(await check.isEnabled()).toBe(true);
  const box = (await check.boundingBox())!;
  // Mouse coordinates avoid Playwright waiting for animation stability before clicking.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "运行本地检查" }),
  ).toBeEnabled();
  await expect(page.locator(".companion")).not.toHaveAttribute(
    "data-state",
    "casting",
  );
});

for (const source of ["application", "system"] as const) {
  test(`${source} reduced motion opens a static casting pose and an immediately usable menu`, async ({
    page,
  }) => {
    if (source === "application") {
      await page.getByRole("button", { name: "魔法书", exact: true }).click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByLabel("减少动态效果").check();
      await page.keyboard.press("Escape");
    } else {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }
    const companion = page.locator(".companion");
    await expect(companion).toHaveAttribute("data-state", "still");
    const original = await companion.elementHandle();
    await page.mouse.move(700, 700);
    await page.keyboard.press("q");
    const menu = page.getByRole("menu", { name: "基础能力" });
    await expect(companion).toHaveAttribute("data-state", "casting");
    await expect(page.locator(".magic-trace")).toHaveCount(0);
    await expect(menu).toHaveClass(/magic-ring-reduced/);
    expect(
      await original!.evaluate(
        (element) =>
          element.isConnected &&
          element === document.querySelector(".companion"),
      ),
    ).toBe(true);
    expect(
      await companion.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    expect(
      await menu.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "召唤使魔", exact: true }),
    ).toBeEnabled();
    await expect(companion).toHaveAttribute("data-state", "still");
  });
}

test("diving pitch follows downward direction while upward tilt and stopped heading stay stable", async ({
  page,
}) => {
  const companion = page.locator(".companion");
  const heading = companion.locator(".companion-heading");
  for (const direction of [1, -1]) {
    const x = direction === 1 ? 700 : 500;
    await page.mouse.move(x - direction * 150, 300);
    await page.mouse.move(x, 300);
    await expect(companion).toHaveAttribute(
      "data-facing",
      direction === 1 ? "right" : "left",
    );
    await page.mouse.move(x, 500);
    await expect
      .poll(() => pitch(heading), { timeout: 1200 })
      .toBeCloseTo(direction * 60, 0);
    const downward = await heading.getAttribute("style");
    await expect(companion).toHaveAttribute("data-state", "idle");
    await page.mouse.move(x + 1, 500);
    await page.mouse.move(x, 500);
    await expect(heading).toHaveAttribute("style", downward!);
    await page.mouse.move(x - direction * 100, 300);
    await page.mouse.move(x, 400);
    await expect
      .poll(() => pitch(heading), { timeout: 1200 })
      .toBeCloseTo(direction * 30, 0);
    await page.mouse.move(x, 250);
    await expect
      .poll(() => pitch(heading), { timeout: 1200 })
      .toBeCloseTo(direction * -18, 0);
    const upward = await heading.getAttribute("style");
    await expect(companion).toHaveAttribute("data-state", "idle");
    await expect(heading).toHaveAttribute("style", upward!);
  }
});

test("maximum-size diving sprite stays fully visible during edge arrival and idle hovering", async ({
  page,
}) => {
  await page.getByRole("button", { name: "魔法书", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const size = page.getByLabel("角色大小");
  await size.focus();
  await size.press("End");
  await expect(size).toHaveValue("72");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 640, height: 650 });
  const companion = page.locator(".companion");
  const sprite = companion.locator(".wisp-sprite");
  await expect(companion).toHaveCSS("width", "108px");
  for (const edgeX of [1, 490]) {
    await page.mouse.move(320, 200);
    await expect(companion).toHaveAttribute("data-state", "idle");
    const observation = sprite.evaluate(
      (element) =>
        new Promise<{
          samples: number;
          states: string[];
          firstOverflow: {
            x: number;
            y: number;
            right: number;
            bottom: number;
            state: string;
          } | null;
        }>((resolve) => {
          const started = performance.now();
          let samples = 0;
          const states = new Set<string>();
          let firstOverflow: {
            x: number;
            y: number;
            right: number;
            bottom: number;
            state: string;
          } | null = null;
          const sample = () => {
            const box = element.getBoundingClientRect();
            const state = element
              .closest(".companion")!
              .getAttribute("data-state")!;
            samples++;
            states.add(state);
            if (
              !firstOverflow &&
              (box.x < -0.1 ||
                box.y < -0.1 ||
                box.right > innerWidth + 0.1 ||
                box.bottom > innerHeight + 0.1)
            )
              firstOverflow = {
                x: box.x,
                y: box.y,
                right: box.right,
                bottom: box.bottom,
                state,
              };
            if (performance.now() - started < 3600)
              requestAnimationFrame(sample);
            else resolve({ samples, states: [...states], firstOverflow });
          };
          requestAnimationFrame(sample);
        }),
    );
    // Observe every painted frame, including arrival, rotation and a full idle float.
    await page.mouse.move(edgeX, 400, { steps: 8 });
    await page.mouse.move(edgeX, 460);
    const observed = await observation;
    expect(observed.samples).toBeGreaterThan(30);
    expect(observed.states).toEqual(
      expect.arrayContaining(["following", "idle"]),
    );
    expect(
      observed.firstOverflow,
      `rotated sprite crossed the viewport near x=${edgeX}`,
    ).toBeNull();
  }
});
