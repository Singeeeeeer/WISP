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
      setError(e instanceof Error ? e.message : "任务操作失败");
    } finally {
      setBusy(false);
    }
  }
  if (task?.result)
    return (
      <>
        <p>
          {roles[task.familiar].name} ·{" "}
          {task.watchId ? "持续关注回信" : "一次性回信"}
          {task.archived ? " · 已收好" : ""}
        </p>
        <ProcessingResult
          record={task.result}
          close={() => setSelected(undefined)}
          again={() => prepareAgain(task)}
          againLabel="重新委托当前全文"
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
      <p>一次性委托。刷新只恢复记录，未完成的任务不会自动重跑。</p>
      {(error || runtimeError) && (
        <p role="alert" className="error">
          {error || runtimeError}
          <button onClick={() => void recoverTasks()}>刷新任务记录</button>
        </p>
      )}
      {!ready && !runtimeError && <p>正在读取任务…</p>}
      {ready && tasks.length === 0 && <p>还没有委托，也没有模拟任务。</p>}
      {tasks.map((t) => (
        <section key={t.id} className="scope" data-testid="task-card">
          <h3>{roles[t.familiar].name}</h3>
          <strong>{isBatchTask(t) ? "多材料 · " + t.snapshots.map((s) => s.title).join(" ＋ ") : t.snapshot.title}</strong>
          <p>
            {t.execution === "gemini"
              ? "Gemini · 页面存续期间执行"
              : "本地规则／模板"}
          </p>
          {t.watchId && <p>持续关注检查 · {t.watchId}</p>}
          <p>
            {isBatchTask(t) ? `${t.snapshots.length} 份独立材料` : `版本 ${t.snapshot.materialVersion}`} · {taskLabels[t.status]}
            {t.unread ? " · 未读回信" : ""}
            {t.archived ? " · 已收好" : ""}
          </p>
          {t.error && <p className="error">{t.error}</p>}
          {pendingSaves[t.id] && <p className="error" role="alert">模型处理已结束，回信尚未保存。{pendingSaves[t.id]} 关闭或刷新页面会丢失待保存回信。</p>}
          <details>
            <summary>查看委托范围</summary>
            {isBatchTask(t) ? <BatchSources snapshots={t.snapshots} /> : <><SourceInfo value={t.snapshot} /><pre>{t.snapshot.text}</pre></>}
            <p>
              {t.execution === "gemini" ? "委托要求：" : "要求（仅记录）："}
              {t.instruction || "无"}
            </p>
          </details>
          <div className="panel-actions">
            {pendingSaves[t.id] && <button disabled={busy} onClick={async () => {
              setBusy(true);
              setError("");
              try { await retryBatchTaskSave(t.id); }
              catch (e) { setError(e instanceof Error ? e.message : "回信保存失败，请重试。"); }
              finally { setBusy(false); }
            }}>重试保存回信</button>}
            {pendingTask(t) && (
              <button disabled={busy} onClick={() => void action(t, "cancel")}>
                召回任务
              </button>
            )}
            {t.result && (
              <button disabled={busy} onClick={() => void action(t, "read")}>
                查看回信
              </button>
            )}
            {!pendingTask(t) && !t.archived && (
              <button disabled={busy} onClick={() => void action(t, "archive")}>
                收好记录
              </button>
            )}
            {!pendingTask(t) && (
              <button
                disabled={
                  busy || (isBatchTask(t) ? t.snapshots.some((s) => !materials.some((m) => m.id === s.materialId)) : !materials.some((m) => m.id === t.snapshot.materialId))
                }
                onClick={() => prepareAgain(t)}
              >
                {isBatchTask(t) ? "重新确认当前材料" : "重新委托当前全文"}
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
    <aside className="familiar-marker" aria-label="使魔任务状态">
      <span aria-hidden="true">✉</span>
      <strong>使魔委托</strong>
      <small role="status">
        {error
          ? "任务记录读取异常"
          : !ready
            ? "正在读取任务…"
            : active + " 项进行中 · " + unread + " 封未读"}
      </small>
      <small>{watched} 项关注</small>
      {attention > 0 && <small>{attention} 项需要处理</small>}
      <button
        disabled={hasDraft}
        title={hasDraft ? "先关闭当前浮层，再查看使魔任务" : undefined}
        onClick={() =>
          useInteraction.setState({
            book: true,
            bookTab: "Familiars",
            menu: false,
          })
        }
      >
        查看使魔任务
      </button>
    </aside>
  );
}
