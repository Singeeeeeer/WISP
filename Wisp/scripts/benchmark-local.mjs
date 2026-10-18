// Local, isolated prototype benchmark. No production code or provider calls.
import { chromium } from "playwright";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { makeFixture, runLocalRulesBenchmark } from "./benchmark-local-rules.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
const origin = "http://127.0.0.1:15380";
const smoke = process.argv.includes("--smoke");
const counts = smoke
  ? { startup: 2, interactions: 2, pairs: 1, sampleMs: 1000, localRepeats: 1 }
  : { startup: 10, interactions: 20, pairs: 5, sampleMs: 4000, localRepeats: 3 };
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const output = resolve(root, `test-results/local-benchmark-${date}${smoke ? "-smoke" : ""}.json`);
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const progress = (message) => console.log(`[benchmark] ${message}`);
export function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0, median: null, p95: null, min: null, max: null };
  const n = sorted.length;
  return { n, median: (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2,
    p95: sorted[Math.ceil(n * 0.95) - 1], min: sorted[0], max: sorted[n - 1] };
}
async function assetManifest(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await assetManifest(path));
    else {
      const bytes = await readFile(path);
      files.push({ path: relative(dist, path).split(sep).join("/"), bytes: bytes.length,
        gzipBytes: /\.(js|css|html)$/.test(path) ? gzipSync(bytes).length : null, sha256: sha(bytes) });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// Installed before navigation so missing paint samples remain missing, never zero.
function installObservers() {
  const data = { longTasks: [], lcp: [], shifts: [], observerSupport: {} };
  window.__wispBench = data;
  for (const [type, key] of [["longtask", "longTasks"], ["largest-contentful-paint", "lcp"], ["layout-shift", "shifts"]]) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) data[key].push(entry.toJSON());
      });
      observer.observe({ type, buffered: true });
      data.observerSupport[type] = true;
    } catch { data.observerSupport[type] = false; }
  }
  let readyStarted = false;
  const observer = new MutationObserver(async () => {
    const view = document.querySelector('[aria-label="Bookstore event proposal reading view"]');
    if (readyStarted || !view || !view.getBoundingClientRect().width) return;
    readyStarted = true;
    observer.disconnect();
    data.readingDomMs = performance.now();
    await document.fonts.ready;
    const visibleImages = [...document.images].filter((img) => img.getBoundingClientRect().width);
    data.imageErrors = [];
    const extra = ["/assets/wisp/wisp-atlas.png", "/assets/prototype/quiet-ring.png"].map((src) => {
      const image = new Image(); image.src = src; return image;
    });
    await Promise.all([...visibleImages, ...extra].map(async (img) => {
      try { await img.decode(); } catch { data.imageErrors.push(img.src); }
    }));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    data.appReadyMs = performance.now();
  });
  observer.observe(document, { childList: true, subtree: true });
  localStorage.setItem("wisp-tour-seen", "true");
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const externalRequests = [], pageErrors = [], routeErrors = [];
const result = {
  schema: "wisp-local-benchmark-1", status: "running", date, startedAtUtc: new Date().toISOString(),
  environment: {
    platform: os.platform(), osRelease: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model.trim(),
    logicalProcessors: os.cpus().length, totalRamBytes: os.totalmem(), node: process.version,
    browser: await browser.version(), playwright: JSON.parse(await readFile(resolve(root, "node_modules/playwright/package.json"))).version,
    viewport: { width: 1440, height: 1000 }, headless: true, deviceScaleFactor: 1,
    cpuThrottling: "none", network: "No real network; all resources fulfilled from local production dist",
    cache: "New isolated contexts for startup; route interception disables HTTP cache; OS file cache is uncontrolled",
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    clientDateTimeZone: "Asia/Shanghai", counts,
  },
  scope: { liveGeminiCalls: 0, productCodeChanges: false, artificialDelaysInProduct: false,
    healthResponse: "mock unconfigured", assetsFromDisk: true, sampleType: "single-machine laboratory benchmark" },
  assets: await assetManifest(dist), startup: [], interactions: [], companion: [], localUi: [],
  externalRequests, pageErrors, routeErrors,
};

async function newPage() {
  const context = await browser.newContext({ viewport: result.environment.viewport, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.bringToFront();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.addInitScript(installObservers);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      externalRequests.push(url.href); await route.abort("blockedbyclient"); return;
    }
    if (url.pathname === "/api/health") {
      await route.fulfill({ json: { service: "wisp", jobs_enabled: false, model_connected: false, model_status: "unconfigured" } }); return;
    }
    if (url.pathname.startsWith("/api/")) {
      externalRequests.push(url.pathname); await route.abort("blockedbyclient"); return;
    }
    if (url.pathname === "/favicon.ico") { await route.fulfill({ status: 204, body: "" }); return; }
    const path = resolve(dist, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).slice(1));
    if (!path.startsWith(dist + sep)) throw new Error("Unexpected asset path");
    try { await route.fulfill({ path }); }
    catch (error) { routeErrors.push({ path: relative(dist, path), message: error.message }); await route.abort("failed"); }
  });
  await page.goto(origin, { waitUntil: "load" });
  await page.waitForFunction(() => Number.isFinite(window.__wispBench.appReadyMs));
  return { context, page };
}

// Start inside a trusted browser click; locator actionability is outside this timer.
async function measuredClick(page, target, expected) {
  await page.locator("[data-wisp-benchmark-target]").evaluateAll((elements) => elements.forEach((e) => e.removeAttribute("data-wisp-benchmark-target")));
  await target.evaluate((el) => el.setAttribute("data-wisp-benchmark-target", "true"));
  await page.evaluate((expected) => {
    window.__clickBenchmark = null;
    document.addEventListener("click", function clicked(event) {
      if (!event.target.closest('[data-wisp-benchmark-target="true"]')) return;
      document.removeEventListener("click", clicked, true);
      const start = performance.now();
      let timeout;
      const matches = () => {
        const nodes = [...document.querySelectorAll(expected.selector)];
        if (expected.absent) return nodes.length === 0;
        return nodes.some((el) => (!expected.text || el.textContent.trim() === expected.text)
          && el.getBoundingClientRect().width > 0);
      };
      let done = false;
      const observer = new MutationObserver(check);
      function check() {
        if (done || !matches()) return;
        done = true; observer.disconnect();
        const domMs = performance.now() - start;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          clearTimeout(timeout);
          window.__clickBenchmark = { trusted: event.isTrusted, startMs: start, domMs, twoRafMs: performance.now() - start };
        }));
      }
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      queueMicrotask(check);
      timeout = setTimeout(() => {
        observer.disconnect();
        if (!window.__clickBenchmark) window.__clickBenchmark = { error: "Expected DOM or two rAF timeout" };
      }, 5000);
    }, true);
  }, expected);
  await target.click();
  await page.waitForFunction(() => window.__clickBenchmark !== null);
  const timing = await page.evaluate(() => window.__clickBenchmark);
  if (timing.error || !timing.trusted) throw new Error(JSON.stringify(timing));
  return timing;
}
async function settleBook(page) {
  await page.locator(".grimoire-dialog").evaluate(async (book) => {
    await Promise.all([...book.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
    await Promise.all(book.getAnimations({ subtree: true })
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => {})));
  });
}

try {
  progress(`Startup: ${counts.startup} new contexts`);
  for (let run = 1; run <= counts.startup; run++) {
    const { context, page } = await newPage();
    await page.waitForTimeout(500);
    result.startup.push(await page.evaluate((run) => {
      const nav = performance.getEntriesByType("navigation")[0];
      const bench = window.__wispBench;
      return { run, dclMs: nav.domContentLoadedEventEnd, loadMs: nav.loadEventEnd,
        readingDomMs: bench.readingDomMs, appReadyMs: bench.appReadyMs, observationEndMs: performance.now(),
        paints: Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, p.startTime])),
        lcpCandidateMs: bench.lcp.at(-1)?.startTime ?? null,
        clsObserved: bench.shifts.filter((e) => !e.hadRecentInput).reduce((sum, e) => sum + e.value, 0),
        longTasks: bench.longTasks, imageErrors: bench.imageErrors, observerSupport: bench.observerSupport,
        loadedResources: performance.getEntriesByType("resource").map((r) => ({ path: new URL(r.name).pathname, decodedBodyBytes: r.decodedBodySize })),
      };
    }, run));
    await context.close();
  }
  progress(`Interactions: first use plus ${counts.interactions} warm cycles`);
  const interactionPage = await newPage();
  const page = interactionPage.page;
  for (let run = 0; run <= counts.interactions; run++) {
    const open = await measuredClick(page, page.getByRole("button", { name: "Grimoire", exact: true }), { selector: ".grimoire-dialog" });
    await settleBook(page);
    open.assetsAndAnimationSettledMs = await page.evaluate((start) => performance.now() - start, open.startMs);
    const settings = await measuredClick(page, page.getByRole("button", { name: "Settings", exact: true }), { selector: '[role="region"][aria-label="Settings"]' });
    const about = await measuredClick(page, page.getByRole("button", { name: "About you", exact: true }), { selector: '[role="region"][aria-label="About you"]' });
    const close = await measuredClick(page, page.getByLabel("Close Grimoire", { exact: true }), { selector: ".grimoire-dialog", absent: true });
    result.interactions.push({ run, phase: run === 0 ? "first-use" : "warm", open, settings, about, close });
  }
  await interactionPage.context.close();

  progress(`Companion: ${counts.pairs} alternating pairs, ${counts.sampleMs} ms per condition`);
  const animation = await newPage();
  const session = await animation.context.newCDPSession(animation.page);
  await session.send("Performance.enable");
  for (let pair = 1; pair <= counts.pairs; pair++) {
    for (const visible of pair % 2 ? [true, false] : [false, true]) {
      const ap = animation.page;
      await ap.getByRole("button", { name: "Grimoire", exact: true }).click();
      await settleBook(ap);
      await ap.getByRole("button", { name: "Settings", exact: true }).click();
      await ap.getByLabel("Show the witch", { exact: true }).setChecked(visible);
      if (await ap.getByLabel("Reduce motion", { exact: true }).isChecked()) throw new Error("Unexpected reduced motion");
      if (!await ap.getByLabel("Idle antics", { exact: true }).isChecked()) throw new Error("Unexpected idle setting");
      await ap.getByLabel("Close Grimoire", { exact: true }).click();
      await ap.mouse.move(1360, 700);
      await ap.waitForTimeout(1500);
      if ((await ap.locator(".companion").count() > 0) !== visible) throw new Error("Companion setting not applied");
      const state = await ap.evaluate(() => {
        const el = document.querySelector(".companion");
        return { focused: document.hasFocus(), visibility: document.visibilityState,
          characterState: el?.dataset.state ?? null,
          characterVisibility: el ? getComputedStyle(el).visibility : null,
          characterCssWidth: el ? parseFloat(getComputedStyle(el).width) : null };
      });
      if (!state.focused || state.visibility !== "visible" || (visible && (state.characterState !== "idle" || state.characterVisibility !== "visible"))) {
        throw new Error(`Invalid companion sampling state: ${JSON.stringify(state)}`);
      }
      const before = Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
      const frames = await ap.evaluate((duration) => new Promise((done) => {
        const started = performance.now(), intervals = []; let last = null;
        const taskOffset = window.__wispBench.longTasks.length;
        function frame(now) {
          if (last !== null) intervals.push(now - last); last = now;
          if (now - started < duration) requestAnimationFrame(frame);
          else done({ elapsedMs: performance.now() - started, intervals,
            longTasks: window.__wispBench.longTasks.slice(taskOffset), focused: document.hasFocus(), visibility: document.visibilityState });
        }
        requestAnimationFrame(frame);
      }), counts.sampleMs);
      const after = Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
      const wallSeconds = after.Timestamp - before.Timestamp;
      const seconds = Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"]
        .map((key) => [key, after[key] - before[key]]));
      if (!Number.isFinite(wallSeconds) || wallSeconds <= 0 || Object.values(seconds).some((n) => !Number.isFinite(n) || n < 0)
        || !frames.focused || frames.visibility !== "visible" || frames.intervals.length < 2) throw new Error("Invalid CDP or rAF sample");
      result.companion.push({ pair, visible, characterSizeSetting: 48, idleAntics: true, state, wallSeconds, ...frames,
        rafIntervalMs: stats(frames.intervals), seconds,
        mainThreadTaskOccupancyPercent: 100 * seconds.TaskDuration / wallSeconds,
        usedJsHeapBytes: after.JSHeapUsedSize });
    }
  }
  await animation.context.close();

  progress("Local UI: real rule execution, IndexedDB save and result DOM");
  const local = await newPage();
  const lp = local.page;
  for (const length of [1000, 60000]) {
    const expectedText = makeFixture(length);
    await lp.getByRole("button", { name: "Edit text of Bookstore event proposal", exact: true }).click();
    await lp.getByLabel("Bookstore event proposal text", { exact: true }).fill(expectedText);
    await lp.waitForFunction(() => /^saved$/i.test(document.querySelector('[data-testid="save-proposal"]')?.textContent.trim() ?? ""));
    for (const [operation, menu, button, heading] of [
      ["understand", "Understand", "Organize source excerpts", "Source excerpt"],
      ["check", "Check", "Run local check", "An arrangement needs review"],
      ["create", "Create", "Create template draft", "Event template draft"],
    ]) {
      for (let run = 1; run <= counts.localRepeats; run++) {
        await lp.getByRole("button", { name: "Open core abilities", exact: true }).click();
        await lp.getByRole("menuitem", { name: menu, exact: true }).click();
        const timing = await measuredClick(lp, lp.getByRole("button", { name: button, exact: true }), { selector: "h2", text: heading });
        const saved = await lp.evaluate(async ({ operation, length, expectedText }) => {
          const db = await new Promise((done, fail) => {
            const req = indexedDB.open("wisp-module-one"); req.onsuccess = () => done(req.result); req.onerror = () => fail(req.error);
          });
          const records = await new Promise((done, fail) => {
            const req = db.transaction("checks").objectStore("checks").getAll(); req.onsuccess = () => done(req.result); req.onerror = () => fail(req.error);
          });
          db.close();
          const matches = records.filter((r) => r.operation === operation && r.snapshot.text.length === length);
          return { count: matches.length, correct: matches.length > 0 && matches.every((r) => r.status === "completed" && r.snapshot.text === expectedText
            && (operation !== "check" || (r.outcome === "findings" && r.findings.length === 1
              && r.findings[0].evidence.length === 2 && r.findings[0].evidence.every((e) => r.snapshot.text.slice(e.start, e.end) === e.quote)))
            && (operation !== "create" || r.excerpts.length === 4)
            && r.excerpts?.every?.((e) => r.snapshot.text.slice(e.start, e.end) === e.quote) !== false) };
        }, { operation, length, expectedText });
        if (!saved.correct || saved.count !== run) throw new Error(`Saved-result validation failed: ${operation}/${length}/${run}`);
        result.localUi.push({ operation, inputUtf16CodeUnits: length, fixtureSha256Utf8: sha(expectedText), run, ...timing, saved });
        await lp.getByRole("button", { name: operation === "check" ? "Close check result" : "Close result", exact: true }).click();
      }
    }
    if (length === 1000) {
      // Closing and reopening the editor is a user action, not a database reset.
      await lp.getByRole("button", { name: "Done editing", exact: true }).click();
    }
  }
  await local.context.close();
  progress("Local rules: actual TypeScript source in Node V8");
  result.localRules = await runLocalRulesBenchmark();
  if (externalRequests.length || pageErrors.length || routeErrors.length || result.startup.some((r) => r.imageErrors.length)) {
    throw new Error("Unexpected request, asset or page error; inspect raw data");
  }
  result.status = "complete";
} catch (error) {
  result.status = "failed";
  result.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await browser.close();
  result.finishedAtUtc = new Date().toISOString();
  await mkdir(resolve(root, "test-results"), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  progress(`${result.status}: ${output}`);
  if (result.failure) console.error(result.failure.message);
}
