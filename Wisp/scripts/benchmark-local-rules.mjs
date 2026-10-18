import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, version as esbuildVersion } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceFiles = ["apps/web/src/domain/local-text.ts", "apps/web/src/domain/check.ts"];
const sizes = [1000, 10000, 60000];
const operations = ["understand", "check", "create"];
const targetBatchMs = 20;
const batchCount = 30;
const fieldLines = [
  "Topic: Community reading workshop",
  "Time: Late afternoon",
  "Location: Riverside hall",
  "How to join: Sign up at the desk",
];
const scheduleLines = [
  "Event to open on November 8",
  "Poster to be finalized on November 10, followed by registration opening",
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function makeFixture(length) {
  assert.ok(sizes.includes(length), "Use a benchmark fixture size of 1000, 10000, or 60000 UTF-16 code units");
  const prefix = [...fieldLines, ...scheduleLines.map((line) => line + ".")].join("\n") + "\n";
  const padding = "Workshop materials include paper, pencils, maps and examples.\n";
  const text = prefix + padding.repeat(Math.ceil((length - prefix.length) / padding.length)).slice(0, length - prefix.length);
  assert.equal(text.length, length);
  return text;
}

function fixture(length) {
  const text = makeFixture(length);
  return Object.freeze({
    id: `benchmark-${length}`,
    materialId: `fixture-${length}`,
    materialVersion: 1,
    title: "Synthetic community workshop fixture",
    text,
    start: 0,
    end: length,
    capturedAt: "2026-10-19T00:00:00.000Z",
    source: "new_text",
  });
}

function checkResult(result, operation, input, validateLocal) {
  assert.equal(result.operation, operation);
  assert.equal(result.status, "completed");
  assert.equal(validateLocal(result), true);
  const evidence = operation === "check"
    ? result.findings.flatMap((finding) => finding.evidence)
    : result.excerpts;
  for (const item of evidence) {
    assert.equal(input.text.slice(item.start, item.end), item.quote);
  }
  if (operation === "understand") {
    const lines = input.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    assert.deepEqual(result.excerpts.map((item) => item.quote), lines.slice(0, 8));
    assert.equal(result.omittedLines, lines.length - 8);
    assert.equal(result.execution, "local_extract");
  } else if (operation === "check") {
    assert.equal(result.execution, "local_rules");
    assert.equal(result.outcome, "findings");
    assert.equal(result.findings.length, 1);
    assert.deepEqual(evidence.map((item) => item.quote), scheduleLines);
  } else {
    assert.equal(result.execution, "local_template");
    assert.deepEqual(result.excerpts.map((item) => item.quote), fieldLines);
    for (const line of fieldLines) assert.ok(result.draft.split("\n").includes(line));
    assert.ok(!result.draft.includes("[To be added]"));
    assert.ok(!result.draft.includes("[Review:"));
  }
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1),
  };
}

export async function runLocalRulesBenchmark() {
  const bundled = await build({
    absWorkingDir: root,
    entryPoints: [sourceFiles[0]],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node20",
    logLevel: "silent",
  });
  const bundle = bundled.outputFiles[0].text;
  const { runLocal, validateLocal } = await import("data:text/javascript;base64," + Buffer.from(bundle).toString("base64"));
  const sourceHashes = {};
  for (const file of sourceFiles) sourceHashes[file] = sha256(await readFile(resolve(root, file)));
  const results = [];
  let sink = 0;
  for (const length of sizes) {
    const input = fixture(length);
    for (const operation of operations) {
      let lastResult;
      const batch = (iterations) => {
        const started = performance.now();
        for (let iteration = 0; iteration < iterations; iteration++) {
          lastResult = runLocal(operation, input, "", 8);
          sink = (sink + lastResult.operation.length + (lastResult.excerpts?.length ?? lastResult.findings.length)) | 0;
        }
        return performance.now() - started;
      };
      checkResult(runLocal(operation, input, "", 8), operation, input, validateLocal);
      let warmupIterations = 0;
      const warmupStarted = performance.now();
      while (warmupIterations < 100 || performance.now() - warmupStarted < 100) {
        batch(20);
        warmupIterations += 20;
      }
      const warmupMs = performance.now() - warmupStarted;
      let iterations = 1;
      let calibrationIterations = 0;
      let calibrationMs = 0;
      for (let attempt = 0; attempt < 8; attempt++) {
        const duration = batch(iterations);
        calibrationIterations += iterations;
        calibrationMs += duration;
        if (duration >= targetBatchMs / 2) break;
        iterations = Math.min(1000000, Math.ceil(iterations * Math.min(10, targetBatchMs / Math.max(0.01, duration))));
      }
      const samples = [];
      for (let index = 0; index < batchCount; index++) {
        const durationMs = batch(iterations);
        samples.push({ batch: index + 1, iterations, durationMs, msPerCall: durationMs / iterations });
        // Validation is deliberately outside the measured loop.
        checkResult(lastResult, operation, input, validateLocal);
        const correction = Math.max(0.5, Math.min(2, targetBatchMs / Math.max(0.01, durationMs)));
        iterations = Math.max(1, Math.min(1000000, Math.round(iterations * correction)));
      }
      results.push({
        operation,
        inputUtf16CodeUnits: length,
        inputUtf8Bytes: Buffer.byteLength(input.text),
        fixtureSha256Utf8: sha256(input.text),
        fixtureNonemptyLines: input.text.split(/\r?\n/).filter((line) => line.trim()).length,
        batches: batchCount,
        measuredIterations: samples.reduce((sum, sample) => sum + sample.iterations, 0),
        warmup: { iterations: warmupIterations, durationMs: warmupMs },
        calibration: { iterations: calibrationIterations, durationMs: calibrationMs },
        perCallMs: summarize(samples.map((sample) => sample.msPerCall)),
        expectedOutcome: operation === "check" ? "one schedule finding, two exact quotations" : operation === "understand" ? "first eight nonempty source lines, exact quotations and omitted-line count" : "four explicit fields copied into the local template, four exact quotations",
        validation: { passed: true, checkedResults: batchCount + 1, coverage: "preflight result and final result of each measured batch", validateLocal: true, exactQuotations: true, expectedOutcome: true },
        samples,
      });
    }
  }
  return {
    kind: "local-rules-function-microbenchmark",
    runtime: { engine: "Node.js V8 (not the browser UI)", node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch, esbuild: esbuildVersion },
    method: {
      implementation: "Existing runLocal and validateLocal source bundled in memory using esbuild write:false, imported as Node ESM data URL",
      sourceSha256: sourceHashes,
      bundledSourceSha256: sha256(bundle),
      unit: "milliseconds per function call; each observation is one batch mean",
      targetBatchMs,
      measuredBatchesPerCase: batchCount,
      warmup: "At least 100 calls and 100 ms per case, followed by adaptive batch calibration",
      percentile: "p95 nearest rank of 30 measured batch means; median averages the two middle values",
      includes: "runLocal computation, result allocation, built-in timestamps, and loop/result-consumption overhead (not subtracted)",
      excludes: "fixture construction, bundling, warmup, calibration, validation, browser rendering, IndexedDB, file parsing, network, and Gemini",
      fixtures: "Deterministic synthetic English workshop text: one supported schedule pair, four unique template fields, neutral repeated padding; lengths count UTF-16 code units",
      limitations: "Microbenchmark of three deterministic fixtures and local rules/templates; does not measure AI quality or browser/end-to-end latency",
    },
    sink,
    results,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await runLocalRulesBenchmark(), null, 2));
}
