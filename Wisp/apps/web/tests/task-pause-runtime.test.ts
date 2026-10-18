import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRepository } from "../src/services/repository";
import { runLocal } from "../src/domain/local-text";
import { seeds, snapshot } from "../src/domain/model";
import type { SingleTask } from "../src/domain/task";
import { newWatch, watchTask } from "../src/domain/watch";
import { batchDraft, batchResult } from "./batch-fixtures";

let repo: ReturnType<typeof createRepository>;
let held: Set<string>;
beforeEach(() => {
  vi.resetModules();
  repo = createRepository("pause-runtime-" + crypto.randomUUID());
  vi.doMock("../src/services/repository", () => ({
    createRepository: () => repo,
  }));
  vi.stubGlobal("BroadcastChannel", undefined);
  held = new Set();
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("../src/services/repository");
});

it("notifies task observers only after the watch and in-flight task are both paused", async () => {
  vi.doUnmock("../src/services/repository");
  vi.stubGlobal("window", new EventTarget());
  const notifications: string[] = [];
  let observeCommit = () => {};
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor(private name: string) {}
      postMessage(message: unknown) {
        if (this.name === "wisp-local-tasks" && message === "changed") {
          notifications.push(this.name);
          observeCommit();
        }
      }
    },
  );
  const { createRepository: freshRepository } =
    await import("../src/services/repository");
  const storage = freshRepository("watch-pause-notify-" + crypto.randomUUID());
  const [material] = await storage.initialize();
  const watch = newWatch(snapshot(material));
  await storage.startWatch(watch);
  const next = { ...material, version: 2, text: "A saved version to check" };
  await storage.saveMaterial(next, 1);
  const task = watchTask(watch, next);
  await storage.enqueueWatchTask(task);
  await storage.changeTask(task.id, { type: "start" });
  let notifiedState: Promise<unknown> | undefined;
  observeCommit = () => {
    notifiedState = Promise.all([storage.listWatches(), storage.listTasks()]);
  };
  await storage.pauseWatch(watch.id);
  expect(notifications).toEqual(["wisp-local-tasks"]);
  expect(await notifiedState).toMatchObject([
    [{ id: watch.id, status: "paused" }],
    [{ id: task.id, status: "paused" }],
  ]);
});

it("aborts a paused model request, blocks overlap and continues the same batch submission", async () => {
  const runtime = await import("../src/services/task-runtime");
  const result = batchResult(),
    draft = batchDraft(result),
    id = "task-" + draft.id;
  const replies: ((response: Response) => void)[] = [];
  const fetcher = vi.fn(
    (_url: string, _options: RequestInit) =>
      new Promise<Response>((resolve) => replies.push(resolve)),
  );
  vi.stubGlobal("fetch", fetcher);
  await runtime.submitBatchTask(draft);
  await vi.waitFor(() => expect(replies).toHaveLength(1));
  await runtime.updateTask(id, { type: "pause" });
  expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
  await expect(runtime.resumeTask(id)).rejects.toThrow("still stopping");
  expect(replies).toHaveLength(1);
  replies[0](new Response(JSON.stringify(result)));
  await vi.waitFor(() => expect(held.has("wisp-task:" + id)).toBe(false));
  expect((await repo.listTasks())[0]).toMatchObject({
    id,
    status: "paused",
    unread: false,
  });
  expect((await repo.listTasks())[0].result).toBeUndefined();
  await runtime.recoverTasks();
  expect((await repo.listTasks())[0].status).toBe("paused");
  await runtime.resumeTask(id);
  await vi.waitFor(() => expect(replies).toHaveLength(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body as string).id).toBe(
    result.id,
  );
  replies[1](new Response(JSON.stringify(result)));
  await vi.waitFor(() =>
    expect(runtime.useTasks.getState().tasks[0]).toMatchObject({
      id,
      status: "completed",
      result,
      unread: true,
    }),
  );
  expect(await repo.listTasks()).toHaveLength(1);
});

it("continues a paused unsaved reply by saving only, without another model request", async () => {
  let fail = true;
  const original = repo.changeTask;
  repo.changeTask = async (...args) => {
    if (args[1].type === "complete" && fail) throw new Error("disk failure");
    return original(...args);
  };
  const runtime = await import("../src/services/task-runtime");
  const result = batchResult(),
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
  await runtime.updateTask(id, { type: "pause" });
  expect((await repo.listTasks())[0].status).toBe("paused");
  expect(held.has("wisp-task:" + id)).toBe(true);
  expect(runtime.useTasks.getState().pendingSaves[id]).toContain(
    "disk failure",
  );
  fail = false;
  await runtime.resumeTask(id);
  await vi.waitFor(() => expect(held.has("wisp-task:" + id)).toBe(false));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await repo.listTasks())[0]).toMatchObject({
    id,
    status: "completed",
    result,
  });
  expect(runtime.useTasks.getState().pendingSaves[id]).toBeUndefined();
});

it("terminates local work and ignores a late worker reply before restarting the same task", async () => {
  const workers: {
    onmessage?: (event: { data: unknown }) => void;
    task?: SingleTask;
    terminate: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "Worker",
    class {
      onmessage?: (event: { data: unknown }) => void;
      task?: SingleTask;
      terminate = vi.fn();
      constructor() {
        workers.push(this);
      }
      postMessage(task: SingleTask) {
        this.task = task;
      }
    },
  );
  const runtime = await import("../src/services/task-runtime");
  const draft = {
    entry: "summon" as const,
    familiar: "page_sprite" as const,
    snapshot: snapshot(seeds()[0]),
    instruction: "",
  };
  const id = "task-" + draft.snapshot.id;
  await runtime.submitTask(draft);
  await vi.waitFor(() => expect(workers).toHaveLength(1));
  await runtime.updateTask(id, { type: "pause" });
  expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  const first = workers[0].task!;
  workers[0].onmessage?.({
    data: {
      result: runLocal(first.operation, first.snapshot, first.instruction),
    },
  });
  await vi.waitFor(() => expect(held.has("wisp-task:" + id)).toBe(false));
  await runtime.resumeTask(id);
  await vi.waitFor(() => expect(workers).toHaveLength(2));
  expect(workers[1].task?.id).toBe(id);
  const next = workers[1].task!;
  workers[1].onmessage?.({
    data: { result: runLocal(next.operation, next.snapshot, next.instruction) },
  });
  await vi.waitFor(() =>
    expect(runtime.useTasks.getState().tasks[0]?.status).toBe("completed"),
  );
  expect(await repo.listTasks()).toHaveLength(1);
});

it("continues a paused watch on the same task before checking a newer saved version", async () => {
  const workers: {
    onmessage?: (event: { data: unknown }) => void;
    task?: SingleTask;
    terminate: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "Worker",
    class {
      onmessage?: (event: { data: unknown }) => void;
      task?: SingleTask;
      terminate = vi.fn();
      constructor() {
        workers.push(this);
      }
      postMessage(task: SingleTask) {
        this.task = task;
      }
    },
  );
  const [material] = await repo.initialize();
  const runtime = await import("../src/services/watch-runtime");
  await runtime.startWatching(snapshot(material));
  const watch = (await repo.listWatches())[0];
  const next = { ...material, version: 2, text: "Watch this saved revision" };
  await repo.saveMaterial(next, 1);
  await vi.waitFor(() => expect(workers).toHaveLength(1), { timeout: 4000 });
  const originalTask = workers[0].task!;
  await runtime.pauseWatching(watch.id);
  await vi.waitFor(() =>
    expect(held.has("wisp-watch:" + material.id)).toBe(false),
  );
  expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  expect((await repo.listTasks())[0]).toMatchObject({
    id: originalTask.id,
    status: "paused",
  });
  await repo.saveMaterial(
    { ...next, version: 3, text: "Saved while paused" },
    2,
  );
  await runtime.recoverWatches();
  expect((await repo.listWatches())[0].status).toBe("paused");
  expect(workers).toHaveLength(1);
  await runtime.resumeWatching(watch.id);
  await vi.waitFor(() => expect(workers).toHaveLength(2), { timeout: 3000 });
  expect(workers[1].task).toMatchObject({
    id: originalTask.id,
    snapshot: originalTask.snapshot,
  });
  workers[1].onmessage?.({
    data: {
      result: runLocal(
        originalTask.operation,
        originalTask.snapshot,
        originalTask.instruction,
      ),
    },
  });
  await vi.waitFor(() => expect(workers).toHaveLength(3), { timeout: 4000 });
  const newerTask = workers[2].task!;
  expect(newerTask.snapshot.materialVersion).toBe(3);
  expect(newerTask.watchId).toBe(watch.id);
  await runtime.pauseWatching(watch.id);
  await runtime.stopWatching(watch.id);
  await vi.waitFor(() =>
    expect(held.has("wisp-watch:" + material.id)).toBe(false),
  );
  expect(await repo.listWatches()).toHaveLength(1);
  expect(await repo.listTasks()).toHaveLength(2);
  expect(
    (await repo.listTasks()).find((task) => task.id === newerTask.id)?.status,
  ).toBe("cancelled");
});

it("workspace reset aborts active work and prevents late completion writes", async () => {
  const events = new EventTarget();
  vi.stubGlobal("window", events);
  const runtime = await import("../src/services/task-runtime");
  const result = batchResult(),
    draft = batchDraft(result),
    id = "task-" + draft.id;
  let reply!: (response: Response) => void;
  const fetcher = vi.fn(
    (_url: string, _options: RequestInit) =>
      new Promise<Response>((resolve) => {
        reply = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const stop = runtime.observeTasks();
  await runtime.recoverTasks();
  await runtime.submitBatchTask(draft);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  events.dispatchEvent(new Event("wisp:workspace-reset"));
  expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
  reply(new Response(JSON.stringify(result)));
  await vi.waitFor(() => expect(held.has("wisp-task:" + id)).toBe(false));
  expect((await repo.listTasks())[0].result).toBeUndefined();
  await expect(runtime.resumeTask(id)).rejects.toThrow("workspace was reset");
  await expect(runtime.submitBatchTask(draft)).rejects.toThrow(
    "workspace was reset",
  );
  stop();
});
