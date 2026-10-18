import type {
  ActionDraft,
  ExcerptLimit,
  Familiar,
  MaterialSnapshot,
  Operation,
  SummaryStyle,
} from "./model";
import {
  validateProcessing,
  sameValue,
  type ProcessingRecord,
} from "./processing";
import { isBatchRecord, validateBatch, validBatchSnapshots, type BatchDraft, type BatchRecord } from "./batch";
export const roles: Record<Familiar, { name: string; operation: Operation }> = {
  scout_bat: { name: "Scout Bat · Reading Bat", operation: "check" },
  page_sprite: { name: "Page Sprite · Page Spirit", operation: "understand" },
  alchemy_imp: { name: "Alchemy Imp · Alchemy Spirit", operation: "create" },
};
export const taskLabels = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};
export interface SingleTask {
  scope?: undefined;
  execution?: "local" | "gemini";
  watchId?: string;
  summaryStyle?: SummaryStyle;
  excerptLimit?: ExcerptLimit;
  id: string;
  snapshot: MaterialSnapshot;
  instruction: string;
  familiar: Familiar;
  operation: Operation;
  status: keyof typeof taskLabels;
  createdAt: string;
  updatedAt: string;
  unread: boolean;
  archived: boolean;
  error?: string;
  result?: ProcessingRecord;
}
export interface BatchTask extends Omit<SingleTask, "scope" | "snapshot" | "result" | "execution" | "watchId" | "excerptLimit"> {
  scope: "batch";
  execution: "gemini";
  snapshots: MaterialSnapshot[];
  result?: BatchRecord;
  watchId?: never;
  excerptLimit?: never;
}
export type Task = SingleTask | BatchTask;
export const isBatchTask = (t: Task): t is BatchTask => t.scope === "batch";
export const pendingTask = (t: Task) =>
  t.status === "queued" || t.status === "running";
export function newTask(d: ActionDraft): SingleTask {
  if (d.entry !== "summon") throw new Error("Confirm the familiar delegation first");
  if (!d.snapshot.text.trim() || d.snapshot.text.length > 60000)
    throw new Error("Material must be non-empty and no longer than 60,000 UTF-16 code units");
  if (!Object.hasOwn(roles, d.familiar)) throw new Error("Unknown familiar");
  if (d.execution === "gemini" && "watchId" in d)
    throw new Error("Gemini supports one-off tasks only");
  if (
    d.summaryStyle !== undefined &&
    (d.execution !== "gemini" ||
      d.familiar !== "page_sprite" ||
      !["brief", "standard"].includes(d.summaryStyle))
  )
    throw new Error("Summary options do not apply to this operation");
  if (d.execution === "gemini" && d.instruction.length > 4000)
    throw new Error("Additional instructions are limited to 4,000 UTF-16 code units");
  return {
    execution: d.execution ?? "local",
    excerptLimit:
      d.familiar === "page_sprite" && d.execution !== "gemini"
        ? (d.excerptLimit ?? 8)
        : undefined,
    summaryStyle:
      d.familiar === "page_sprite" && d.execution === "gemini"
        ? (d.summaryStyle ?? "standard")
        : undefined,
    id: "task-" + d.snapshot.id,
    snapshot: { ...d.snapshot },
    instruction: d.instruction,
    familiar: d.familiar,
    operation: roles[d.familiar].operation,
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    unread: false,
    archived: false,
  };
}
export function newBatchTask(d: BatchDraft): BatchTask {
  if (d.entry !== "summon") throw new Error("Confirm the familiar delegation first");
  if (typeof d.id !== "string" || !d.id.trim() || d.id.length > 200)
    throw new Error("Invalid multi-material submission identifier");
  if (!Object.hasOwn(roles, d.familiar)) throw new Error("Unknown familiar");
  const now = new Date().toISOString();
  const task: BatchTask = {
    id: "task-" + d.id, scope: "batch", execution: "gemini",
    snapshots: structuredClone(d.snapshots), instruction: d.instruction,
    familiar: d.familiar, operation: roles[d.familiar].operation,
    ...(d.familiar === "page_sprite" ? { summaryStyle: d.summaryStyle ?? "standard" } : {}),
    status: "queued", createdAt: now, updatedAt: now, unread: false, archived: false,
  };
  if ((d.summaryStyle !== undefined && d.familiar !== "page_sprite") || "watchId" in d || !validBatchTask(task))
    throw new Error("Invalid multi-material delegation scope or parameters: provide 2–12 independent materials, up to 60,000 UTF-16 code units total and 4,000 additional code units.");
  return task;
}
export type TaskAction =
  | { type: "start" | "cancel" | "interrupt" | "read" | "archive" }
  | { type: "complete"; result: ProcessingRecord | BatchRecord }
  | { type: "fail"; error: string };
export function transition(t: SingleTask, a: TaskAction): SingleTask;
export function transition(t: BatchTask, a: TaskAction): BatchTask;
export function transition(t: Task, a: TaskAction): Task;
export function transition(t: Task, a: TaskAction): Task {
  const next = { ...t, updatedAt: new Date().toISOString() };
  if (a.type === "read") return { ...next, unread: false };
  if (a.type === "archive")
    return pendingTask(t) ? t : { ...next, archived: true, unread: false };
  if (!pendingTask(t)) return t;
  if (a.type === "start")
    return t.status === "queued" ? { ...next, status: "running" } : t;
  if (a.type === "cancel")
    return { ...next, status: "cancelled", unread: false };
  if (a.type === "interrupt")
    return {
      ...next,
      status: "interrupted",
      error: "Page execution ended before the task completed. Confirm again before delegating.",
    };
  if (a.type === "fail")
    return { ...next, status: "failed", error: a.error, unread: false };
  if (a.type !== "complete") return t;
  if (t.status !== "running") throw new Error("The task has not started");
  if (isBatchTask(t)) {
    if (!validBatchTask(t) || !validateBatch(a.result) || t.id !== "task-" + a.result.id ||
      a.result.operation !== t.operation || a.result.instruction !== t.instruction ||
      !sameValue(a.result.snapshots, t.snapshots) ||
      (a.result.operation === "understand" && a.result.summaryStyle !== t.summaryStyle))
      throw new Error("The reply is not bound to the task materials");
    return { ...t, updatedAt: next.updatedAt, status: "completed", result: a.result, unread: true };
  }
  if (
    isBatchRecord(a.result) ||
    (t.execution === "gemini") !== (a.result.execution === "gemini") ||
    (t.execution === "gemini" && !validGeminiTask(t)) ||
    a.result.operation !== t.operation ||
    (a.result.operation === "understand" &&
      (a.result.execution === "gemini"
        ? a.result.summaryStyle !== t.summaryStyle
        : (a.result.excerptLimit ?? 8) !== (t.excerptLimit ?? 8))) ||
    a.result.instruction !== t.instruction ||
    !sameValue(a.result.snapshot, t.snapshot) ||
    !validateProcessing(a.result)
  )
    throw new Error("The reply is not bound to the task materials");
  return { ...t, updatedAt: next.updatedAt, status: "completed", result: a.result, unread: true };
}

export function validGeminiTask(t: Task): boolean {
  return (
    !isBatchTask(t) &&
    t.execution === "gemini" &&
    t.watchId === undefined &&
    Object.hasOwn(roles, t.familiar) &&
    roles[t.familiar].operation === t.operation &&
    t.excerptLimit === undefined &&
    (t.operation === "understand"
      ? t.summaryStyle === "brief" || t.summaryStyle === "standard"
      : t.summaryStyle === undefined)
  );
}
export function validBatchTask(t: Task): t is BatchTask {
  return isBatchTask(t) && t.execution === "gemini" && t.watchId === undefined &&
    !("snapshot" in t) && t.excerptLimit === undefined &&
    typeof t.id === "string" && t.id.startsWith("task-") && !!t.id.slice(5).trim() && t.id.length <= 205 &&
    typeof t.instruction === "string" && t.instruction.length <= 4000 &&
    validBatchSnapshots(t.snapshots) && Object.hasOwn(roles, t.familiar) && roles[t.familiar].operation === t.operation &&
    (t.operation === "understand" ? t.summaryStyle === "brief" || t.summaryStyle === "standard" : t.summaryStyle === undefined);
}
