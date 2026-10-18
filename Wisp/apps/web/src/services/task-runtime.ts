import { requestGemini } from "./gemini";
import type { ProcessingRecord } from "../domain/processing";
import { create } from "zustand";
import { completedForProposal } from "./proposal-runtime";
import type { ActionDraft } from "../domain/model";
import {
  newTask,
  validGeminiTask,
  pendingTask,
  type Task,
  type TaskAction,
} from "../domain/task";
import type { LocalRecord } from "../domain/local-text";
import { createRepository } from "./repository";
const repository = createRepository();
export const useTasks = create<{
  tasks: Task[];
  ready: boolean;
  error: string;
}>(() => ({ tasks: [], ready: false, error: "" }));
const stops = new Map<string, () => void>();
const channel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("wisp-local-tasks");
const lockName = (id: string) => "wisp-task:" + id;
let generation = 0;
async function refresh() {
  const current = ++generation;
  const tasks = await repository.listTasks();
  if (current !== generation) return;
  useTasks.setState({ tasks });
  for (const [id, stop] of stops)
    if (!tasks.some((t) => t.id === id && pendingTask(t))) stop();
}
function report(error: unknown) {
  useTasks.setState({
    error:
      error instanceof Error ? error.message : "任务记录暂时不可用，请重试。",
  });
}
async function changed() {
  await refresh();
  channel?.postMessage("changed");
}
function execute(task: Task): Promise<ProcessingRecord> {
  if (task.execution === "gemini") {
    if (!validGeminiTask(task))
      return Promise.reject(
        new Error("Gemini 仅支持角色与参数匹配的一次性任务"),
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
    const done = (result?: LocalRecord, error?: string) => {
      clearTimeout(timeout);
      stops.delete(task.id);
      worker.terminate();
      if (result) resolve(result);
      else reject(new Error(error ?? "本地任务失败"));
    };
    const timeout = setTimeout(
      () => done(undefined, "本地处理超时，请重新委托。"),
      30000,
    );
    stops.set(task.id, () => done(undefined, "任务已召回"));
    worker.onmessage = (
      e: MessageEvent<{ result?: LocalRecord; error?: string }>,
    ) => done(e.data.result, e.data.error);
    worker.onerror = () =>
      done(undefined, "本地处理线程启动或执行失败，请重新委托。");
    worker.onmessageerror = () => done(undefined, "无法读取本地回信。");
    try {
      worker.postMessage(task);
    } catch {
      done(undefined, "无法发送材料到本地处理线程。");
    }
  });
}
export function submitTask(draft: ActionDraft): Promise<void> {
  if (!navigator.locks)
    return Promise.reject(
      new Error("当前浏览器不支持本地任务锁，请使用支持 Web Locks 的浏览器。"),
    );
  let task: Task;
  try {
    task = newTask(draft);
  } catch (e) {
    return Promise.reject(e);
  }
  return dispatchTask(task);
}
export function submitWatchTask(task: Task): Promise<void> {
  return dispatchTask(task, true);
}
function dispatchTask(task: Task, waitForCompletion = false): Promise<void> {
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(lockName(task.id), { ifAvailable: true }, async (lock) => {
        if (!lock) {
          throw new Error("本次委托已在提交或执行中，请查看任务记录。");
        }
        const saved = task.watchId
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
        try {
          const running = await repository.changeTask(task.id, {
            type: "start",
          });
          await changed();
          if (running.status !== "running") return;
          const result = await execute(running);
          const completed = await repository.changeTask(task.id, {
            type: "complete",
            result,
          });
          if (
            !task.watchId &&
            completed.status === "completed" &&
            completed.result &&
            completed.result.execution !== "gemini"
          )
            completedForProposal(completed.result);
        } catch (e) {
          await repository.changeTask(task.id, {
            type: "fail",
            error: e instanceof Error ? e.message : "本地处理失败",
          });
        } finally {
          await changed();
          resolve();
        }
      })
      .catch((e) => {
        report(e);
        reject(e);
      });
  });
}
export async function updateTask(id: string, action: TaskAction) {
  await repository.changeTask(id, action);
  await changed();
}
let recovering: Promise<void> | undefined;
export function recoverTasks() {
  return (recovering ??= (async () => {
    if (!navigator.locks)
      throw new Error("当前浏览器不支持本地任务锁，无法执行使魔委托。");
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
  return () => {
    channel?.removeEventListener("message", listener);
    window.removeEventListener("focus", focus);
    clearInterval(timer);
  };
}
