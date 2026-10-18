import "fake-indexeddb/auto";
import { it, expect, vi, afterEach } from "vitest";
import { snapshot, seeds } from "../src/domain/model";
import { runCheck } from "../src/domain/check";
import { createRepository } from "../src/services/repository";
import { newTask, transition } from "../src/domain/task";
import { newWatch, watchTask } from "../src/domain/watch";
import {
  validateGemini,
  type GeminiCheckRecord,
} from "../src/domain/gemini-check";
import {
  requestGeminiCheck,
  createCheckSubmission,
} from "../src/services/gemini-check";
const source = () =>
  snapshot({ ...seeds()[0], text: "😀时间待定。时间待定。" });
const result = (s = source()): GeminiCheckRecord => ({
  id: s.id,
  operation: "check",
  status: "completed",
  execution: "gemini",
  schemaVersion: "gemini-check-1",
  snapshot: s,
  instruction: "请核对",
  createdAt: new Date().toISOString(),
  outcome: "findings",
  findings: [
    {
      title: "需确认",
      explanation: "时间不明确",
      suggestion: "补充时间",
      evidence: [{ start: 7, end: 11, quote: "时间待定" }],
    },
  ],
  missingInformation: ["报名渠道"],
  metadata: {
    modelId: "test-model",
    promptVersion: "check-1",
    validatorVersion: "evidence-1",
    durationMs: 12,
    usage: { total_input_tokens: 10 },
  },
});
afterEach(() => vi.unstubAllGlobals());
it("validates exact UTF-16 evidence, schema and outcome without accepting malformed data", () => {
  const r = result();
  expect(validateGemini(r)).toBe(true);
  for (const bad of [
    null,
    {},
    {
      ...r,
      findings: [
        {
          ...r.findings[0],
          evidence: [{ start: 1, end: 5, quote: "时间待定" }],
        },
      ],
    },
    { ...r, metadata: { ...r.metadata, durationMs: -1 } },
    { ...r, outcome: "no_findings" },
    { ...r, extra: true },
    { ...r, missingInformation: [""] },
  ])
    expect(validateGemini(bad)).toBe(false);
});
it("binds HTTP response to confirmed snapshot and instruction; never exposes arbitrary backend text", async () => {
  const r = result();
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(r)));
  vi.stubGlobal("fetch", mock);
  expect(await requestGeminiCheck(r.snapshot, r.instruction)).toEqual(r);
  expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({
    snapshot: r.snapshot,
    instruction: r.instruction,
  });
  mock.mockResolvedValue(
    new Response(JSON.stringify({ ...r, instruction: "other" })),
  );
  await expect(requestGeminiCheck(r.snapshot, r.instruction)).rejects.toThrow(
    /binding|bound/,
  );
  mock.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: {
          code: "MODEL_AUTH_FAILED",
          message: "secret-should-not-appear",
        },
      }),
      { status: 403 },
    ),
  );
  await expect(requestGeminiCheck(r.snapshot, r.instruction)).rejects.toThrow(
    "authentication",
  );
});
it("retries only persistence after a successful paid result and rejects mutation of authorization", async () => {
  const r = result();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(r)));
  vi.stubGlobal("fetch", fetchMock);
  const save = vi
    .fn()
    .mockRejectedValueOnce(Error("disk"))
    .mockResolvedValueOnce(r);
  const submit = createCheckSubmission(r.snapshot, r.instruction, save);
  await expect(submit.run()).rejects.toThrow("disk");
  expect(submit.hasResult()).toBe(true);
  expect(await submit.run()).toEqual(r);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("stores Gemini beside old records and rejects reusing id with another mode or requirement", async () => {
  const repo = createRepository("gemini-" + crypto.randomUUID()),
    r = result();
  await repo.saveRecord(r);
  expect(await repo.saveRecord(r)).toEqual(r);
  await expect(
    repo.saveRecord({ ...r, instruction: "changed" }),
  ).rejects.toThrow("submission ID");
  await expect(
    repo.saveRecord(runCheck(r.snapshot, r.instruction)),
  ).rejects.toThrow("submission ID");
  const local = runCheck(source(), "");
  await repo.saveRecord(local);
  expect(await repo.listRecords()).toHaveLength(2);
});
it("supports Gemini one-shot Scout and enforces mode-bound replies and terminal states", async () => {
  const r = result(),
    d = {
      entry: "summon" as const,
      snapshot: r.snapshot,
      instruction: r.instruction,
      familiar: "scout_bat" as const,
      execution: "gemini" as const,
    };
  const t = newTask(d);
  expect(t.execution).toBe("gemini");
  expect(newTask({ ...d, familiar: "page_sprite" })).toMatchObject({
    operation: "understand",
    summaryStyle: "standard",
  });
  const running = transition(t, { type: "start" });
  expect(() =>
    transition(running, {
      type: "complete",
      result: runCheck(r.snapshot, r.instruction),
    }),
  ).toThrow(/binding|bound/);
  expect(transition(running, { type: "complete", result: r })).toMatchObject({
    status: "completed",
    unread: true,
  });
  const cancelled = transition(running, { type: "cancel" });
  expect(transition(cancelled, { type: "complete", result: r })).toEqual(
    cancelled,
  );
  const repo = createRepository("gemini-task-" + crypto.randomUUID());
  await repo.enqueueTask(t);
  await expect(repo.enqueueTask({ ...t, execution: "local" })).rejects.toThrow(
    "submission ID",
  );
  const watched = watchTask(newWatch(source()), {
    ...seeds()[0],
    text: "全文",
    version: 2,
  });
  expect(watched.execution).toBe("local");
  expect(() =>
    transition(
      { ...running, watchId: "watch" },
      { type: "complete", result: r },
    ),
  ).toThrow(/binding|bound/);
});

it("rejects oversized finding fields and unknown or malformed snapshot metadata", () => {
  const r = result();
  for (const bad of [
    { ...r, findings: [{ ...r.findings[0], title: "题".repeat(301) }] },
    { ...r, snapshot: { ...r.snapshot, unknown: true } },
    { ...r, snapshot: { ...r.snapshot, source: "remote" } },
    {
      ...r,
      snapshot: {
        ...r.snapshot,
        origin: { kind: "txt_file", addedAt: "invalid", encoding: "GBK" },
      },
    },
  ])
    expect(validateGemini(bad)).toBe(false);
});
