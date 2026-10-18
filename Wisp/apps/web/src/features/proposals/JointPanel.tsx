import { captureOutcome } from "../companion/outcome";
import { sourceDescription } from "../../domain/cauldron";
import { SourceInfo } from "../../shared/SourceInfo";
import { useRef, useState } from "react";
import {
  jointLimit,
  runJoint,
  type JointDraft,
  type JointRecord,
} from "../../domain/joint";
import { snapshot } from "../../domain/model";
import { createRepository } from "../../services/repository";
import {
  defaultExcerptLimit,
  finishJointInvitation,
} from "../../services/proposal-runtime";
import { useDocuments, useInteraction } from "../../state/stores";
import { Dialog } from "../../shared/Dialog";
import { LocalResult } from "../check/CheckPanel";
import { ExcerptChoice } from "./ExcerptChoice";
const repository = createRepository();
export function prepareJointAgain(record: JointRecord) {
  const materials = useDocuments.getState().materials;
  const current = record.sources.map((s) =>
    materials.find((m) => m.id === s.snapshot.materialId),
  );
  if (current.some((m) => !m)) return false;
  useInteraction.setState({
    book: false,
    menu: false,
    jointDraft: {
      id: crypto.randomUUID(),
      snapshots: current.map((m) => snapshot(m!)) as JointDraft["snapshots"],
      excerptLimit: defaultExcerptLimit(),
    },
  });
  return true;
}
export function JointResult({
  record,
  close,
  again,
}: {
  record: JointRecord;
  close: () => void;
  again: () => void;
}) {
  const materials = useDocuments((s) => s.materials);
  const [copy, setCopy] = useState("");
  const available = record.sources.every((s) =>
    materials.some((m) => m.id === s.snapshot.materialId),
  );
  async function copyResult() {
    const finish = captureOutcome();
    const text = [
      "两份文本的联合整理 · 本地摘录 · 未接入 AI",
      jointLimit,
      `每份最多 ${record.excerptLimit} 个非空行`,
      ...record.sources.flatMap((part) => {
        const s = part.snapshot;
        const current = materials.find((m) => m.id === s.materialId);
        const stale =
          !current ||
          current.version !== s.materialVersion ||
          current.title !== s.title ||
          current.text !== s.text;
        return [
          `来源：${s.title} · ID ${s.materialId} · 版本 ${s.materialVersion}`,
          `全文 UTF-16 范围 [${s.start}, ${s.end})`,
          sourceDescription(s),
          stale ? "旧版本结果，不代表当前材料" : "",
          ...part.excerpts.map(
            (e) =>
              `${e.quote}\n原文依据：${s.title} · ID ${s.materialId} · 版本 ${s.materialVersion} · UTF-16 [${s.start + e.start}, ${s.start + e.end})`,
          ),
          `未展示的非空行：${part.omittedLines}`,
        ];
      }),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      if (finish("success")) setCopy("已复制联合整理结果");
    } catch {
      if (finish("error")) setCopy("复制失败，请手动选择结果文字复制。");
    }
  }
  return (
    <>
      <h2>两份文本的联合整理</h2>
      <p className="notice">{jointLimit}</p>
      {record.sources.map((part, i) => (
        <section
          className="scope"
          key={part.snapshot.materialId}
          data-testid="joint-result-source"
        >
          <h3>
            材料 {i + 1}：{part.snapshot.title}
          </h3>
          <p>
            来源 ID：{part.snapshot.materialId} · 全文 UTF-16 范围 [
            {part.snapshot.start}, {part.snapshot.end})
          </p>
          <LocalResult record={part} embedded close={close} again={again} />
        </section>
      ))}
      <p role="status">{copy}</p>
      <div className="panel-actions">
        <button onClick={() => void copyResult()}>复制联合整理结果</button>
        <button disabled={!available} onClick={again}>
          重新确认两份全文
        </button>
        <button onClick={close}>关闭联合整理结果</button>
      </div>
    </>
  );
}
export function JointPanel({ draft }: { draft: JointDraft }) {
  const materials = useDocuments((s) => s.materials);
  const [excerptLimit, setExcerptLimit] = useState(draft.excerptLimit);
  const [record, setRecord] = useState<JointRecord>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const close = () => {
    if (lock.current) return;
    if (!record) captureOutcome()("cancel");
    finishJointInvitation();
    useInteraction.setState({ jointDraft: undefined });
  };
  const current = draft.snapshots.map((s) =>
    materials.find((m) => m.id === s.materialId),
  );
  const stale = draft.snapshots.some(
    (s, i) =>
      !current[i] ||
      current[i]!.version !== s.materialVersion ||
      current[i]!.text !== s.text ||
      current[i]!.title !== s.title,
  );
  const refresh = () => {
    if (current.some((m) => !m) || lock.current) return;
    useInteraction.setState({
      jointDraft: {
        id: crypto.randomUUID(),
        snapshots: current.map((m) => snapshot(m!)) as JointDraft["snapshots"],
        excerptLimit,
      },
    });
  };
  async function submit() {
    if (lock.current) return;
    const finish = captureOutcome();
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await repository.saveRecord(
        runJoint({ ...draft, excerptLimit }),
      );
      finish("success");
      setRecord(saved);
      finishJointInvitation("completed");
    } catch (e) {
      finish("error");
      setError(e instanceof Error ? e.message : "联合整理保存失败，请重试。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title={record ? "联合整理结果" : "联合整理材料确认"} close={close}>
      {record ? (
        <JointResult
          record={record}
          close={close}
          again={() => prepareJointAgain(record)}
        />
      ) : (
        <>
          <div className="eyebrow">JOINT · 两份本地文本 · 未接入 AI</div>
          <h2>确认两份全文材料</h2>
          <p className="notice">{jointLimit}</p>
          <p>
            本次使用下面两份全文，不沿用单份文档的选区。只有点击“联合整理两份文本”后才处理和保存，不修改原文。
          </p>
          <ExcerptChoice
            value={excerptLimit}
            onChange={setExcerptLimit}
            disabled={busy}
          />
          <p>此行数上限分别用于每份材料。</p>
          {draft.snapshots.map((s, i) => (
            <section
              className="scope"
              key={s.materialId}
              data-testid="joint-source"
            >
              <h3>
                材料 {i + 1}：{s.title}
              </h3>
              <p>
                来源 ID：{s.materialId} · 版本 {s.materialVersion} · 全文 UTF-16
                范围 [{s.start}, {s.end})
              </p>
              <SourceInfo value={s} />
              <pre>{s.text}</pre>
            </section>
          ))}
          {stale && (
            <p className="notice">
              原文已经变化或不可用，当前仍是确认面板中的副本。
              <button
                disabled={busy || current.some((m) => !m)}
                onClick={refresh}
              >
                更新两份当前全文
              </button>
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="panel-actions">
            <button
              disabled={busy}
              className="primary"
              onClick={() => void submit()}
            >
              {busy ? "正在处理并保存…" : "联合整理两份文本"}
            </button>
            <button disabled={busy} onClick={close}>
              取消联合整理
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
