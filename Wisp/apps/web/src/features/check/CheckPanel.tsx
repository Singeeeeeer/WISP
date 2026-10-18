import { captureOutcome } from "../companion/outcome";
import { operationPose, useTaskActivity } from "../companion/activity";
import { FloatingPanel } from "../../shared/FloatingPanel";
import { summonFromResult } from "../../domain/continuation";
import { ExecutionChoice } from "./ExecutionChoice";
import { GeminiPanel } from "./GeminiPanel";
import { GeminiResult } from "./GeminiResult";
import { GeminiTextResult } from "./GeminiTextResult";
import { geminiTextHeading } from "../../domain/gemini-text";
import { geminiHeading } from "../../domain/gemini-check";
import type { ProcessingRecord } from "../../domain/processing";
import { isBatchRecord, batchContinuationDraft, type BatchRecord } from "../../domain/batch";
import { BatchResult } from "../batch/BatchResult";
import { openBatchDraft, prepareBatchAgain, familiarForBatch } from "../batch/actions";
import { sourceDescription } from "../../domain/cauldron";
import { SourceInfo } from "../../shared/SourceInfo";
import type { StoredRecord } from "../../domain/joint";
import { JointResult, prepareJointAgain } from "../proposals/JointPanel";
import { useEffect, useRef, useState } from "react";
import {
  completedForProposal,
  defaultExcerptLimit,
} from "../../services/proposal-runtime";
import { ExcerptChoice } from "../proposals/ExcerptChoice";
import {
  actions,
  labels,
  limitDescription,
  resultHeading,
  resultBody,
  runLocal,
  type LocalRecord,
} from "../../domain/local-text";
import { snapshot, type ActionDraft } from "../../domain/model";
import { createRepository } from "../../services/repository";
import { useDocuments, useInteraction } from "../../state/stores";
import { Dialog } from "../../shared/Dialog";
const repository = createRepository();

export function LocalResult({
  record,
  close,
  again,
  againLabel,
  embedded = false,
  summon,
}: {
  record: LocalRecord;
  close: () => void;
  again: () => void;
  againLabel?: string;
  embedded?: boolean;
  summon?: () => void;
}) {
  const materials = useDocuments((s) => s.materials);
  const current = materials.find((m) => m.id === record.snapshot.materialId);
  const stale =
    !current ||
    current.version !== record.snapshot.materialVersion ||
    current.text.slice(record.snapshot.start, record.snapshot.end) !==
      record.snapshot.text ||
    current.title !== record.snapshot.title;
  const [copy, setCopy] = useState("");
  const heading = resultHeading(record);
  return (
    <>
      <div className="eyebrow">
        {labels[record.operation]} · 本地规则／模板 · 未接入 AI
      </div>
      <h2>{heading}</h2>
      <p>
        {record.snapshot.title} · 版本 {record.snapshot.materialVersion} ·{" "}
        {new Date(record.createdAt).toLocaleString()}
      </p>
      <SourceInfo value={record.snapshot} />
      {stale && (
        <p role="status" className="notice">
          原文已变化或不可用：这是旧版本的结果，不代表当前材料。
        </p>
      )}
      <p className="notice">
        {limitDescription(
          record.operation,
          record.operation === "understand" ? record.excerptLimit : undefined,
        )}
      </p>
      {record.instruction && (
        <p>
          已记录补充要求：{record.instruction}
          （本地规则不理解或执行自由文本要求）
        </p>
      )}
      {record.operation === "check" &&
        record.findings.map((f, i) => (
          <section className="scope" key={i}>
            <h3>{f.title}</h3>
            <p>{f.explanation}</p>
            {f.evidence.map((e) => (
              <blockquote key={e.start}>
                <pre>{e.quote}</pre>
                <small>
                  原文版本 {record.snapshot.materialVersion} · UTF-16 区间 [
                  {record.snapshot.start + e.start},{" "}
                  {record.snapshot.start + e.end})
                </small>
              </blockquote>
            ))}
          </section>
        ))}
      {record.operation !== "check" && (
        <>
          {record.operation === "create" && (
            <section className="scope">
              <h3>模板草稿（未确认，不自动写回）</h3>
              <pre data-testid="template-draft">{record.draft}</pre>
            </section>
          )}
          <section className="scope">
            <h3>
              {record.operation === "understand"
                ? "按原文顺序摘录"
                : "模板采用的字段依据"}
            </h3>
            {record.excerpts.map((e) => (
              <blockquote key={e.start}>
                <pre>{e.quote}</pre>
                <small>
                  原文版本 {record.snapshot.materialVersion} · UTF-16 区间 [
                  {record.snapshot.start + e.start},{" "}
                  {record.snapshot.start + e.end})
                </small>
              </blockquote>
            ))}
            {record.operation === "understand" && (
              <p>
                未展示的非空行：{record.omittedLines}
                。这些行未参与本次摘录展示。
              </p>
            )}
            {record.operation === "create" && record.excerpts.length === 0 && (
              <p>没有可直接采用的明确字段，请填写模板中的占位项。</p>
            )}
          </section>
        </>
      )}
      <details className="scope">
        <summary>查看本次完整材料副本</summary>
        <pre data-testid="check-source">{record.snapshot.text}</pre>
      </details>
      <p role="status">{copy}</p>
      {!embedded && (
        <div className="panel-actions">
          <button
            onClick={() => {
              const finish = captureOutcome();
              const text = [
                labels[record.operation] + " · 本地规则／模板，未接入 AI",
                heading,
                stale ? "旧版本结果，不代表当前材料" : "",
                limitDescription(
                  record.operation,
                  record.operation === "understand"
                    ? record.excerptLimit
                    : undefined,
                ),
                `材料：${record.snapshot.title} · 版本 ${record.snapshot.materialVersion}`,
                record.instruction
                  ? `补充要求仅记录：${record.instruction}`
                  : "",
                sourceDescription(record.snapshot),
                ...resultBody(record),
              ].join("\n");
              void Promise.resolve()
                .then(() => navigator.clipboard.writeText(text))
                .then(() => {
                  if (finish("success")) setCopy("已复制结果");
                })
                .catch(() => {
                  if (finish("error"))
                    setCopy("复制失败，请手动选择结果文字复制。");
                });
            }}
          >
            复制结果
          </button>
          {summon && <button onClick={summon}>继续召唤使魔</button>}
          <button disabled={!current} onClick={again}>
            {againLabel ??
              (record.operation === "check"
                ? "再次检查当前全文"
                : "重新处理当前全文")}
          </button>
          <button onClick={close}>
            {record.operation === "check" ? "关闭检查结果" : "关闭处理结果"}
          </button>
        </div>
      )}
    </>
  );
}

export function ProcessingResult(props: {
  record: ProcessingRecord | BatchRecord;
  close: () => void;
  again: () => void;
  againLabel?: string;
  summon?: () => void;
}) {
  if (isBatchRecord(props.record)) return <BatchResult {...props} record={props.record} />;
  return props.record.execution === "gemini" ? (
    props.record.operation === "check" ? (
      <GeminiResult {...props} record={props.record} />
    ) : (
      <GeminiTextResult {...props} record={props.record} />
    )
  ) : (
    <LocalResult {...props} record={props.record} />
  );
}
export function LocalPanel({ draft }: { draft: ActionDraft }) {
  return draft.execution === "gemini" ? (
    <GeminiPanel key={draft.snapshot.id} draft={draft} />
  ) : (
    <LocalOnlyPanel draft={draft} />
  );
}
function LocalOnlyPanel({ draft }: { draft: ActionDraft }) {
  const operation = draft.entry === "summon" ? "check" : draft.entry;
  const activity = useTaskActivity(
    draft.presentation === "brewing" ? "brewing" : operationPose(operation),
  );
  const materials = useDocuments((s) => s.materials);
  const current = materials.find((m) => m.id === draft.snapshot.materialId);
  const saveStatus = useDocuments((s) => s.status[draft.snapshot.materialId]);
  const [record, setRecord] = useState<LocalRecord>();
  const [excerptLimit, setExcerptLimit] = useState(
    () => draft.excerptLimit ?? defaultExcerptLimit(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const close = () => {
    if (!lock.current) {
      if (!record) captureOutcome()("cancel");
      useInteraction.setState({ draft: undefined });
    }
  };
  const reset = () => {
    if (current) {
      activity.clear();
      setRecord(undefined);
      setExcerptLimit(defaultExcerptLimit());
      setError("");
      useInteraction.setState({
        draft: { ...draft, snapshot: snapshot(current) },
      });
    }
  };
  async function submit(origin: Element) {
    if (lock.current) return;
    const finish = captureOutcome();
    const finishActivity = activity.start(origin);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const computed = runLocal(
        operation,
        draft.snapshot,
        draft.instruction,
        excerptLimit,
      );
      const saved = await repository.saveRecord(computed);
      finishActivity("success");
      finish("success");
      setRecord(saved);
      completedForProposal(saved);
    } catch (e) {
      finishActivity("error");
      finish("error");
      setError(e instanceof Error ? e.message : "处理或保存失败，请重试。");
    } finally {
      lock.current = false;
      setBusy(false);
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
        <LocalResult
          record={record}
          close={close}
          again={reset}
          summon={() =>
            useInteraction.setState({ draft: summonFromResult(record) })
          }
        />
      ) : (
        <>
          <div className="eyebrow">
            {labels[operation]} · 本地规则／模板 · 未接入 AI
          </div>
          <h2>确认本次处理材料</h2>
          <ExecutionChoice
            value="local"
            disabled={busy}
            onChange={(execution) =>
              useInteraction.setState({
                draft: {
                  ...draft,
                  execution,
                  excerptLimit:
                    operation === "understand" ? excerptLimit : undefined,
                  summaryStyle:
                    operation === "understand" ? draft.summaryStyle : undefined,
                },
              })
            }
          />
          <p className="notice">{limitDescription(operation, excerptLimit)}</p>
          {operation === "understand" && (
            <ExcerptChoice
              value={excerptLimit}
              onChange={setExcerptLimit}
              disabled={busy}
            />
          )}
          <label className="field-label" htmlFor="check-instruction">
            补充要求（仅记录，本地规则不执行自由文本要求）
          </label>
          <textarea
            id="check-instruction"
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
            <strong>{draft.snapshot.title}</strong>
            <SourceInfo value={draft.snapshot} />
            <p>
              版本 {draft.snapshot.materialVersion} · UTF-16 范围 [
              {draft.snapshot.start}, {draft.snapshot.end})
            </p>
            <pre data-testid="snapshot-text">{draft.snapshot.text}</pre>
          </div>
          {current?.version !== draft.snapshot.materialVersion && (
            <div className="notice">
              原文已经变化，此处仍是打开面板时的副本。
              {current && (
                <button disabled={busy} onClick={reset}>
                  更新为当前全文
                </button>
              )}
            </div>
          )}
          {saveStatus !== "已保存" && (
            <p className="notice">
              原文尚未成功保存，本次处理确认面板中的副本；处理结果保存不代表原文已经落盘。
            </p>
          )}
          <p>仅在本机处理；完成后保存材料副本和处理结果。不修改原文。</p>
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
              {busy ? "正在处理并保存…" : actions[operation]}
            </button>
            <button aria-label="关闭材料面板" disabled={busy} onClick={close}>
              继续自己工作
            </button>
          </div>
        </>
      )}
    </FloatingPanel>
  );
}

export function LocalHistory({ close }: { close: () => void }) {
  const [records, setRecords] = useState<StoredRecord[]>([]);
  const [selected, setSelected] = useState<StoredRecord>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void repository
      .listRecords()
      .then(setRecords)
      .catch(() => setError("处理记录读取失败，请关闭后重试。"))
      .finally(() => setLoading(false));
  }, []);
  return (
    <Dialog title="处理记录" close={close}>
      {selected ? (
        isBatchRecord(selected) ? (
          <BatchResult record={selected} close={() => setSelected(undefined)}
            again={() => { if (prepareBatchAgain(selected, selected.operation, familiarForBatch(selected))) close(); }}
            summon={() => { close(); openBatchDraft(batchContinuationDraft(selected)); }} />
        ) : selected.operation === "joint" ? (
          <JointResult
            record={selected}
            close={() => setSelected(undefined)}
            again={() => {
              if (prepareJointAgain(selected)) close();
            }}
          />
        ) : (
          <ProcessingResult
            key={selected.id}
            summon={() => {
              close();
              useInteraction.setState({
                book: false,
                draft: summonFromResult(selected),
              });
            }}
            record={selected}
            close={() => setSelected(undefined)}
            again={() => {
              const current = useDocuments
                .getState()
                .materials.find((m) => m.id === selected.snapshot.materialId);
              if (current) {
                close();
                useInteraction.setState({
                  draft: {
                    entry: selected.operation,
                    execution:
                      selected.execution === "gemini" ? "gemini" : "local",
                    snapshot: snapshot(current),
                    instruction: selected.instruction,
                    familiar: summonFromResult(selected).familiar,
                    ...(selected.operation === "understand"
                      ? selected.execution === "gemini"
                        ? { summaryStyle: selected.summaryStyle }
                        : { excerptLimit: selected.excerptLimit ?? 8 }
                      : {}),
                  },
                });
              }
            }}
          />
        )
      ) : (
        <>
          <h2>处理记录</h2>
          <p>
            仅包含已成功保存的处理结果，各记录标明执行方式；使魔回信在
            Familiars。
          </p>
          {loading && <p role="status">正在读取…</p>}
          {error && <p role="alert">{error}</p>}
          {!loading && !error && records.length === 0 && (
            <p>还没有处理记录。</p>
          )}
          {records.map((r) => (
            <div className="scope" key={r.id}>
              <strong>
                {isBatchRecord(r) ? r.snapshots.map((s) => s.title + " · 版本 " + s.materialVersion).join(" ＋ ") : r.operation === "joint"
                  ? r.sources
                      .map(
                        (part) =>
                          part.snapshot.title +
                          " · 版本 " +
                          part.snapshot.materialVersion,
                      )
                      .join(" ＋ ")
                  : r.snapshot.title + " · 版本 " + r.snapshot.materialVersion}
              </strong>
              <p>
                {new Date(r.createdAt).toLocaleString()} ·{" "}
                {isBatchRecord(r) ? "多材料 " + labels[r.operation] + " · Gemini" : r.operation === "joint"
                  ? "两份文本联合整理"
                  : labels[r.operation] +
                    " · " +
                    (r.execution === "gemini"
                      ? r.operation === "check"
                        ? geminiHeading(r)
                        : geminiTextHeading(r)
                      : resultHeading(r))}
              </p>
              <button onClick={() => setSelected(r)}>
                {isBatchRecord(r) ? "查看多材料 " + labels[r.operation] + " 结果" : r.operation === "joint"
                  ? "查看联合整理结果"
                  : r.operation === "check"
                    ? "查看检查结果"
                    : "查看" + labels[r.operation] + "结果"}
              </button>
            </div>
          ))}
          <div className="panel-actions">
            <button onClick={close}>关闭处理记录</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
