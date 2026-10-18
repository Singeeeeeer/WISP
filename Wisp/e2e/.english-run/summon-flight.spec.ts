import { test, expect, type Page } from "./fixture";

type FlightWindow = Window & { __summonClick?: { x: number; y: number } };

async function openSummon(page: Page, role = "Page Sprite") {
  await page.getByRole("button", { name: "Open core abilities" }).click();
  await page.getByRole("menuitem", { name: "Summon", exact: true }).click();
  await page.getByRole("button", { name: role }).click();
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
  await expect(page.getByLabel("Bookstore event proposal text")).toBeVisible();
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
    const submit = page.getByRole("button", { name: "Summon familiar", exact: true });
    await submit.scrollIntoViewIfNeeded();
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
    await submit.click({ position: { x: 12, y: 12 } });
    const origin = await page.evaluate(
      () => (window as FlightWindow).__summonClick!,
    );
    const flight = page.locator(".familiar-flight");
    await expect(flight).toHaveAttribute("data-flight", "flying");
    await expect(flight).toHaveAttribute("data-familiar", familiar);
    await expect(flight.locator(`.${sprite}`)).toBeVisible();
    const at = (await flight.boundingBox())!;
    expect(at.x + at.width / 2).toBeCloseTo(origin.x, 1);
    expect(at.y + at.height / 2).toBeCloseTo(origin.y, 1);
    await expect(flight).toHaveCSS("pointer-events", "none");
    await expect(page.getByRole("dialog", { name: "Material confirmation" })).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "Familiar task status" }),
    ).toContainText("1 unread");
    // Holding only the decorative animation cannot hold a local task's real result.
    await expect(flight).toHaveAttribute("data-flight", "flying");
    if (familiar === "scout_bat") {
      await flight.evaluate((element) => {
        element.getAnimations()[0].currentTime = 250;
      });
      await page.screenshot({
        path: "test-results/english/pdf09-scout-flight.png",
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
  const submit = page.getByRole("button", { name: "Summon familiar", exact: true });
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
  expect(at.x + at.width / 2).toBeCloseTo(origin.x + origin.width / 2, 0);
  expect(at.y + at.height / 2).toBeCloseTo(origin.y + origin.height / 2, 0);
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
    await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
    const flight = page.locator(".familiar-flight");
    await expect(flight).toHaveAttribute("data-flight", "handoff");
    expect(
      await flight.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    const target = (await page
      .locator(".familiar-marker > span")
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
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(flight).toHaveAttribute("data-flight", "flying");
  await openSummon(page, "Scout Bat");
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(flight).toHaveAttribute("data-familiar", "scout_bat");
  expect(
    await flight.evaluate((element) => element.getAnimations().length),
  ).toBe(1);
  await page.setViewportSize({ width: 1400, height: 950 });
  await expect(flight).toHaveAttribute("data-flight", "none");
  await openSummon(page);
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(flight).toHaveAttribute("data-flight", "flying");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(flight).toHaveAttribute("data-flight", "none");
  await page.getByRole("button", { name: "Grimoire", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Show the witch").uncheck();
  await page.keyboard.press("Escape");
  await openSummon(page);
  await page.getByRole("button", { name: "Summon familiar", exact: true }).click();
  await expect(flight).toHaveAttribute("data-flight", "none");
  await expect(
    page.getByRole("complementary", { name: "Familiar task status" }),
  ).toContainText("4 unread");
});

test.describe("touch input", () => {
  test.use({ hasTouch: true, viewport: { width: 780, height: 1000 } });
  test("tap origin is preserved and a narrow screen lands at the grimoire entry", async ({
    page,
  }) => {
    await pauseFlights(page);
    await page.getByRole("button", { name: "Open core abilities" }).tap();
    await page.getByRole("menuitem", { name: "Summon", exact: true }).tap();
    const submit = page.getByRole("button", { name: "Summon familiar", exact: true });
    await submit.scrollIntoViewIfNeeded();
    const origin = (await submit.boundingBox())!;
    await submit.tap();
    const flight = page.locator(".familiar-flight");
    await expect(flight).toHaveAttribute("data-flight", "flying");
    const at = (await flight.boundingBox())!;
    expect(at.x + at.width / 2).toBeCloseTo(origin.x + origin.width / 2, 0);
    expect(at.y + at.height / 2).toBeCloseTo(origin.y + origin.height / 2, 0);
    const target = (await page
      .getByRole("button", { name: "Grimoire", exact: true })
      .boundingBox())!;
    const landing = await flight.evaluate((element) => ({
      x: parseFloat((element as HTMLElement).style.left) + 24,
      y: parseFloat((element as HTMLElement).style.top) + 24,
    }));
    expect(landing.x).toBeCloseTo(target.x + target.width / 2, 0);
    expect(landing.y).toBeCloseTo(target.y + target.height / 2, 0);
  });
});
