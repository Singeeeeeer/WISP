import { expect, it } from "vitest";
import {
  batchContinuationDraft,
  sliceBatchSnapshot,
  validBatchSnapshots,
  validateBatch,
} from "../src/domain/batch";
import {
  newBatchTask,
  newTask,
  transition,
  validBatchTask,
  validGeminiTask,
} from "../src/domain/task";
import { validateProcessing } from "../src/domain/processing";
import { batchDraft, batchResult } from "./batch-fixtures";

it("validates all three independent-source schemas and never accepts them as single-material records", () => {
  for (const operation of ["understand", "check", "create"] as const) {
    const result = batchResult(operation);
    expect(validateBatch(result)).toBe(true);
    expect(validateProcessing(result)).toBe(false);
    for (const corrupted of [
      { ...result, scope: "single" },
      { ...result, schemaVersion: "gemini-" + operation + "-1" },
      { ...result, snapshot: result.snapshots[0] },
      { ...result, id: " " },
      { ...result, instruction: "x".repeat(4001) },
      {
        ...result,
        snapshots: result.snapshots.map((s) => ({ ...s, extra: "forbidden" })),
      },
      { ...result, metadata: { ...result.metadata, durationMs: -1 } },
    ])
      expect(validateBatch(corrupted)).toBe(false);
  }
});
it("rejects duplicate IDs, invalid sources and aggregate overflow, including astral UTF-16 units", () => {
  const sources = batchResult().snapshots;
  expect(validBatchSnapshots(sources.slice(0, 1))).toBe(false);
  expect(validBatchSnapshots(Array(13).fill(sources[0]))).toBe(false);
  expect(
    validBatchSnapshots([sources[0], { ...sources[1], id: sources[0].id }]),
  ).toBe(false);
  expect(
    validBatchSnapshots([
      sources[0],
      { ...sources[1], materialId: sources[0].materialId },
    ]),
  ).toBe(false);
  expect(
    validBatchSnapshots([sources[0], { ...sources[1], source: "unknown" }]),
  ).toBe(false);
  const exact = sources.map((s) => ({
    ...s,
    text: "😀".repeat(15000),
    start: 0,
    end: 30000,
  }));
  expect(validBatchSnapshots(exact)).toBe(true);
  expect(
    validBatchSnapshots([
      exact[0],
      { ...exact[1], text: exact[1].text + "x", end: 30001 },
    ]),
  ).toBe(false);
  expect(
    validBatchSnapshots([sources[0], { ...sources[1], text: " ", end: 1 }]),
  ).toBe(false);
});
it("binds every quote to its numbered source and rejects surrogate splitting and foreign ranges", () => {
  const result = batchResult("understand");
  for (const bad of [
    { sourceIndex: 0, start: 2, end: 10, quote: "日期为11月8日" },
    { sourceIndex: 3, start: 2, end: 10, quote: "日期为11月8日" },
    { sourceIndex: 2, start: 2, end: 10, quote: "日期为11月8日" },
    { sourceIndex: 1, start: 0, end: 1, quote: "\uD83D" },
    {
      sourceIndex: 1,
      start: 2,
      end: 10,
      quote: "日期为11月8日",
      unknown: true,
    },
  ])
    expect(validateBatch({ ...result, summaryEvidence: [bad] })).toBe(false);
});
it("slices a frozen source with absolute offsets, deep provenance and full-character boundaries", () => {
  const source = {
    ...batchResult().snapshots[0],
    start: 20,
    end: 31,
    origin: {
      kind: "pasted_text" as const,
      addedAt: new Date().toISOString(),
      note: "来源",
    },
  };
  const selected = sliceBatchSnapshot(source, 2, 10);
  expect(selected).toMatchObject({
    text: "日期为11月8日",
    start: 22,
    end: 30,
    capturedAt: source.capturedAt,
  });
  expect(selected.id).not.toBe(source.id);
  expect(selected.origin).not.toBe(source.origin);
  for (const [start, end] of [
    [0, 1],
    [1, 2],
    [-1, 2],
    [0, 12],
    [2, 2],
    [0.5, 2],
  ])
    expect(() => sliceBatchSnapshot(source, start, end)).toThrow("selection");
});
it("requires valid need-information outcomes and enforces aggregate result budgets", () => {
  const result = batchResult("understand");
  expect(
    validateBatch({
      ...result,
      summary: "",
      summaryEvidence: [],
      outcome: "needs_information",
    }),
  ).toBe(true);
  expect(
    validateBatch({
      ...result,
      summary: "",
      summaryEvidence: [],
      missingInformation: [],
      outcome: "needs_information",
    }),
  ).toBe(false);
  const check = batchResult("check");
  if (check.operation !== "check") throw Error("fixture");
  expect(
    validateBatch({
      ...check,
      findings: Array(20).fill({
        ...check.findings[0],
        explanation: "x".repeat(4000),
      }),
    }),
  ).toBe(false);
});
it("maps all familiar roles, retains frozen snapshots and rejects mixed or watch task contracts", () => {
  for (const operation of ["understand", "check", "create"] as const) {
    const result = batchResult(operation),
      draft = batchDraft(result),
      task = newBatchTask(draft);
    expect(validBatchTask(task)).toBe(true);
    expect(validGeminiTask(task)).toBe(false);
    expect(task.operation).toBe(operation);
    expect(task).not.toHaveProperty("snapshot");
    expect(task.snapshots).not.toBe(draft.snapshots);
    expect(
      transition(transition(task, { type: "start" }), {
        type: "complete",
        result,
      }).result,
    ).toEqual(result);
    expect(validBatchTask({ ...task, watchId: "watch" } as never)).toBe(false);
    expect(
      validBatchTask({ ...task, snapshot: result.snapshots[0] } as never),
    ).toBe(false);
    expect(() =>
      newBatchTask({ ...draft, watchId: "watch" } as never),
    ).toThrow();
    expect(() => newBatchTask({ ...draft, entry: "check" })).toThrow("delegation");
  }
  const r = batchResult("understand");
  expect(() =>
    newBatchTask({
      ...batchDraft(r),
      familiar: "scout_bat",
      summaryStyle: "brief",
    }),
  ).toThrow();
  expect(() =>
    newTask({
      entry: "summon",
      familiar: "page_sprite",
      instruction: "",
      snapshot: r.snapshots[0],
    }),
  ).not.toThrow();
});
it("binds task replies to complete snapshots, operation, instruction, batch ID and style", () => {
  const result = batchResult("understand"),
    task = transition(newBatchTask(batchDraft(result)), { type: "start" });
  for (const bad of [
    { ...result, id: crypto.randomUUID() },
    { ...result, instruction: "changed" },
    { ...result, summaryStyle: "brief" },
    {
      ...result,
      snapshots: result.snapshots.map((s) => ({ ...s, materialVersion: 2 })),
    },
    { ...result, snapshots: [...result.snapshots].reverse() },
  ])
    expect(() =>
      transition(task, { type: "complete", result: bad as never }),
    ).toThrow(/binding|bound/);
});
it("preserves originals for continuation with fresh batch and source IDs", () => {
  const r = batchResult("understand"),
    draft = batchContinuationDraft(r);
  expect(draft.id).not.toBe(r.id);
  expect(draft.fromResult).toBe(true);
  expect(draft.summaryStyle).toBe(r.summaryStyle);
  for (let i = 0; i < 2; i++) {
    expect(draft.snapshots[i].id).not.toBe(r.snapshots[i].id);
    expect({ ...draft.snapshots[i], id: r.snapshots[i].id }).toEqual(
      r.snapshots[i],
    );
  }
});
