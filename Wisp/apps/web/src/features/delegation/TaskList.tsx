import { summonFromResult } from "../../domain/continuation";
import { SourceInfo } from "../../shared/SourceInfo";
import { WatchList } from "./WatchPanel";
import { useWatches } from "../../services/watch-runtime";
import { useState } from "react";
import { roles, pendingTask, taskLabels, type Task } from "../../domain/task";
import {
  useTasks,
  updateTask,
  recoverTasks,
  retryBatchTaskSave,
} from "../../services/task-runtime";
import { useDocuments, useInteraction } from "../../state/stores";
import { snapshot } from "../../domain/model";
import { ProcessingResult } from "../check/CheckPanel";
import { isBatchTask } from "../../domain/task";
import { isBatchRecord, batchContinuationDraft } from "../../domain/batch";
import { BatchSources } from "../batch/BatchResult";
import { openBatchDraft, prepareBatchAgain } from "../batch/actions";
export function prepareAgain(task: Task) {
  if (isBatchTask(task)) {
    prepareBatchAgain(task, "summon", task.familiar);
    return;
  }
  const current = useDocuments
    .getState()
    .materials.find((m) => m.id === task.snapshot.materialId);
  if (current)
    useInteraction.setState({
      book: false,
      draft: {
        entry: "summon",
        execution: task.execution ?? "local",
        snapshot: snapshot(current),
        instruction: task.instruction,
        familiar: task.familiar,
        ...(task.familiar === "page_sprite"
          ? task.execution === "gemini"
            ? { summaryStyle: task.summaryStyle ?? "standard" }
            : { excerptLimit: task.excerptLimit ?? 8 }
          : {}),
      },
    });
}
export function TaskList() {
  const tasks = useTasks((s) => s.tasks);
  const runtimeError = useTasks((s) => s.error);
  const ready = useTasks((s) => s.ready);
  const pendingSaves = useTasks((s) => s.pendingSaves);
  const materials = useDocuments((s) => s.materials);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const task = tasks.find((t) => t.id === selected);
  async function action(t: Task, type: "cancel" | "archive" | "read") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await updateTask(t.id, { type });
      if (type === "read") setSelected(t.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Task action failed");
    } finally {
      setBusy(false);
    }
  }
  if (task?.result)
    return (
      <>
        <p>
          {roles[task.familiar].name} ·{" "}
          {task.watchId ? "Watch reply" : "One-time reply"}
          {task.archived ? " · Archived" : ""}
        </p>
        <ProcessingResult
          record={task.result}
          close={() => setSelected(undefined)}
          again={() => prepareAgain(task)}
          againLabel="Delegate current full text again"
          summon={() => {
            if (isBatchRecord(task.result!)) openBatchDraft(batchContinuationDraft(task.result!));
            else useInteraction.setState({
              book: false,
              draft: summonFromResult(task.result!),
            });
          }}
        />
      </>
    );
  return (
    <div>
      <WatchList />
      <p>One-time delegation. Refresh restores records only; unfinished tasks are not rerun automatically.</p>
      {(error || runtimeError) && (
        <p role="alert" className="error">
          {error || runtimeError}
          <button onClick={() => void recoverTasks()}>Refresh task records</button>
        </p>
      )}
      {!ready && !runtimeError && <p>Loading tasks…</p>}
      {ready && tasks.length === 0 && <p>No delegated tasks yet.</p>}
      {tasks.map((t) => (
        <section key={t.id} className="scope" data-testid="task-card">
          <h3>{roles[t.familiar].name}</h3>
          <strong>{isBatchTask(t) ? "Multi-material · " + t.snapshots.map((s) => s.title).join(" + ") : t.snapshot.title}</strong>
          <p>
            {t.execution === "gemini"
              ? "Gemini · Runs while the page is open"
              : "Local rules/templates"}
          </p>
          {t.watchId && <p>Continuous watch check · {t.watchId}</p>}
          <p>
            {isBatchTask(t) ? `${t.snapshots.length} independent materials` : `Version ${t.snapshot.materialVersion}`} · {taskLabels[t.status]}
            {t.unread ? " · Unread reply" : ""}
            {t.archived ? " · Archived" : ""}
          </p>
          {t.error && <p className="error">{t.error}</p>}
          {pendingSaves[t.id] && <p className="error" role="alert">Model processing finished, but the reply is not saved. {pendingSaves[t.id]} Closing or refreshing will lose the unsaved reply.</p>}
          <details>
            <summary>View delegation scope</summary>
            {isBatchTask(t) ? <BatchSources snapshots={t.snapshots} /> : <><SourceInfo value={t.snapshot} /><pre>{t.snapshot.text}</pre></>}
            <p>
              {t.execution === "gemini" ? "Delegation instruction: " : "Instruction (record only): "}
              {t.instruction || "None"}
            </p>
          </details>
          <div className="panel-actions">
            {pendingSaves[t.id] && <button disabled={busy} onClick={async () => {
              setBusy(true);
              setError("");
              try { await retryBatchTaskSave(t.id); }
              catch (e) { setError(e instanceof Error ? e.message : "Could not save reply. Please retry."); }
              finally { setBusy(false); }
            }}>Retry saving reply</button>}
            {pendingTask(t) && (
              <button disabled={busy} onClick={() => void action(t, "cancel")}>
                Recall task
              </button>
            )}
            {t.result && (
              <button disabled={busy} onClick={() => void action(t, "read")}>
                View reply
              </button>
            )}
            {!pendingTask(t) && !t.archived && (
              <button disabled={busy} onClick={() => void action(t, "archive")}>
                Archive record
              </button>
            )}
            {!pendingTask(t) && (
              <button
                disabled={
                  busy || (isBatchTask(t) ? t.snapshots.some((s) => !materials.some((m) => m.id === s.materialId)) : !materials.some((m) => m.id === t.snapshot.materialId))
                }
                onClick={() => prepareAgain(t)}
              >
                {isBatchTask(t) ? "Confirm current materials again" : "Delegate current full text again"}
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
export function TaskMarker() {
  const hasDraft = useInteraction((s) => !!(s.draft || s.batchDraft));
  const watched = useWatches(
    (s) => s.watches.filter((w) => w.status === "active").length,
  );
  const tasks = useTasks((s) => s.tasks);
  const error = useTasks((s) => s.error);
  const ready = useTasks((s) => s.ready);
  const active = tasks.filter(pendingTask).length;
  const unread = tasks.filter((t) => t.unread && !t.archived).length;
  const attention = tasks.filter(
    (t) => !t.archived && (t.status === "failed" || t.status === "interrupted"),
  ).length;
  return (
    <aside className="familiar-marker" aria-label="Familiar task status">
      <span aria-hidden="true">✉</span>
      <strong>Familiar tasks</strong>
      <small role="status">
        {error
          ? "Could not load task records"
          : !ready
            ? "Loading tasks…"
            : active + " active · " + unread + " unread"}
      </small>
      <small>{watched} watched</small>
      {attention > 0 && <small>Needs attention: {attention}</small>}
      <button
        disabled={hasDraft}
        title={hasDraft ? "Close the current panel before viewing familiar tasks" : undefined}
        onClick={() =>
          useInteraction.setState({
            book: true,
            bookTab: "Familiars",
            menu: false,
          })
        }
      >
        View familiar tasks
      </button>
    </aside>
  );
}
