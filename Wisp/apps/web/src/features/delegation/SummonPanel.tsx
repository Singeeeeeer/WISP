import { captureOutcome } from "../companion/outcome";
import { ExecutionChoice } from "../check/ExecutionChoice";
import { SummaryChoice } from "../check/SummaryChoice";
import { GEMINI_TEXT_LIMIT } from "../../domain/gemini-text";
import { GEMINI_LIMIT } from "../../domain/gemini-check";
import { SourceInfo } from "../../shared/SourceInfo";
import { useRef, useState } from "react";
import { useDocuments, useInteraction } from "../../state/stores";
import {
  snapshot,
  type ActionDraft,
  type Familiar,
  type ExcerptLimit,
} from "../../domain/model";
import { roles } from "../../domain/task";
import { limitDescription } from "../../domain/local-text";
import { defaultExcerptLimit } from "../../services/proposal-runtime";
import { ExcerptChoice } from "../proposals/ExcerptChoice";
import { submitTask, useTasks } from "../../services/task-runtime";
import { FloatingPanel } from "../../shared/FloatingPanel";
export function SummonPanel({ draft }: { draft: ActionDraft }) {
  const current = useDocuments((s) => s.materials).find(
    (m) => m.id === draft.snapshot.materialId,
  );
  const saveStatus = useDocuments((s) => s.status[draft.snapshot.materialId]);
  const gemini = draft.execution === "gemini";
  const ready = useTasks((s) => s.ready);
  const runtimeError = useTasks((s) => s.error);
  const [busy, setBusy] = useState(false);
  const [excerptLimit, setExcerptLimit] = useState<ExcerptLimit | undefined>(
    draft.excerptLimit,
  );
  const localLimit = excerptLimit ?? (gemini ? 8 : defaultExcerptLimit());
  const [error, setError] = useState("");
  const lock = useRef(false);
  const close = () => {
    if (!lock.current) {
      captureOutcome()("cancel");
      useInteraction.setState({ draft: undefined });
    }
  };
  async function submit() {
    if (lock.current) return;
    const finish = captureOutcome();
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await submitTask({
        ...draft,
        excerptLimit:
          !gemini && draft.familiar === "page_sprite" ? localLimit : undefined,
        summaryStyle:
          gemini && draft.familiar === "page_sprite"
            ? (draft.summaryStyle ?? "standard")
            : undefined,
        execution: gemini ? "gemini" : "local",
      });
      finish("success");
      useInteraction.setState({ draft: undefined });
    } catch (e) {
      finish("error");
      setError(e instanceof Error ? e.message : "委托保存失败，请重试。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <FloatingPanel busy={busy} title="材料确认" close={close}>
      <div className="eyebrow">
        SUMMON · {gemini ? "Gemini 一次性委托" : "本地一次性委托 · 未接入 AI"}
      </div>
      <h2>把一件事托付给使魔</h2>
      {draft.fromResult && (
        <p className="notice">
          沿用刚才结果对应的原始材料副本与要求，不把生成结果作为原文。核对下方范围后再召唤；不会自动提交。
        </p>
      )}
      <div className="role-grid">
        {(Object.keys(roles) as Familiar[]).map((id) => (
          <button
            key={id}
            disabled={busy}
            aria-pressed={draft.familiar === id}
            onClick={() =>
              useInteraction.setState({
                draft: {
                  ...draft,
                  familiar: id,
                  execution: "local",
                  summaryStyle: undefined,
                },
              })
            }
          >
            <strong>{roles[id].name}</strong>
            <small>{roles[id].operation}</small>
          </button>
        ))}
      </div>
      <p className="subtle">一次性委托 · 完成后停止</p>
      <ExecutionChoice
        value={gemini ? "gemini" : "local"}
        disabled={busy}
        onChange={(execution) =>
          useInteraction.setState({
            draft: { ...draft, execution },
          })
        }
      />
      <p className="notice">
        {gemini
          ? draft.familiar === "scout_bat"
            ? GEMINI_LIMIT
            : GEMINI_TEXT_LIMIT
          : limitDescription(roles[draft.familiar].operation, localLimit)}
      </p>
      {draft.familiar === "page_sprite" && !gemini && (
        <ExcerptChoice
          value={localLimit}
          onChange={setExcerptLimit}
          disabled={busy}
        />
      )}
      {draft.familiar === "page_sprite" && gemini && (
        <SummaryChoice
          value={draft.summaryStyle ?? "standard"}
          disabled={busy}
          onChange={(summaryStyle) =>
            useInteraction.setState({ draft: { ...draft, summaryStyle } })
          }
        />
      )}
      <label className="field-label" htmlFor="summon-instruction">
        {gemini ? "委托要求" : "委托要求（仅记录，本地规则不解释自由文本）"}
      </label>
      <textarea
        id="summon-instruction"
        maxLength={gemini ? 4000 : undefined}
        className="instruction"
        disabled={busy}
        value={draft.instruction}
        onChange={(e) =>
          useInteraction.setState({
            draft: { ...draft, instruction: e.target.value },
          })
        }
      />
      <div className="scope">
        <div className="eyebrow">ONLY THIS MATERIAL · 本次材料副本</div>
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
          原文已经变化，仍委托此处副本。
          {current && (
            <button
              disabled={busy}
              onClick={() =>
                useInteraction.setState({
                  draft: { ...draft, snapshot: snapshot(current) },
                })
              }
            >
              更新为当前全文
            </button>
          )}
        </p>
      )}
      {saveStatus !== "已保存" && (
        <p className="notice">
          原文尚未成功保存，委托使用此处确认副本；回信保存不代表原文已经落盘。
        </p>
      )}
      <p>
        {gemini
          ? "本次文本与要求经本地服务端发送至 Gemini，可能产生费用。依赖当前页面，可切换文档继续工作。刷新或关闭后中断，不自动重跑；召回仅停止接收结果，供应商可能继续处理和计费。"
          : "仅在当前页面的本地处理线程执行，可切换文档继续工作。关闭或刷新页面会中断未完成任务，不会自动重跑。不修改原文。"}
      </p>
      {(error || runtimeError) && (
        <p role="alert" className="error">
          {error || runtimeError}
        </p>
      )}
      <div className="panel-actions">
        <button
          className="primary"
          disabled={busy || !ready}
          onClick={() => void submit()}
        >
          {busy ? "正在保存委托…" : "召唤使魔"}
        </button>
        <button aria-label="关闭材料面板" disabled={busy} onClick={close}>
          继续自己工作
        </button>
      </div>
    </FloatingPanel>
  );
}
