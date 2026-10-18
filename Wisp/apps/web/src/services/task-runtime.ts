import { requestGemini } from "./gemini";
import { requestBatchGemini } from "./batch";
import type { BatchDraft, BatchRecord } from "../domain/batch";
import type { ProcessingRecord } from "../domain/processing";
import { create } from "zustand";
import { completedForProposal } from "./proposal-runtime";
import type { ActionDraft } from "../domain/model";
import {
  newTask,
  newBatchTask,
  isBatchTask,
  validBatchTask,
  validGeminiTask,
  pendingTask,
  type Task,
  type SingleTask,
  type TaskAction,
} from "../domain/task";
import type { LocalRecord } from "../domain/local-text";
import { createRepository } from "./repository";
const repository = createRepository();
export const useTasks = create<{
  tasks: Task[];
  ready: boolean;
  error: string;
  pendingSaves: Record<string, string>;
}>(() => ({ tasks: [], ready: false, error: "", pendingSaves: {} }));
const stops = new Map<string, () => void>();
const saveRetries = new Map<string, () => Promise<void>>();
const channel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("wisp-local-tasks");
const lockName = (id: string) => "wisp-task:" + id;
let generation = 0;
let workspaceReset = false;
async function refresh() {
  if (workspaceReset) return;
  const current = ++generation;
  const tasks = await repository.listTasks();
  if (current !== generation || workspaceReset) return;
  useTasks.setState({ tasks });
  for (const [id, stop] of stops) {
    const task = tasks.find((t) => t.id === id);
    // A reply already received stays in memory while paused; continuing saves it only.
    if (task?.status === "paused" && saveRetries.has(id)) continue;
    if (!task || !pendingTask(task)) stop();
  }
}
function report(error: unknown) {
  useTasks.setState({
    error:
      error instanceof Error
        ? error.message
        : "Task records are temporarily unavailable. Please try again.",
  });
}
async function changed() {
  await refresh();
  channel?.postMessage("changed");
}
function execute(task: Task): Promise<ProcessingRecord | BatchRecord> {
  if (isBatchTask(task)) {
    if (!validBatchTask(task))
      return Promise.reject(
        new Error(
          "The multi-material task scope or role parameters are invalid.",
        ),
      );
    const controller = new AbortController();
    stops.set(task.id, () => controller.abort());
    return requestBatchGemini(
      task.id.slice(5),
      task.snapshots,
      task.instruction,
      task.operation === "understand"
        ? { operation: "understand", summaryStyle: task.summaryStyle! }
        : { operation: task.operation },
      controller.signal,
    ).finally(() => stops.delete(task.id));
  }
  if (task.execution === "gemini") {
    if (!validGeminiTask(task))
      return Promise.reject(
        new Error(
          "Gemini supports only one-time tasks with matching roles and parameters.",
        ),
      );
    const controller = new AbortController();
    stops.set(task.id, () => controller.abort());
    return requestGemini(
      task.snapshot,
      task.instruction,
      task.operation === "understand"
        ? { operation: "understand", summaryStyle: task.summaryStyle! }
        : { operation: task.operation },
      controller.signal,
    ).finally(() => stops.delete(task.id));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./task.worker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    const done = (result?: LocalRecord, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stops.delete(task.id);
      worker.terminate();
      if (result) resolve(result);
      else reject(new Error(error ?? "Local task failed."));
    };
    const timeout = setTimeout(
      () =>
        done(undefined, "Local processing timed out. Delegate the task again."),
      30000,
    );
    stops.set(task.id, () => done(undefined, "Task recalled."));
    worker.onmessage = (
      e: MessageEvent<{ result?: LocalRecord; error?: string }>,
    ) => done(e.data.result, e.data.error);
    worker.onerror = () =>
      done(
        undefined,
        "Could not start or run local processing. Delegate the task again.",
      );
    worker.onmessageerror = () =>
      done(undefined, "Could not read the local reply.");
    try {
      worker.postMessage(task);
    } catch {
      done(undefined, "Could not send the material to local processing.");
    }
  });
}
// The dispatch Web Lock stays held until a validated reply is saved or recalled.
// Keep failed saves in this page only; a refresh recovers the stored running task
// as interrupted instead of repeating a model request automatically.
function saveBatchReply(id: string, result: BatchRecord): Promise<Task> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let attempt: Promise<void> | undefined;
    const clear = () => {
      saveRetries.delete(id);
      stops.delete(id);
      useTasks.setState((state) => {
        const pendingSaves = { ...state.pendingSaves };
        delete pendingSaves[id];
        return { pendingSaves };
      });
    };
    const retry = (): Promise<void> =>
      (attempt ??= (async () => {
        if (settled) return;
        let completed: Task;
        try {
          completed = await repository.changeTask(id, {
            type: "complete",
            result,
          });
        } catch (error) {
          if (settled) return;
          useTasks.setState((state) => ({
            pendingSaves: {
              ...state.pendingSaves,
              [id]:
                "Reply not saved: " +
                (error instanceof Error
                  ? error.message
                  : "Local storage is unavailable") +
                ". You can retry saving only. Reloading will discard the unsaved reply and interrupt the task.",
            },
          }));
          throw error;
        }
        if (settled) return;
        if (completed.status === "paused") {
          useTasks.setState((state) => ({
            pendingSaves: {
              ...state.pendingSaves,
              [id]: "Paused before the reply was saved. Continue to save this reply without running the model again. Reloading discards this unsaved reply.",
            },
          }));
          return;
        }
        settled = true;
        clear();
        resolve(completed);
      })().finally(() => {
        attempt = undefined;
      }));
    saveRetries.set(id, retry);
    stops.set(id, () => {
      if (settled) return;
      settled = true;
      clear();
      reject(new Error("Task recalled. The unsaved reply was discarded."));
    });
    void retry().catch(() => {});
  });
}
export async function retryBatchTaskSave(id: string): Promise<void> {
  const retry = saveRetries.get(id);
  if (!retry) throw new Error("No unsaved multi-material reply.");
  if (
    (await repository.listTasks()).find((task) => task.id === id)?.status ===
    "paused"
  ) {
    await repository.changeTask(id, { type: "resume" });
    await repository.changeTask(id, { type: "start" });
    await changed();
  }
  return retry();
}
/** Continue the same frozen task after its previous worker/request has stopped. */
export async function resumeTask(
  id: string,
  waitForCompletion = false,
): Promise<void> {
  if (workspaceReset)
    throw new Error("The workspace was reset. Reload before continuing tasks.");
  const cached = saveRetries.get(id);
  if (cached) return retryBatchTaskSave(id);
  if (!navigator.locks)
    throw new Error("This browser does not support local task locks.");
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(lockName(id), { ifAvailable: true }, async (lock) => {
        if (!lock)
          throw new Error(
            "The previous attempt is still stopping or holds an unsaved reply in another tab. Wait for it to stop, or save that reply there, then continue.",
          );
        const task = (await repository.listTasks()).find(
          (item) => item.id === id,
        );
        if (!task || task.status !== "paused")
          throw new Error("Only a paused task can be continued.");
        if (
          task.watchId &&
          !(await repository.listWatches()).some(
            (watch) => watch.id === task.watchId && watch.status === "active",
          )
        )
          throw new Error("Continue its watch before continuing this check.");
        const queued = await repository.changeTask(id, { type: "resume" });
        await changed();
        if (!waitForCompletion) resolve();
        await runTask(queued);
        resolve();
      })
      .catch((error) => {
        report(error);
        reject(error);
      });
  });
}
export function submitTask(draft: ActionDraft): Promise<void> {
  if (!navigator.locks)
    return Promise.reject(
      new Error(
        "This browser does not support local task locks. Use a browser that supports Web Locks.",
      ),
    );
  let task: Task;
  try {
    task = newTask(draft);
  } catch (e) {
    return Promise.reject(e);
  }
  return dispatchTask(task);
}
export function submitBatchTask(draft: BatchDraft): Promise<void> {
  if (!navigator.locks)
    return Promise.reject(
      new Error(
        "This browser does not support local task locks. Use a browser that supports Web Locks.",
      ),
    );
  try {
    return dispatchTask(newBatchTask(draft));
  } catch (e) {
    return Promise.reject(e);
  }
}
export function submitWatchTask(task: SingleTask): Promise<void> {
  return dispatchTask(task, true);
}
function dispatchTask(task: Task, waitForCompletion = false): Promise<void> {
  if (workspaceReset)
    return Promise.reject(
      new Error("The workspace was reset. Reload before submitting tasks."),
    );
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(lockName(task.id), { ifAvailable: true }, async (lock) => {
        if (!lock) {
          throw new Error(
            "This task is already being submitted or processed. Check the task log.",
          );
        }
        const saved =
          !isBatchTask(task) && task.watchId
            ? await repository.enqueueWatchTask(task)
            : await repository.enqueueTask(task);
        if (!saved) {
          resolve();
          return;
        }
        await changed();
        if (!waitForCompletion) resolve();
        if (saved.status !== "queued") {
          resolve();
          return;
        }
        await runTask(saved);
        resolve();
      })
      .catch((e) => {
        report(e);
        reject(e);
      });
  });
}
async function runTask(task: Task) {
  try {
    const running = await repository.changeTask(task.id, {
      type: "start",
    });
    await changed();
    if (
      workspaceReset ||
      running.status !== "running" ||
      useTasks.getState().tasks.find((item) => item.id === task.id)?.status !==
        "running"
    )
      return;
    const result = await execute(running);
    if (workspaceReset) return;
    if (
      (await repository.listTasks()).find((item) => item.id === task.id)
        ?.status !== "running"
    )
      return;
    const completed = isBatchTask(running)
      ? await saveBatchReply(task.id, result as BatchRecord)
      : await repository.changeTask(task.id, {
          type: "complete",
          result,
        });
    if (
      !task.watchId &&
      !isBatchTask(completed) &&
      completed.status === "completed" &&
      completed.result &&
      completed.result.execution !== "gemini"
    )
      completedForProposal(completed.result);
  } catch (e) {
    if (workspaceReset) return;
    await repository.changeTask(task.id, {
      type: "fail",
      error: e instanceof Error ? e.message : "Local processing failed.",
    });
  } finally {
    if (!workspaceReset) await changed();
  }
}
export async function updateTask(id: string, action: TaskAction) {
  await repository.changeTask(id, action);
  if (
    action.type === "cancel" ||
    action.type === "interrupt" ||
    (action.type === "pause" && !saveRetries.has(id))
  )
    stops.get(id)?.();
  await changed();
}
let recovering: Promise<void> | undefined;
export function recoverTasks() {
  return (recovering ??= (async () => {
    if (!navigator.locks)
      throw new Error(
        "This browser does not support local task locks, so familiar tasks cannot run.",
      );
    const tasks = await repository.listTasks();
    for (const t of tasks.filter(pendingTask))
      await navigator.locks.request(
        lockName(t.id),
        { ifAvailable: true },
        async (lock) => {
          if (lock) await repository.changeTask(t.id, { type: "interrupt" });
        },
      );
    await refresh();
    useTasks.setState({ ready: true, error: "" });
  })()
    .catch(report)
    .finally(() => {
      recovering = undefined;
    }));
}
export function observeTasks() {
  void recoverTasks();
  const listener = () => {
    void refresh().catch(report);
  };
  const focus = () => {
    void recoverTasks();
  };
  channel?.addEventListener("message", listener);
  window.addEventListener("focus", focus);
  // Poll stored state only; never schedules processing or calls a model.
  const timer = setInterval(focus, 2500);
  const reset = () => {
    workspaceReset = true;
    ++generation;
    clearInterval(timer);
    channel?.removeEventListener("message", listener);
    window.removeEventListener("focus", focus);
    for (const stop of stops.values()) stop();
  };
  window.addEventListener("wisp:workspace-reset", reset);
  return () => {
    channel?.removeEventListener("message", listener);
    window.removeEventListener("focus", focus);
    window.removeEventListener("wisp:workspace-reset", reset);
    clearInterval(timer);
  };
}
