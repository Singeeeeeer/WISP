import { test, expect, type Locator, type Page } from "./offline-app";
import { editDocument } from "./document-editor";

type FlightWindow = Window & { __summonClick?: { x: number; y: number } };

async function openSummon(page: Page, role = "Page Sprite") {
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Material confirmation" })
    .getByRole("button", { name: role })
    .click();
}

async function recordSubmitPoint(submit: Locator) {
  await submit.evaluate((element) => {
    element.addEventListener(
      "click",
      (event) => {
        const click = event as MouseEvent;
        (window as FlightWindow).__summonClick = {
          x: click.clientX,
          y: click.clientY,
        };
      },
      { once: true },
    );
  });
}

async function capturedOrigin(page: Page) {
  return page.evaluate(() => {
    const point = (window as FlightWindow).__summonClick!;
    return {
      x: Math.max(24, Math.min(point.x, innerWidth - 24)),
      y: Math.max(24, Math.min(point.y, innerHeight - 24)),
    };
  });
}

async function pauseFlights(page: Page) {
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      ...args: Parameters<Element["animate"]>
    ) {
      const animation = animate.apply(this, args);
      if (this.classList.contains("familiar-flight")) {
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, body: "Summon flight test: API disabled" }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Bookstore event proposal reading view")).toBeVisible();
});

for (const [role, familiar, sprite] of [
  ["Page Sprite", "page_sprite", "flight-page-sprite"],
  ["Scout Bat", "scout_bat", "flight-scout-bat"],
  ["Alchemy Imp", "alchemy_imp", "flight-alchemy-imp"],
]) {
  test(`${role} flies from the submitting click while the real task completes independently`, async ({
    page,
  }) => {
    await pauseFlights(page);
    await openSummon(page, role);
    const submit = page.getByRole("button", {
      name: "Summon familiar",
      exact: true,
    });
    await submit.scrollIntoViewIfNeeded();
    await recordSubmitPoint(submit);
    await submit.click({ position: { x: 12, y: 12 } });
    const origin = await capturedOrigin(page);
    const flight = page.locator(".familiar-flight");
    await expect(flight).toHaveAttribute("data-flight", "flying");
    await expect(flight).toHaveAttribute("data-familiar", familiar);
    await expect(flight.locator(`.${sprite}`)).toBeVisible();
    const at = (await flight.boundingBox())!;
    expect(at.x + at.width / 2).toBeCloseTo(origin.x, 1);
    expect(at.y + at.height / 2).toBeCloseTo(origin.y, 1);
    await expect(flight).toHaveCSS("pointer-events", "none");
    await expect(
      page.getByRole("dialog", { name: "Material confirmation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "Familiar task status" }),
    ).toContainText("1 unread");
    // Holding only the decorative animation cannot hold a local task's real result.
    await expect(flight).toHaveAttribute("data-flight", "flying");
    expect(
      await flight.evaluate(
        (element) => element.getAnimations()[0].effect!.getTiming().duration,
      ),
    ).toBe(2850);
    await flight.evaluate((element) => {
      element.getAnimations()[0].currentTime = 1700;
    });
    const afterRitual = (await flight.boundingBox())!;
    expect(afterRitual.x + afterRitual.width / 2).toBeCloseTo(origin.x, 1);
    expect(afterRitual.y + afterRitual.height / 2).toBeCloseTo(origin.y, 1);
    const target = (await page
      .locator(`.familiar-marker [data-familiar="${familiar}"]`)
      .first()
      .boundingBox())!;
    await flight.evaluate((element) => {
      element.getAnimations()[0].currentTime = 2275;
    });
    const halfway = (await flight.boundingBox())!;
    expect(halfway.x + halfway.width / 2).toBeCloseTo(
      origin.x + (target.x + target.width / 2 - origin.x) * 0.875,
      0,
    );
    expect(halfway.y + halfway.height / 2).toBeCloseTo(
      origin.y + (target.y + target.height / 2 - origin.y) * 0.875 - 65,
      0,
    );
    if (familiar === "scout_bat") {
      await page.screenshot({
        path: "test-results/prototype/scout-flight.png",
      });
    }
    await flight.evaluate((element) => element.getAnimations()[0].finish());
    await expect(flight).toHaveAttribute("data-flight", "none");
  });
}

test("failed enqueue has no flight; a keyboard retry starts at the button center", async ({
  page,
}) => {
  await pauseFlights(page);
  await openSummon(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "tasks") {
        IDBObjectStore.prototype.add = add;
        throw new Error("模拟委托写入失败");
      }
      return add.apply(this, args);
    };
  });
  const submit = page.getByRole("button", {
    name: "Summon familiar",
    exact: true,
  });
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("模拟委托写入失败");
  const flight = page.locator(".familiar-flight");
  await expect(flight).toHaveAttribute("data-flight", "none");
  await submit.focus();
  await submit.scrollIntoViewIfNeeded();
  const origin = (await submit.boundingBox())!;
  await page.keyboard.press("Enter");
  await expect(flight).toHaveAttribute("data-flight", "flying");
  const at = (await flight.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(at.x + at.width / 2).toBeCloseTo(
    Math.max(24, Math.min(origin.x + origin.width / 2, viewport.width - 24)),
    0,
  );
  expect(at.y + at.height / 2).toBeCloseTo(
    Math.max(24, Math.min(origin.y + origin.height / 2, viewport.height - 24)),
    0,
  );
});

for (const source of ["application", "system"] as const) {
  test(`${source} reduced motion performs a brief static handoff at the target`, async ({
    page,
  }) => {
    if (source === "system")
      await page.emulateMedia({ reducedMotion: "reduce" });
    else {
      await page.getByRole("button", { name: "Grimoire", exact: true }).click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByLabel("Reduce motion").check();
      await page.keyboard.press("Escape");
    }
    await openSummon(page);
    await page
      .getByRole("button", { name: "Summon familiar", exact: true })
      .click();
    const flight = page.locator(".familiar-flight");
    await expect(flight).toHaveAttribute("data-flight", "handoff");
    expect(
      await flight.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    const target = (await page
      .locator('.familiar-marker [data-familiar="page_sprite"]')
      .first()
      .boundingBox())!;
    const at = (await flight.boundingBox())!;
    expect(at.x + at.width / 2).toBeCloseTo(target.x + target.width / 2, 0);
    expect(at.y + at.height / 2).toBeCloseTo(target.y + target.height / 2, 0);
    await expect(flight).toHaveAttribute("data-flight", "none", {
      timeout: 2000,
    });
    await expect(
      page.getByRole("complementary", { name: "Familiar task status" }),
    ).toContainText("1 unread");
  });
}

test("new submission replaces a flight; resize, blur and hiding the witch clear decoration", async ({
  page,
}) => {
  await pauseFlights(page);
  const flight = page.locator(".familiar-flight");
  await openSummon(page);
  await page
    .getByRole("button", { name: "Summon familiar", exact: true })
    .click();
  await expect(flight).toHaveAttribute("data-flight", "flying");
  await openSummon(page, "Scout Bat");
  await page
    .getByRole("button", { name: "Summon familiar", exact: true })
    .click();
  await expect(flight).toHaveAttribute("data-familiar", "scout_bat");
  expect(
    await flight.evaluate((element) => element.getAnimations().length),
  ).toBe(1);
  await page.setViewportSize({ width: 1400, height: 950 });
  await expect(flight).toHaveAttribute("data-flight", "none");
  await openSummon(page);
  await page
    .getByRole("button", { name: "Summon familiar", exact: true })
    .click();
  await expect(flight).toHaveAttribute("data-flight", "flying");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(flight).toHaveAttribute("data-flight", "none");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Show the witch").uncheck();
  await page.keyboard.press("Escape");
  await openSummon(page);
  await page
    .getByRole("button", { name: "Summon familiar", exact: true })
    .click();
  await expect(flight).toHaveAttribute("data-flight", "none");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("4 unread");
});

test("each familiar marker opens its own frozen reply and persists independent unread states", async ({
  page,
}) => {
  const editor = await editDocument(page);
  const rail = page.getByRole("complementary", {
    name: "Familiar task status",
  });
  const marks = rail.locator('[data-familiar="page_sprite"]');
  const card = page.getByRole("dialog", { name: "Familiar task", exact: true });
  const firstText = "Earlier task: keep this original excerpt.";
  const secondText = "Later task: this is a different saved version.";
  await editor.fill(firstText);
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await openSummon(page);
  await page
    .getByRole("button", { name: "Summon familiar", exact: true })
    .click();
  await expect(marks).toHaveCount(1);
  await expect(marks.first()).toHaveAttribute("data-state", "completed");
  const firstId = await marks.first().getAttribute("data-task-id");
  await editor.fill(secondText);
  await expect(page.getByTestId("save-proposal")).toHaveText("saved");
  await openSummon(page);
  await page
    .getByRole("button", { name: "Summon familiar", exact: true })
    .click();
  await expect(marks).toHaveCount(2);
  await expect(rail).toContainText("2 unread");
  const first = rail.locator(`[data-task-id="${firstId}"]`);
  const second = marks.locator(`:scope:not([data-task-id="${firstId}"])`);
  const secondId = await second.getAttribute("data-task-id");
  await first.click();
  await expect(
    card.getByRole("heading", { name: "Source excerpt", exact: true }),
  ).toBeVisible();
  await expect(card.getByTestId("check-source")).toHaveText(firstText);
  await expect(card).toContainText("This result uses an older version");
  await expect(first).toHaveAttribute("data-unread", "false");
  await expect(second).toHaveAttribute("data-unread", "true");
  await expect(rail).toContainText("1 unread");
  await page.reload();
  await expect(first).toHaveAttribute("data-unread", "false");
  await expect(second).toHaveAttribute("data-unread", "true");
  await first.click();
  await expect(card.getByTestId("check-source")).toHaveText(firstText);
  await expect(rail).toContainText("1 unread");
  await second.click();
  await expect(card.getByTestId("check-source")).toHaveText(secondText);
  await expect(card).not.toContainText("This result uses an older version");
  await expect(rail).toContainText("0 unread");
  await expect(second).toHaveAttribute("data-unread", "false");
  await card.getByRole("button", { name: "Close result", exact: true }).click();
  await card
    .getByRole("button", { name: "Archive record", exact: true })
    .click();
  await expect(rail.locator(`[data-task-id="${secondId}"]`)).toHaveCount(0);
  await expect(first).toBeVisible();
  await card
    .getByRole("button", { name: "View all familiar tasks", exact: true })
    .click();
  const book = page.getByRole("dialog", { name: "Grimoire", exact: true });
  await expect(book.getByTestId("task-card")).toHaveCount(2);
  await expect(book).toContainText("Archived");
});

test.describe("touch input", () => {
  test.use({ hasTouch: true, viewport: { width: 780, height: 1000 } });
  for (const hideRail of [false, true])
    test(`tap origin is preserved and lands at ${hideRail ? "the grimoire fallback" : "the familiar on a narrow screen"}`, async ({
      page,
    }) => {
      await pauseFlights(page);
      if (hideRail)
        await page.addStyleTag({
          content: ".familiar-marker { display: none !important; }",
        });
      await page.getByRole("button", { name: "Open core abilities" }).tap();
      await page.getByRole("menuitem", { name: "Summon", exact: true }).tap();
      const submit = page.getByRole("button", {
        name: "Summon familiar",
        exact: true,
      });
      await submit.scrollIntoViewIfNeeded();
      await recordSubmitPoint(submit);
      await submit.tap();
      const origin = await capturedOrigin(page);
      const flight = page.locator(".familiar-flight");
      await expect(flight).toHaveAttribute("data-flight", "flying");
      const at = (await flight.boundingBox())!;
      expect(at.x + at.width / 2).toBeCloseTo(origin.x, 0);
      expect(at.y + at.height / 2).toBeCloseTo(origin.y, 0);
      const target = (await (
        hideRail
          ? page.getByRole("button", { name: "Grimoire", exact: true })
          : page
              .locator('.familiar-marker [data-familiar="page_sprite"]')
              .first()
      ).boundingBox())!;
      const landing = await flight.evaluate((element) => ({
        x: parseFloat((element as HTMLElement).style.left) + 24,
        y: parseFloat((element as HTMLElement).style.top) + 24,
      }));
      expect(landing.x).toBeCloseTo(
        Math.max(24, Math.min(target.x + target.width / 2, 780 - 24)),
        0,
      );
      expect(landing.y).toBeCloseTo(
        Math.max(24, Math.min(target.y + target.height / 2, 1000 - 24)),
        0,
      );
    });
});
