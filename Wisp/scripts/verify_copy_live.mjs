// Run only on explicit authorization: node scripts/verify_copy_live.mjs --live --url http://127.0.0.1:15311
// Uses synthetic text, an isolated Chrome context, and the real UI/API. Never retries a model request.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/verify_copy_live.mjs --live [--url http://127.0.0.1:15311]");
  process.exit(0);
}
if (!args.includes("--live")) {
  console.error("Refusing live Gemini calls: explicitly pass --live after obtaining authorization.");
  process.exit(2);
}
let baseURL = "http://127.0.0.1:15311";
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--live") continue;
  if (args[index] !== "--url" || !args[index + 1]) throw Error("Unknown or incomplete argument");
  baseURL = args[++index];
}
const url = new URL(baseURL);
if (!['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/')
  throw Error("--url must be a local HTTP(S) origin without credentials, path, query or fragment");
baseURL = url.origin;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "docs/gemini-live-copies-latest.json");
const screenshotDir = path.join(root, "test-results/live-copies");
const networkFailures = new Set([
  "MODEL_CONNECTION_CLOSED", "MODEL_NETWORK_ERROR", "MODEL_TIMEOUT", "MODEL_UNAVAILABLE",
]);
const cases = [
  { input: "txt_drop", operation: "understand", status: "not_run" },
  { input: "document_copy", operation: "check", status: "not_run" },
  { input: "selection_copy", operation: "create", status: "not_run" },
];
const report = {
  startedAt: new Date().toISOString(), baseURL,
  sampleKind: "synthetic live UI validation", explicitLive: true,
  automaticRetries: 0, isolatedBrowserContext: true, cases,
};
let browser, page;
const requests = [];
const captureJobs = [];
const pageErrors = [];
const cauldron = () => page.getByRole("dialog", { name: "Inspiration Cauldron", exact: true });
const venue = () => page.getByRole("region", { name: "Venue notes window", exact: true });
const filename = "synthetic-live-book-club.txt";
const syntheticText = "虚构验收材料😀。星光读书会计划于11月8日14点开放，最多20人。海报11月10日定稿后开放报名。预算2000元，已报价1500元。";
const originalText = "虚构场地记录😀\n星光读书会计划于11月8日14点开放，最多20人。海报11月10日定稿后开放报名。\n不属于选区的虚构备注。";

async function records(store) {
  return page.evaluate(async (store) => {
    const db = await new Promise((resolve, reject) => {
      const opening = indexedDB.open("wisp-module-one");
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, store);
}

async function saveCandidate(source) {
  await cauldron().getByRole("button", { name: "Confirm addition", exact: true }).click();
  await expect(cauldron().getByTestId("material-detail")).toBeVisible();
  const material = (await records("materials")).find((value) => value.source === source);
  assert.ok(material, "Material must exist after UI confirmation");
  assert.ok((await records("cauldronEntries")).some((entry) => entry.materialId === material.id));
  return material;
}

async function prepare(testCase) {
  if (testCase.input === "txt_drop") {
    const transfer = await page.evaluateHandle(({ filename, text }) => {
      const data = new DataTransfer();
      data.items.add(new File([text], filename, { type: "text/plain", lastModified: 1700000000000 }));
      return data;
    }, { filename, text: syntheticText });
    for (const event of ["dragenter", "dragover", "drop"])
      await page.locator("body").dispatchEvent(event, { dataTransfer: transfer });
    await transfer.dispose();
    await expect(cauldron().getByTestId("import-preview")).toHaveValue(syntheticText);
    const material = await saveCandidate("txt_file");
    assert.equal(material.text, syntheticText);
    assert.equal(material.origin.fileName, filename);
    return material;
  }
  const editor = page.getByLabel("Venue notes text", { exact: true });
  if (testCase.input === "document_copy") {
    await editor.fill(originalText);
    await expect(page.getByTestId("save-venue")).toHaveText("Saved");
  }
  const original = (await records("materials")).find((value) => value.id === "venue");
  let start = 0, end = originalText.length;
  if (testCase.input === "selection_copy") {
    start = originalText.indexOf("星光");
    end = originalText.indexOf("\n不属于");
    await editor.press("Control+Home");
    for (const _ of Array.from(originalText.slice(0, start))) await editor.press("ArrowRight");
    for (const _ of Array.from(originalText.slice(start, end))) await editor.press("Shift+ArrowRight");
    await venue().getByRole("button", { name: "Add selection copy to cauldron", exact: true }).click();
  } else {
    await venue().getByRole("button", { name: "Add full-text copy to cauldron", exact: true }).click();
  }
  await expect(cauldron().getByTestId("copy-preview")).toHaveText(originalText.slice(start, end));
  const material = await saveCandidate(testCase.input);
  assert.equal(material.text, originalText.slice(start, end));
  assert.notEqual(material.id, original.id);
  assert.deepEqual(material.origin.copy, {
    materialId: original.id, materialVersion: original.version, title: original.title,
    start, end, source: original.source,
  });
  testCase.frozenOriginal = material.origin.copy;
  return material;
}

async function runCase(testCase) {
  console.log(`Preparing ${testCase.input} -> ${testCase.operation}`);
  testCase.status = "preparing";
  const material = await prepare(testCase);
  testCase.material = material;
  await expect(cauldron().locator(".source-info")).toContainText(
    testCase.input === "txt_drop" ? filename : `v${material.origin.copy.materialVersion}`,
  );
  await cauldron().getByRole("button", {
    name: testCase.operation[0].toUpperCase() + testCase.operation.slice(1), exact: true,
  }).click();
  await expect(page.getByTestId("snapshot-text")).toHaveText(material.text);
  await page.getByLabel("Execution mode", { exact: true }).selectOption("gemini");
  await page.getByLabel("Additional instructions", { exact: true }).fill(
    testCase.operation === "create" ? "仅根据这份虚构材料写一条简短活动邀请，不确定日期安排时明确说明。" :
      testCase.operation === "check" ? "核对这份虚构活动材料的时间安排。" : "概括这份虚构材料，保持简短。",
  );
  if (testCase.operation === "understand")
    await page.getByLabel("Summary length for this run").selectOption("brief");
  const before = requests.length;
  const endpoint = `/api/${testCase.operation}`;
  const responsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === endpoint && response.request().method() === "POST",
  { timeout: 205000 }).catch(() => undefined);
  testCase.status = "submitted";
  testCase.submittedAt = new Date().toISOString();
  const action = { understand: "Run Gemini Understand", check: "Run Gemini Check", create: "Run Gemini Create" };
  await page.getByRole("button", { name: action[testCase.operation], exact: true }).click();
  const response = await responsePromise;
  await Promise.all(captureJobs);
  const submitted = requests.slice(before);
  assert.equal(submitted.length, 1, "Exactly one model submission is allowed for each case");
  testCase.http = submitted[0];
  const snapshot = submitted[0].request.snapshot;
  assert.equal(submitted[0].operation, testCase.operation);
  assert.equal(snapshot.materialId, material.id);
  assert.equal(snapshot.materialVersion, material.version);
  assert.equal(snapshot.title, material.title);
  assert.equal(snapshot.text, material.text);
  assert.equal(snapshot.start, 0);
  assert.equal(snapshot.end, material.text.length);
  assert.equal(snapshot.source, material.source);
  assert.deepEqual(snapshot.origin, material.origin);
  testCase.requestSourceBound = true;
  if (!response) {
    testCase.status = "failed";
    testCase.errorCode = "CLIENT_NETWORK_OR_TIMEOUT";
    testCase.uiError = await page.getByRole("alert").allTextContents();
    return false;
  }
  if (!response.ok()) {
    await expect(page.getByRole("alert")).toBeVisible();
    testCase.status = "failed";
    testCase.errorCode = testCase.http.response?.error?.code ?? "HTTP_ERROR";
    testCase.uiError = await page.getByRole("alert").allTextContents();
    assert.equal((await records("checks")).some((record) => record.id === snapshot.id), false,
      "A failed call must not store a completed result");
    testCase.failureNotPersisted = true;
    return !networkFailures.has(testCase.errorCode);
  }
  const result = testCase.http.response;
  assert.equal(result.operation, testCase.operation);
  assert.equal(result.execution, "gemini");
  assert.deepEqual(result.snapshot, snapshot);
  assert.equal(result.instruction, submitted[0].request.instruction);
  await expect(page.getByRole("heading", { name: /^Gemini:/ })).toBeVisible({ timeout: 15000 });
  const saved = (await records("checks")).find((record) => record.id === snapshot.id);
  assert.deepEqual(saved, result, "UI must persist the same fully bound model result");
  testCase.resultSourceBound = true;
  testCase.resultPersisted = true;
  testCase.status = "passed";
  await page.getByText("Execution details", { exact: true }).click();
  return true;
}

try {
  const healthResponse = await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(5000) });
  report.health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(report.health.service, "wisp");
  assert.ok(["configured", "verified"].includes(report.health.model_status), "Gemini must be configured on the existing service");
  await mkdir(screenshotDir, { recursive: true });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const operation = /^\/api\/(understand|check|create|connections)$/.exec(new URL(request.url()).pathname)?.[1];
    if (!operation) return;
    requests.push({ operation, method: request.method(), request: request.postDataJSON(), submittedAt: new Date().toISOString() });
  });
  page.on("response", (response) => {
    if (!/^\/api\/(understand|check|create|connections)$/.test(new URL(response.url()).pathname)) return;
    const captured = requests.find((item) => item.request?.snapshot?.id === response.request().postDataJSON()?.snapshot?.id);
    if (!captured) return;
    captureJobs.push((async () => {
      captured.httpStatus = response.status();
      captured.requestId = await response.headerValue("x-request-id");
      try { captured.response = await response.json(); }
      catch { captured.responseError = "Response was not valid JSON"; }
      captured.finishedAt = new Date().toISOString();
    })());
  });
  await page.goto(baseURL);
  await expect(page.getByTestId("save-venue")).toHaveText("Saved");
  assert.equal((await records("checks")).length, 0, "The isolated context must start without records");
  for (let index = 0; index < cases.length; index++) {
    const testCase = cases[index];
    let proceed;
    try { proceed = await runCase(testCase); }
    catch (error) {
      testCase.status = "failed";
      testCase.verificationError = error.message;
      proceed = false;
    }
    const screenshot = path.join(screenshotDir, `${testCase.input}-${testCase.operation}.png`);
    if (testCase.status === "failed" && await page.getByRole("alert").count())
      await page.getByRole("alert").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot }).catch(() => {});
    testCase.screenshot = path.relative(root, screenshot).replaceAll("\\", "/");
    console.log(JSON.stringify({ input: testCase.input, operation: testCase.operation, status: testCase.status,
      httpStatus: testCase.http?.httpStatus, errorCode: testCase.errorCode }));
    if (!proceed) {
      for (const remaining of cases.slice(index + 1)) remaining.reason = `Stopped after ${testCase.operation}: ${testCase.errorCode ?? "verification failed"}; no retry submitted`;
      break;
    }
    await page.getByRole("button", { name: testCase.status === "failed" ? "Close material panel" :
      testCase.operation === "check" ? "Close check result" : "Close result", exact: true }).click();
  }
  report.storedResults = await records("checks");
  report.modelCalls = requests.length;
  assert.equal(requests.length, cases.filter((item) => item.http).length, "No unexpected model calls");
  assert.equal(pageErrors.length, 0, "Page must have no JavaScript errors");
} catch (error) {
  report.error = error.message;
} finally {
  report.finishedAt = new Date().toISOString();
  report.pageErrors = pageErrors;
  report.modelCalls = requests.length;
  report.success = !report.error && cases.every((item) => item.status === "passed");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
  console.log(JSON.stringify({ success: report.success, modelCalls: requests.length, report: reportPath }));
  if (!report.success) process.exitCode = 1;
}
