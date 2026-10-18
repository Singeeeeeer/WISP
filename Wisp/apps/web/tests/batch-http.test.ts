import { afterEach, expect, it, vi } from "vitest";
import {
  createBatchSubmission,
  requestBatchGemini,
} from "../src/services/batch";
import { batchResult } from "./batch-fixtures";
afterEach(() => vi.unstubAllGlobals());
it("submits independently ordered snapshots and options to each batch operation", async () => {
  for (const operation of ["understand", "check", "create"] as const) {
    const r = batchResult(operation);
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(r)));
    vi.stubGlobal("fetch", f);
    const options =
      operation === "understand"
        ? { operation, summaryStyle: "standard" as const }
        : { operation };
    expect(
      await requestBatchGemini(r.id, r.snapshots, r.instruction, options),
    ).toEqual(r);
    expect(f.mock.calls[0][0]).toBe("/api/batch/" + operation);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      id: r.id,
      snapshots: r.snapshots,
      instruction: r.instruction,
      ...(operation === "understand" ? { summaryStyle: "standard" } : {}),
    });
  }
});
it("retries saving the validated cached result without repeating a model call or changing confirmed input", async () => {
  const r = batchResult("understand"),
    snapshots = structuredClone(r.snapshots);
  const f = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(r))));
  vi.stubGlobal("fetch", f);
  const save = vi
    .fn()
    .mockRejectedValueOnce(Error("disk unavailable"))
    .mockResolvedValue(r);
  const submission = createBatchSubmission(
    r.id,
    snapshots,
    r.instruction,
    { operation: "understand", summaryStyle: "standard" },
    save,
  );
  snapshots[0] = { ...snapshots[0], text: "mutated caller text" };
  await expect(submission.run()).rejects.toThrow("disk unavailable");
  expect(submission.hasResult()).toBe(true);
  expect(await submission.run()).toEqual(r);
  expect(save).toHaveBeenCalledTimes(2);
  expect(f).toHaveBeenCalledTimes(1);
  expect(JSON.parse(f.mock.calls[0][1].body).snapshots).toEqual(r.snapshots);
});
it("coalesces concurrent submissions into the same request and save", async () => {
  const r = batchResult("understand"),
    f = vi.fn().mockResolvedValue(new Response(JSON.stringify(r))),
    save = vi.fn().mockResolvedValue(r);
  vi.stubGlobal("fetch", f);
  const submission = createBatchSubmission(
    r.id,
    r.snapshots,
    r.instruction,
    { operation: "understand", summaryStyle: "standard" },
    save,
  );
  const first = submission.run(),
    second = submission.run();
  expect(first).toBe(second);
  await first;
  expect(f).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
});
it("rejects foreign scope, IDs, sources, instruction, operation or summary style before save", async () => {
  const r = batchResult("understand");
  for (const bad of [
    { ...r, id: "foreign" },
    { ...r, instruction: "foreign" },
    { ...r, summaryStyle: "brief" },
    {
      ...r,
      snapshots: r.snapshots.map((s) => ({
        ...s,
        capturedAt: "2026-01-02T00:00:00Z",
      })),
    },
    { ...r, scope: undefined, snapshot: r.snapshots[0] },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(bad))),
    );
    const save = vi.fn();
    const submission = createBatchSubmission(
      r.id,
      r.snapshots,
      r.instruction,
      { operation: "understand", summaryStyle: "standard" },
      save,
    );
    await expect(submission.run()).rejects.toThrow("绑定");
    expect(save).not.toHaveBeenCalled();
    expect(submission.hasResult()).toBe(false);
  }
});
it("does not make a network request for invalid batch authorization", async () => {
  const r = batchResult(),
    f = vi.fn();
  vi.stubGlobal("fetch", f);
  await expect(
    requestBatchGemini(r.id, [r.snapshots[0]], r.instruction, {
      operation: "check",
    }),
  ).rejects.toThrow("2～12");
  await expect(
    requestBatchGemini(r.id, r.snapshots, r.instruction, {
      operation: "check",
      summaryStyle: "brief",
    } as never),
  ).rejects.toThrow("参数");
  expect(f).not.toHaveBeenCalled();
});
it("isolates an aborted request even when the mocked transport ignores cancellation and responds late", async () => {
  const r = batchResult("understand"),
    controller = new AbortController();
  let respond!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    ),
  );
  const save = vi.fn(),
    submission = createBatchSubmission(
      r.id,
      r.snapshots,
      r.instruction,
      { operation: "understand", summaryStyle: "standard" },
      save,
    );
  const running = submission.run(controller.signal);
  controller.abort();
  respond(new Response(JSON.stringify(r)));
  await expect(running).rejects.toThrow("迟到");
  expect(save).not.toHaveBeenCalled();
  expect(submission.hasResult()).toBe(false);
});
