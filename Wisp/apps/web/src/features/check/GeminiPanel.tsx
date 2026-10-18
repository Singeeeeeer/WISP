import { captureOutcome } from "../companion/outcome";
import { operationPose, useTaskActivity } from "../companion/activity";
import { useEffect, useRef, useState } from "react";
import { snapshot, type ActionDraft } from "../../domain/model";
import { GEMINI_LIMIT } from "../../domain/gemini-check";
import { createGeminiSubmission } from "../../services/gemini";
import type { GeminiRecord } from "../../domain/processing";
import { GEMINI_TEXT_LIMIT } from "../../domain/gemini-text";
import { labels } from "../../domain/local-text";
import { SummaryChoice } from "./SummaryChoice";
import { GeminiTextResult } from "./GeminiTextResult";
import { createRepository } from "../../services/repository";
import { useDocuments, useInteraction } from "../../state/stores";
import { FloatingPanel } from "../../shared/FloatingPanel";
import { summonFromResult } from "../../domain/continuation";
import { SourceInfo } from "../../shared/SourceInfo";
import { GeminiResult } from "./GeminiResult";
import { ExecutionChoice } from "./ExecutionChoice";
const repository = createRepository();
export function GeminiPanel({ draft }: { draft: ActionDraft }) {
  const operation = draft.entry === "summon" ? "check" : draft.entry;
  const activity = useTaskActivity(
    draft.presentation === "brewing" ? "brewing" : operationPose(operation),
  );
  const resultProps = {
    close: () => close(),
    again: () => reset(),
    summon: () =>
      record && useInteraction.setState({ draft: summonFromResult(record) }),
  };
  const current = useDocuments((s) => s.materials).find(
      (m) => m.id === draft.snapshot.materialId,
    ),
    saveStatus = useDocuments((s) => s.status[draft.snapshot.materialId]);
  const [record, setRecord] = useState<GeminiRecord>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submission = useRef<
      ReturnType<typeof createGeminiSubmission> | undefined
    >(undefined),
    controller = useRef<AbortController | undefined>(undefined),
    locked = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const close = () => {
    if (!locked.current) {
      if (
        submission.current?.hasResult() &&
        !record &&
        !window.confirm("结果尚未保存，关闭会放弃本页待保存结果。仍要关闭吗？")
      )
        return;
      if (!record) captureOutcome()("cancel");
      useInteraction.setState({ draft: undefined });
    }
  };
  const reset = () => {
    if (current && !locked.current) {
      activity.clear();
      submission.current = undefined;
      setRecord(undefined);
      setError("");
      useInteraction.setState({
        draft: { ...draft, snapshot: snapshot(current) },
      });
    }
  };
  const frozen = busy || !!submission.current?.hasResult();
  async function submit(origin: Element) {
    if (locked.current) return;
    const finish = captureOutcome();
    const finishActivity = activity.start(origin);
    locked.current = true;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    const signal = controller.current.signal;
    submission.current ??= createGeminiSubmission(
      draft.snapshot,
      draft.instruction,
      operation === "understand"
        ? { operation, summaryStyle: draft.summaryStyle ?? "standard" }
        : { operation },
      (r) => repository.saveRecord(r),
    );
    try {
      const saved = await submission.current.run(signal);
      if (mounted.current) {
        finishActivity("success");
        finish("success");
        setRecord(saved);
      }
    } catch (e) {
      if (mounted.current) {
        finishActivity(
          signal.aborted && !submission.current?.hasResult() ? "cancel" : "error",
        );
        finish(
          signal.aborted && !submission.current?.hasResult()
            ? "cancel"
            : "error",
        );
        setError(e instanceof Error ? e.message : "检查失败");
      }
      if (!submission.current?.hasResult()) submission.current = undefined;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <FloatingPanel
      busy={busy}
      title={
        record
          ? operation === "check"
            ? "Check 检查结果"
            : labels[operation] + " 处理结果"
          : "材料确认"
      }
      close={close}
    >
      {record ? (
        record.operation === "check" ? (
          <GeminiResult record={record} {...resultProps} />
        ) : (
          <GeminiTextResult record={record} {...resultProps} />
        )
      ) : (
        <>
          <div className="eyebrow">{labels[operation]} · Gemini</div>
          <h2>确认本次处理材料</h2>
          <ExecutionChoice
            value="gemini"
            disabled={frozen}
            onChange={(execution) =>
              useInteraction.setState({
                draft: { ...draft, execution },
              })
            }
          />
          <p className="notice">
            {operation === "check" ? GEMINI_LIMIT : GEMINI_TEXT_LIMIT}
          </p>
          {operation === "understand" && (
            <SummaryChoice
              value={draft.summaryStyle ?? "standard"}
              disabled={frozen}
              onChange={(summaryStyle) =>
                useInteraction.setState({ draft: { ...draft, summaryStyle } })
              }
            />
          )}
          <label className="field-label" htmlFor="gemini-instruction">
            补充要求
          </label>
          <textarea
            id="gemini-instruction"
            className="instruction"
            disabled={frozen}
            maxLength={4000}
            value={draft.instruction}
            onChange={(e) =>
              useInteraction.setState({
                draft: { ...draft, instruction: e.target.value },
              })
            }
          />
          <div className="scope">
            <strong>{draft.snapshot.title}</strong>
            <SourceInfo value={draft.snapshot} />
            <p>
              版本 {draft.snapshot.materialVersion} · UTF-16 范围 [
              {draft.snapshot.start}, {draft.snapshot.end})
            </p>
            <pre data-testid="snapshot-text">{draft.snapshot.text}</pre>
          </div>
          {current?.version !== draft.snapshot.materialVersion && (
            <p className="notice">
              原文已经变化，仍使用上述副本。
              <button disabled={frozen || !current} onClick={reset}>
                更新为当前全文
              </button>
            </p>
          )}
          {saveStatus !== "已保存" && (
            <p className="notice">
              原文尚未成功保存；本次仅处理确认副本，结果保存不代表原文已落盘。
            </p>
          )}
          <p>
            点击运行后，本次文本与补充要求经本地服务端发送至
            Gemini，可能产生费用。不发送其他材料，不自动重试。网络失败后手动重试可能再次计费。
          </p>
          {submission.current?.hasResult() && (
            <p className="notice">
              已收到模型结果但尚未保存；重试仅保存，不再次调用
              Gemini。刷新页面会丢失本页待保存结果。
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="panel-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={(e) => void submit(e.currentTarget)}
            >
              {busy
                ? "正在处理并保存…"
                : submission.current?.hasResult()
                  ? "重试保存结果"
                  : operation === "check"
                    ? "运行 Gemini 检查"
                    : operation === "understand"
                      ? "运行 Gemini 理解"
                      : "运行 Gemini 创作"}
            </button>
            {busy && (
              <button onClick={() => controller.current?.abort()}>
                停止等待
              </button>
            )}
            <button aria-label="关闭材料面板" disabled={busy} onClick={close}>
              继续自己工作
            </button>
          </div>
        </>
      )}
    </FloatingPanel>
  );
}
