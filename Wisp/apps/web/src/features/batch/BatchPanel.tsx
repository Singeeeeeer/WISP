import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  sliceBatchSnapshot,
  validBatchSnapshots,
  batchContinuationDraft,
  type BatchDraft,
  type BatchRecord,
} from "../../domain/batch";
import { roles } from "../../domain/task";
import type { Familiar } from "../../domain/model";
import { createBatchSubmission } from "../../services/batch";
import { createRepository } from "../../services/repository";
import { submitBatchTask, useTasks } from "../../services/task-runtime";
import { useDocuments, useInteraction } from "../../state/stores";
import { FloatingPanel } from "../../shared/FloatingPanel";
import { SourceInfo } from "../../shared/SourceInfo";
import { SummaryChoice } from "../check/SummaryChoice";
import { captureOutcome } from "../companion/outcome";
import { BatchResult } from "./BatchResult";
import { openBatchDraft, prepareBatchAgain, familiarForBatch } from "./actions";
import "./batch.css";

const repository = createRepository();
export function BatchPanel({ draft }: { draft: BatchDraft }) {
  const materials = useDocuments((s) => s.materials);
  const saveStatus = useDocuments((s) => s.status);
  const ready = useTasks((s) => s.ready);
  const original = useRef(structuredClone(draft.snapshots));
  const [ranges, setRanges] = useState<Record<number, [number, number]>>({});
  const [record, setRecord] = useState<BatchRecord>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runState, setRunState] = useState("idle");
  const submission = useRef<
    ReturnType<typeof createBatchSubmission> | undefined
  >(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const locked = useRef(false);
  const mounted = useRef(true);
  const attempted = useRef(false);
  const requestId = useRef(draft.id);
  const operation =
    draft.entry === "summon" ? roles[draft.familiar].operation : draft.entry;
  const operationLabel = operation[0].toUpperCase() + operation.slice(1);
  const frozen = busy || !!submission.current?.hasResult();
  const total = draft.snapshots.reduce((sum, s) => sum + s.text.length, 0);
  const valid =
    validBatchSnapshots(draft.snapshots) && draft.instruction.length <= 4000;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  function change(patch: Partial<BatchDraft>) {
    if (frozen) return;
    if (attempted.current) requestId.current = crypto.randomUUID();
    attempted.current = false;
    submission.current = undefined;
    setError("");
    setRunState("idle");
    useInteraction.setState({ batchDraft: { ...draft, ...patch } });
  }
  function close() {
    if (locked.current) return;
    if (
      submission.current?.hasResult() &&
      !record &&
      !window.confirm("结果尚未保存，关闭会放弃本页待保存结果。仍要关闭吗？")
    )
      return;
    if (!record) captureOutcome()("cancel");
    useInteraction.setState({ batchDraft: undefined });
  }
  function useRange(index: number, full = false) {
    try {
      const source = original.current[index];
      const [start, end] = full
        ? [0, source.text.length]
        : (ranges[index] ?? [0, 0]);
      const snapshots = [...draft.snapshots];
      snapshots[index] = sliceBatchSnapshot(source, start, end);
      change({ snapshots });
    } catch (e) {
      setError(e instanceof Error ? e.message : "请选择完整、非空文字片段。");
    }
  }
  function selectWithKeyboard(
    e: KeyboardEvent<HTMLTextAreaElement>,
    index: number,
  ) {
    if (
      e.altKey ||
      e.metaKey ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) ||
      (e.ctrlKey && e.key.startsWith("Arrow"))
    )
      return;
    const target = e.currentTarget;
    const text = target.value;
    const start = target.selectionStart,
      end = target.selectionEnd;
    const backward = target.selectionDirection === "backward";
    const anchor = backward ? end : start;
    const focus = backward ? start : end;
    let next = focus;
    if (e.key === "Home")
      next =
        e.ctrlKey || focus === 0 ? 0 : text.lastIndexOf("\n", focus - 1) + 1;
    else if (e.key === "End") {
      const lineEnd = text.indexOf("\n", focus);
      next = e.ctrlKey || lineEnd < 0 ? text.length : lineEnd;
    } else if (!e.shiftKey && start !== end)
      next = e.key === "ArrowLeft" ? start : end;
    else if (e.key === "ArrowRight") {
      next = Math.min(text.length, focus + 1);
      if (
        /[\uD800-\uDBFF]/.test(text[focus] ?? "") &&
        /[\uDC00-\uDFFF]/.test(text[next] ?? "")
      )
        next++;
    } else {
      next = Math.max(0, focus - 1);
      if (
        /[\uDC00-\uDFFF]/.test(text[next] ?? "") &&
        /[\uD800-\uDBFF]/.test(text[next - 1] ?? "")
      )
        next--;
    }
    // Readonly textareas scroll on arrow keys in Chrome; provide standard text
    // selection without making the frozen preview editable or splitting emoji.
    e.preventDefault();
    const from = e.shiftKey ? anchor : next;
    target.setSelectionRange(
      Math.min(from, next),
      Math.max(from, next),
      next < from ? "backward" : "forward",
    );
    setRanges((before) => ({
      ...before,
      [index]: [target.selectionStart, target.selectionEnd],
    }));
  }
  async function submit() {
    if (locked.current || !valid) return;
    const finish = captureOutcome();
    locked.current = true;
    attempted.current = true;
    setBusy(true);
    setError("");
    setRunState("running");
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (draft.entry === "summon") {
        await submitBatchTask({
          ...draft,
          id: requestId.current,
          summaryStyle:
            operation === "understand"
              ? (draft.summaryStyle ?? "standard")
              : undefined,
        });
        if (mounted.current) {
          finish("success");
          useInteraction.setState({ batchDraft: undefined });
        }
      } else {
        submission.current ??= createBatchSubmission(
          requestId.current,
          draft.snapshots,
          draft.instruction,
          operation === "understand"
            ? { operation, summaryStyle: draft.summaryStyle ?? "standard" }
            : { operation },
          (result) => repository.saveRecord(result),
        );
        const saved = await submission.current.run(abort.signal);
        if (mounted.current) {
          finish("success");
          setRecord(saved);
          setRunState("completed");
        }
      }
    } catch (e) {
      if (mounted.current) {
        const cancelled =
          abort.signal.aborted && !submission.current?.hasResult();
        finish(cancelled ? "cancel" : "error");
        setRunState(cancelled ? "cancelled" : "failed");
        setError(
          e instanceof Error ? e.message : "多材料处理失败，请手动重试。",
        );
      }
      if (!submission.current?.hasResult()) submission.current = undefined;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <FloatingPanel
      title={record ? `多材料 ${operationLabel} 结果` : "多材料确认"}
      busy={busy}
      close={close}
    >
      <div
        className="batch-panel"
        data-wisp-context="cauldron"
        data-wisp-operation={operation}
        data-wisp-run-id={requestId.current}
        data-wisp-state={runState}
        aria-busy={busy}
      >
        {record ? (
          <BatchResult
            record={record}
            close={close}
            again={() =>
              prepareBatchAgain(
                record,
                record.operation,
                familiarForBatch(record),
              )
            }
            summon={() => openBatchDraft(batchContinuationDraft(record))}
          />
        ) : (
          <>
            <div className="eyebrow">
              {draft.entry === "summon" ? "SUMMON" : operationLabel} · GEMINI ·
              多材料
            </div>
            <h2>确认这 {draft.snapshots.length} 份材料</h2>
            {draft.fromResult && (
              <p className="notice">
                沿用结果所依据的原始材料副本，不把生成结果作为原文。核对后再提交。
              </p>
            )}
            <p className="notice">
              综合处理仅使用下方明确确认的文字。本地规则保留在单材料入口。引用需人工核对，不代表事实已经验证。
            </p>
            {draft.entry === "summon" && (
              <div className="role-grid">
                {(Object.keys(roles) as Familiar[]).map((id) => (
                  <button
                    key={id}
                    disabled={frozen}
                    aria-pressed={draft.familiar === id}
                    onClick={() =>
                      change({ familiar: id, summaryStyle: undefined })
                    }
                  >
                    <strong>{roles[id].name}</strong>
                    <small>{roles[id].operation}</small>
                  </button>
                ))}
              </div>
            )}
            {operation === "understand" && (
              <SummaryChoice
                value={draft.summaryStyle ?? "standard"}
                disabled={frozen}
                onChange={(summaryStyle) => change({ summaryStyle })}
              />
            )}
            <label className="field-label">
              多材料补充要求
              <textarea
                className="instruction"
                value={draft.instruction}
                maxLength={4000}
                disabled={frozen}
                onChange={(e) => change({ instruction: e.target.value })}
              />
            </label>
            <p className={valid ? "notice" : "error"} role="status">
              已确认 {draft.snapshots.length} 份 · 合计 {total.toLocaleString()}{" "}
              / 60,000 UTF-16 单元。
              {!valid && "每份须非空且合计不超过上限；请缩小范围后再提交。"}
            </p>
            {draft.snapshots.map((s, index) => {
              const current = materials.find((m) => m.id === s.materialId);
              const stale =
                !current ||
                current.version !== s.materialVersion ||
                current.title !== s.title ||
                current.text.slice(s.start, s.end) !== s.text;
              const n = index + 1;
              const range = ranges[index];
              return (
                <section
                  className="scope"
                  key={s.materialId}
                  aria-label={`材料 ${n} 确认范围`}
                >
                  <h3>
                    {n}. {s.title}
                  </h3>
                  <SourceInfo value={s} />
                  <p>
                    版本 {s.materialVersion} · UTF-16 范围 [{s.start}, {s.end})
                    · {s.text.length.toLocaleString()} 单元
                  </p>
                  {stale && (
                    <p className="notice">
                      原文已变化或不可用，仍使用这里的冻结副本。
                    </p>
                  )}
                  {saveStatus[s.materialId] !== "已保存" && (
                    <p className="notice">
                      原文尚未成功保存；本次仅保存确认副本及结果。
                    </p>
                  )}
                  <pre data-testid={`batch-snapshot-${n}`}>
                    {s.text || "空白范围"}
                  </pre>
                  <details>
                    <summary>调整材料 {n} 的处理范围</summary>
                    <p className="subtle">
                      拖选文字，或用 Home／End 和 Shift＋左右方向键选择。
                    </p>
                    <label className="field-label">
                      材料 {n} 范围预览
                      <textarea
                        readOnly
                        disabled={frozen}
                        value={original.current[index].text}
                        onKeyDown={(e) => selectWithKeyboard(e, index)}
                        onSelect={(e) => {
                          const target = e.currentTarget;
                          setRanges((before) => ({
                            ...before,
                            [index]: [
                              target.selectionStart,
                              target.selectionEnd,
                            ],
                          }));
                        }}
                      />
                    </label>
                    <div className="batch-range-actions">
                      <button
                        disabled={frozen || !range || range[0] === range[1]}
                        onClick={() => useRange(index)}
                      >
                        使用材料 {n} 选中片段
                      </button>
                      <button
                        disabled={frozen}
                        onClick={() => useRange(index, true)}
                      >
                        恢复材料 {n} 全文
                      </button>
                    </div>
                  </details>
                </section>
              );
            })}
            <p className="notice">
              仅本次编号对应的文字、要求及摘要设置经本机服务发送至
              Gemini，可能产生费用；标题、文件名和来源备注不外发。结果不修改原文。
              {draft.entry === "summon" &&
                "使魔依赖当前页面；刷新或关闭会中断，召回不保证撤销供应商处理或费用。"}
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="panel-actions">
              <button
                className="primary"
                disabled={
                  busy || !valid || (draft.entry === "summon" && !ready)
                }
                onClick={() => void submit()}
              >
                {busy
                  ? "正在处理并保存…"
                  : submission.current?.hasResult()
                    ? "重试保存多材料结果"
                    : draft.entry === "summon"
                      ? "召唤多材料使魔"
                      : "开始多材料处理"}
              </button>
              {busy &&
                draft.entry !== "summon" &&
                !submission.current?.hasResult() && (
                  <button onClick={() => controller.current?.abort()}>
                    停止等待
                  </button>
                )}
              <button
                aria-label="关闭多材料确认"
                disabled={busy}
                onClick={close}
              >
                继续自己工作
              </button>
            </div>
          </>
        )}
      </div>
    </FloatingPanel>
  );
}
