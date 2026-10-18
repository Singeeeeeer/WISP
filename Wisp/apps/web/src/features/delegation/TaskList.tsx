import { summonFromResult } from "../../domain/continuation";
import { SourceInfo } from "../../shared/SourceInfo";
import { WatchList } from "./WatchPanel";
import {
  pauseWatching,
  resumeWatching,
  useWatches,
} from "../../services/watch-runtime";
import { useEffect, useState } from "react";
import { roles, pendingTask, taskLabels, type Task } from "../../domain/task";
import {
  useTasks,
  updateTask,
  recoverTasks,
  retryBatchTaskSave,
  resumeTask,
} from "../../services/task-runtime";
import { useDocuments, useInteraction } from "../../state/stores";
import { snapshot } from "../../domain/model";
import { ProcessingResult } from "../check/CheckPanel";
import { isBatchTask } from "../../domain/task";
import { isBatchRecord, batchContinuationDraft } from "../../domain/batch";
import { BatchSources } from "../batch/BatchResult";
import { openBatchDraft, prepareBatchAgain } from "../batch/actions";
import { FloatingPanel } from "../../shared/FloatingPanel";
import "./task-rail.css";
const familiarArt = {
  scout_bat: "bat_open.png",
  page_sprite: "book_open.png",
  alchemy_imp: "pot_idle.png",
};
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
export function TaskList({ taskId }: { taskId?: string } = {}) {
  const tasks = useTasks((s) => s.tasks);
  const runtimeError = useTasks((s) => s.error);
  const ready = useTasks((s) => s.ready);
  const pendingSaves = useTasks((s) => s.pendingSaves);
  const materials = useDocuments((s) => s.materials);
  const [selected, setSelected] = useState<string | undefined>(() =>
    tasks.some((task) => task.id === taskId && task.result)
      ? taskId
      : undefined,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const task = tasks.find((t) => t.id === selected);
  async function action(
    t: Task,
    type: "cancel" | "archive" | "read" | "pause" | "resume",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (type === "pause" && t.watchId) await pauseWatching(t.watchId);
      else if (type === "resume") {
        if (
          t.watchId &&
          useWatches
            .getState()
            .watches.some(
              (watch) => watch.id === t.watchId && watch.status === "paused",
            )
        )
          await resumeWatching(t.watchId);
        else await resumeTask(t.id);
      } else await updateTask(t.id, { type });
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
            if (isBatchRecord(task.result!))
              openBatchDraft(batchContinuationDraft(task.result!));
            else
              useInteraction.setState({
                book: false,
                draft: summonFromResult(task.result!),
              });
          }}
        />
      </>
    );
  return (
    <div className="familiar-task-list">
      {!taskId && <WatchList />}
      <p className="subtle">
        One-time delegation. Refresh restores records only; unfinished tasks are
        not rerun automatically.
      </p>
      {(error || runtimeError) && (
        <p role="alert" className="error">
          {error || runtimeError}
          <button onClick={() => void recoverTasks()}>
            Refresh task records
          </button>
        </p>
      )}
      {!ready && !runtimeError && <p>Loading tasks…</p>}
      {ready && tasks.length === 0 && <p>No delegated tasks yet.</p>}
      {tasks
        .filter((t) => !taskId || t.id === taskId)
        .map((t) => (
          <section key={t.id} className="scope" data-testid="task-card">
            <h3 className="familiar-task-heading">
              <img
                src={`/assets/prototype/${familiarArt[t.familiar]}`}
                alt=""
              />
              {roles[t.familiar].name}
            </h3>
            <strong>
              {isBatchTask(t)
                ? "Multi-material · " +
                  t.snapshots.map((s) => s.title).join(" + ")
                : t.snapshot.title}
            </strong>
            <p>
              {t.execution === "gemini"
                ? "Gemini · Runs while the page is open"
                : "Local rules/templates"}
            </p>
            {t.watchId && <p>Continuous watch check · {t.watchId}</p>}
            <p>
              {isBatchTask(t)
                ? `${t.snapshots.length} independent materials`
                : `Version ${t.snapshot.materialVersion}`}{" "}
              · {taskLabels[t.status]}
              {t.unread ? " · Unread reply" : ""}
              {t.archived ? " · Archived" : ""}
            </p>
            {t.error && <p className="error">{t.error}</p>}
            {t.status === "paused" && (
              <p className="notice">
                {pendingSaves[t.id]
                  ? "The received reply is held in this page. Continue saves it without rerunning the task."
                  : "Continue restarts the unfinished step using this same task and frozen materials. It does not resume partway through an answer."}
                {t.execution === "gemini" &&
                  !pendingSaves[t.id] &&
                  " Waiting was cancelled; the provider may still finish the previous request. Continuing uses the same submission ID and may incur another charge."}
              </p>
            )}
            {pendingSaves[t.id] && (
              <p className="error" role="alert">
                Model processing finished, but the reply is not saved.{" "}
                {pendingSaves[t.id]} Closing or refreshing will lose the unsaved
                reply.
              </p>
            )}
            <details>
              <summary>View delegation scope</summary>
              {isBatchTask(t) ? (
                <BatchSources snapshots={t.snapshots} />
              ) : (
                <>
                  <SourceInfo value={t.snapshot} />
                  <pre>{t.snapshot.text}</pre>
                </>
              )}
              <p>
                {t.execution === "gemini"
                  ? "Delegation instruction: "
                  : "Instruction (record only): "}
                {t.instruction || "None"}
              </p>
            </details>
            <div className="panel-actions">
              {pendingSaves[t.id] && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await retryBatchTaskSave(t.id);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not save reply. Please retry.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Retry saving reply
                </button>
              )}
              {pendingTask(t) && (
                <button disabled={busy} onClick={() => void action(t, "pause")}>
                  {t.watchId ? "Pause watch" : "Pause task"}
                </button>
              )}
              {t.status === "paused" && (
                <button
                  disabled={busy}
                  onClick={() => void action(t, "resume")}
                >
                  {t.watchId ? "Continue watch" : "Continue task"}
                </button>
              )}
              {(pendingTask(t) || t.status === "paused") && (
                <button
                  disabled={busy}
                  onClick={() => void action(t, "cancel")}
                >
                  Recall task
                </button>
              )}
              {t.result && (
                <button disabled={busy} onClick={() => void action(t, "read")}>
                  View reply
                </button>
              )}
              {!pendingTask(t) && t.status !== "paused" && !t.archived && (
                <button
                  disabled={busy}
                  onClick={() => void action(t, "archive")}
                >
                  Archive record
                </button>
              )}
              {!pendingTask(t) && t.status !== "paused" && (
                <button
                  disabled={
                    busy ||
                    (isBatchTask(t)
                      ? t.snapshots.some(
                          (s) => !materials.some((m) => m.id === s.materialId),
                        )
                      : !materials.some((m) => m.id === t.snapshot.materialId))
                  }
                  onClick={() => prepareAgain(t)}
                >
                  {isBatchTask(t)
                    ? "Confirm current materials again"
                    : "Delegate current full text again"}
                </button>
              )}
            </div>
          </section>
        ))}
    </div>
  );
}
export function TaskMarker() {
  const hasDraft = useInteraction(
    (s) =>
      !!(s.draft || s.batchDraft || s.watchDraft || s.jointDraft || s.cauldron),
  );
  const book = useInteraction((s) => s.book);
  const reduced = useInteraction((s) => s.settings.reducedMotion);
  const watches = useWatches((s) => s.watches);
  const tasks = useTasks((s) => s.tasks);
  const error = useTasks((s) => s.error);
  const ready = useTasks((s) => s.ready);
  const pendingSaves = useTasks((s) => s.pendingSaves);
  const [openTask, setOpenTask] = useState<string>();
  const [openError, setOpenError] = useState("");
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (hasDraft || book) setOpenTask(undefined);
  }, [hasDraft, book]);
  const watched = watches.filter((w) => w.status === "active").length;
  const active = tasks.filter(pendingTask).length;
  const unread = tasks.filter((t) => t.unread && !t.archived).length;
  const attention = tasks.filter(
    (t) => !t.archived && (t.status === "failed" || t.status === "interrupted"),
  ).length;
  const openRegister = () => {
    setOpenTask(undefined);
    useInteraction.setState({ book: true, bookTab: "Familiars", menu: false });
  };
  async function showTask(task: Task) {
    if (opening) return;
    setOpening(true);
    setOpenError("");
    try {
      if (task.result && task.unread)
        await updateTask(task.id, { type: "read" });
      const current = useInteraction.getState();
      if (
        current.draft ||
        current.batchDraft ||
        current.watchDraft ||
        current.jointDraft ||
        current.cauldron ||
        current.book
      )
        return;
      useInteraction.setState({ menu: false });
      setOpenTask(task.id);
    } catch (e) {
      setOpenError(
        e instanceof Error ? e.message : "Could not open the task reply.",
      );
    } finally {
      setOpening(false);
    }
  }
  return (
    <>
      <aside
        className="familiar-marker task-rail"
        aria-label="Familiar task status"
        data-reduced={reduced}
      >
        <strong className="task-rail-label">FAMILIARS</strong>
        <small className="sr-only" role="status">
          {error
            ? "Could not load task records"
            : !ready
              ? "Loading tasks…"
              : active + " active · " + unread + " unread"}
        </small>
        <small className="sr-only">{watched} watched</small>
        {attention > 0 && (
          <small className="sr-only">Needs attention: {attention}</small>
        )}
        <div className="task-rail-marks">
          {tasks
            .filter((task) => !task.archived)
            .map((task) => {
              const title = isBatchTask(task)
                ? task.snapshots.map((s) => s.title).join(" + ")
                : task.snapshot.title;
              const label = `${roles[task.familiar].name} · ${title} · ${pendingSaves[task.id] ? "Reply not saved" : taskLabels[task.status]}${task.unread ? " · Unread reply" : ""}`;
              return (
                <button
                  key={task.id}
                  className="familiar-task-mark"
                  data-task-id={task.id}
                  data-familiar={task.familiar}
                  data-state={pendingSaves[task.id] ? "failed" : task.status}
                  data-unread={task.unread}
                  aria-label={label}
                  title={label}
                  aria-pressed={openTask === task.id}
                  disabled={hasDraft || book || opening}
                  onClick={() => void showTask(task)}
                >
                  <img
                    src={`/assets/prototype/${familiarArt[task.familiar]}`}
                    alt=""
                  />
                  <span className="task-mark-status" aria-hidden="true" />
                </button>
              );
            })}
          {watches
            .filter((watch) => watch.status !== "stopped")
            .map((watch) => (
              <button
                key={watch.id}
                className="familiar-task-mark familiar-watch-mark"
                data-state={watch.status}
                aria-label={`Watch ${watch.title} · ${watch.status}`}
                title={`Watch ${watch.title} · ${watch.status}`}
                disabled={hasDraft || opening}
                onClick={openRegister}
              >
                <img src="/assets/prototype/bat_rest.png" alt="" />
                <span className="task-mark-status" aria-hidden="true" />
              </button>
            ))}
        </div>
        <button
          className="task-register-button"
          aria-label="View familiar tasks"
          data-attention={!!error || attention > 0}
          disabled={hasDraft || opening}
          title={
            hasDraft
              ? "Close the current panel before viewing familiar tasks"
              : undefined
          }
          onClick={openRegister}
        >
          <img src="/assets/prototype/envelope.png" alt="" />
          <span>
            {error || attention > 0
              ? "Review"
              : unread
                ? `${unread} new`
                : "All tasks"}
          </span>
        </button>
      </aside>
      {openError && (
        <div className="task-open-error" role="alert">
          {openError}
          <button onClick={() => setOpenError("")}>Close notice</button>
        </div>
      )}
      {openTask && !hasDraft && !book && (
        <FloatingPanel
          key={openTask}
          title="Familiar task"
          placement="right"
          className="familiar-task-panel"
          close={() => setOpenTask(undefined)}
        >
          <TaskList taskId={openTask} />
          <button className="task-all-link" onClick={openRegister}>
            View all familiar tasks
          </button>
        </FloatingPanel>
      )}
    </>
  );
}
