import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRepository } from "../src/services/repository";
import { newBatchTask } from "../src/domain/task";
import { batchDraft, batchResult } from "./batch-fixtures";

let held: Set<string>;
beforeEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/services/repository");
  vi.stubGlobal("BroadcastChannel", undefined);
  held = new Set<string>();
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        name: string,
        _options: unknown,
        callback: (lock: unknown) => Promise<void>,
      ) => {
        if (held.has(name)) return callback(null);
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          held.delete(name);
        }
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it("dispatches each familiar through a single batch request and saves one bound reply", async () => {
  const runtime = await import("../src/services/task-runtime");
  for (const operation of ["understand", "check", "create"] as const) {
    const result = batchResult(operation),
      draft = batchDraft(result);
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", fetcher);
    await runtime.submitBatchTask(draft);
    await vi.waitFor(() =>
      expect(
        runtime.useTasks
          .getState()
          .tasks.find((t) => t.id === "task-" + draft.id),
      ).toMatchObject({ status: "completed", result }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/batch/" + operation);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).id).toBe(result.id);
    await runtime.submitBatchTask(draft);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it("uses the Web Lock to reject duplicate dispatch and makes recall win over an ignored abort", async () => {
  const runtime = await import("../src/services/task-runtime"),
    result = batchResult(),
    draft = batchDraft(result);
  let respond!: (r: Response) => void;
  const fetcher = vi.fn(
    (_url, _init) =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  await runtime.submitBatchTask(draft);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await expect(runtime.submitBatchTask(draft)).rejects.toThrow("already being submitted or processed");
  await runtime.updateTask("task-" + draft.id, { type: "cancel" });
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  respond(new Response(JSON.stringify(result)));
  await vi.waitFor(() =>
    expect(
      runtime.useTasks.getState().tasks.find((t) => t.id === "task-" + draft.id)
        ?.status,
    ).toBe("cancelled"),
  );
  expect(
    runtime.useTasks.getState().tasks.find((t) => t.id === "task-" + draft.id)
      ?.result,
  ).toBeUndefined();
});
it("recovers an orphaned batch as interrupted without invoking the model", async () => {
  const repo = createRepository(),
    task = newBatchTask(batchDraft());
  await repo.enqueueTask(task);
  await repo.changeTask(task.id, { type: "start" });
  const runtime = await import("../src/services/task-runtime"),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await runtime.recoverTasks();
  expect(
    runtime.useTasks.getState().tasks.find((t) => t.id === task.id),
  ).toMatchObject({ status: "interrupted" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("holds the lock on save failure and retries only saving the same reply, including repeated storage errors", async () => {
  const repo = createRepository("batch-save-retry-" + crypto.randomUUID());
  let failures = 2;
  const changeTask = vi.fn(
    async (...args: Parameters<typeof repo.changeTask>) => {
      if (args[1].type === "complete" && failures-- > 0)
        throw Error("disk failure");
      return repo.changeTask(...args);
    },
  );
  vi.doMock("../src/services/repository", () => ({
    createRepository: () => ({ ...repo, changeTask }),
  }));
  const runtime = await import("../src/services/task-runtime"),
    result = batchResult(),
    draft = batchDraft(result),
    id = "task-" + draft.id;
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(result)));
  vi.stubGlobal("fetch", fetcher);
  await runtime.submitBatchTask(draft);
  await vi.waitFor(() =>
    expect(runtime.useTasks.getState().pendingSaves[id]).toContain(
      "disk failure",
    ),
  );
  expect(held.has("wisp-task:" + id)).toBe(true);
  expect((await repo.listTasks())[0]).toMatchObject({
    status: "running",
    unread: false,
  });
  expect((await repo.listTasks())[0].result).toBeUndefined();
  await runtime.recoverTasks();
  expect((await repo.listTasks())[0].status).toBe("running");
  await expect(runtime.retryBatchTaskSave(id)).rejects.toThrow("disk failure");
  expect(runtime.useTasks.getState().pendingSaves[id]).toContain("retry saving only");
  await runtime.retryBatchTaskSave(id);
  await vi.waitFor(() => expect(held.has("wisp-task:" + id)).toBe(false));
  expect((await repo.listTasks())[0]).toMatchObject({
    status: "completed",
    unread: true,
    result,
  });
  expect(runtime.useTasks.getState().pendingSaves[id]).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    changeTask.mock.calls.filter(([, action]) => action.type === "complete"),
  ).toHaveLength(3);
});
it("recalling a pending-save task drops its cached reply and releases the lock without a retry", async () => {
  const repo = createRepository("batch-save-cancel-" + crypto.randomUUID());
  const changeTask = vi.fn(
    async (...args: Parameters<typeof repo.changeTask>) => {
      if (args[1].type === "complete") throw Error("disk failure");
      return repo.changeTask(...args);
    },
  );
  vi.doMock("../src/services/repository", () => ({
    createRepository: () => ({ ...repo, changeTask }),
  }));
  const runtime = await import("../src/services/task-runtime"),
    result = batchResult(),
    draft = batchDraft(result),
    id = "task-" + draft.id;
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(result)));
  vi.stubGlobal("fetch", fetcher);
  await runtime.submitBatchTask(draft);
  await vi.waitFor(() =>
    expect(runtime.useTasks.getState().pendingSaves[id]).toContain(
      "disk failure",
    ),
  );
  await runtime.updateTask(id, { type: "cancel" });
  await vi.waitFor(() => expect(held.has("wisp-task:" + id)).toBe(false));
  expect(runtime.useTasks.getState().pendingSaves[id]).toBeUndefined();
  expect((await repo.listTasks())[0]).toMatchObject({
    status: "cancelled",
    unread: false,
  });
  expect((await repo.listTasks())[0].result).toBeUndefined();
  await expect(runtime.retryBatchTaskSave(id)).rejects.toThrow("No unsaved multi-material reply");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    changeTask.mock.calls.filter(([, action]) => action.type === "complete"),
  ).toHaveLength(1);
});
