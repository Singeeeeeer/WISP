import { afterEach, expect, it, vi } from "vitest";
import { snapshot, seeds } from "../src/domain/model";
import * as transport from "../src/services/gemini-check";
afterEach(() => vi.unstubAllGlobals());
it("provides operation-aware submission alongside the existing Check wrapper", () => {
  expect((transport as any).requestGemini).toBeTypeOf("function");
  expect((transport as any).createGeminiSubmission).toBeTypeOf("function");
});
it("sends only operation options and binds returned style; retries saving without repeating a paid request", async () => {
  const s = snapshot({ ...seeds()[0], text: "时间待定" });
  const r = {
    id: s.id,
    snapshot: s,
    instruction: "摘要",
    operation: "understand",
    status: "completed",
    execution: "gemini",
    schemaVersion: "gemini-understand-1",
    summaryStyle: "brief",
    outcome: "ready",
    summary: "时间未定",
    summaryEvidence: [{ start: 0, end: 4, quote: "时间待定" }],
    keyPoints: [],
    missingInformation: [],
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "mock",
      promptVersion: "mock",
      validatorVersion: "mock",
      durationMs: 1,
    },
  };
  const f = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(r))));
  vi.stubGlobal("fetch", f);
  const options = { operation: "understand", summaryStyle: "brief" };
  const save = vi
    .fn()
    .mockRejectedValueOnce(Error("disk"))
    .mockResolvedValue(r);
  const submission = (transport as any).createGeminiSubmission(
    s,
    "摘要",
    options,
    save,
  );
  await expect(submission.run()).rejects.toThrow("disk");
  expect(submission.hasResult()).toBe(true);
  expect(await submission.run()).toEqual(r);
  expect(f).toHaveBeenCalledTimes(1);
  expect(f.mock.calls[0][0]).toBe("/api/understand");
  expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
    snapshot: s,
    instruction: "摘要",
    summaryStyle: "brief",
  });
  await expect(
    (transport as any).requestGemini(s, "摘要", {
      operation: "understand",
      summaryStyle: "standard",
    }),
  ).rejects.toThrow("绑定");
  await expect(
    (transport as any).requestGemini(s, "摘要", { operation: "create" }),
  ).rejects.toThrow("绑定");
  const previous = f.mock.calls.length;
  await expect(
    (transport as any).requestGemini(s, "摘要", {
      operation: "create",
      summaryStyle: "brief",
    }),
  ).rejects.toThrow();
  expect(f.mock.calls.length).toBe(previous);
});
