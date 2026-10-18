import { useRef, useState } from "react";
import type { BatchEvidence, BatchRecord } from "../../domain/batch";
import type { MaterialSnapshot } from "../../domain/model";
import { sourceDescription } from "../../domain/cauldron";
import { useDocuments } from "../../state/stores";
import { SourceInfo } from "../../shared/SourceInfo";
import { captureOutcome } from "../companion/outcome";
import "./batch.css";

export function BatchSources({ snapshots }: { snapshots: MaterialSnapshot[] }) {
  const materials = useDocuments((s) => s.materials);
  return (
    <div aria-label="本次多材料来源">
      {snapshots.map((s, index) => {
        const current = materials.find((m) => m.id === s.materialId);
        const stale =
          !current ||
          current.version !== s.materialVersion ||
          current.title !== s.title ||
          current.text.slice(s.start, s.end) !== s.text;
        return (
          <section className="scope" key={s.id}>
            <strong>
              材料 {index + 1} · {s.title}
            </strong>
            <p>
              版本 {s.materialVersion} · UTF-16 范围 [{s.start}, {s.end})
            </p>
            <SourceInfo value={s} />
            {stale && (
              <p role="status" className="notice">
                此来源已变化或不可用：保留的是旧版本副本。
              </p>
            )}
            <details>
              <summary>查看材料 {index + 1} 冻结文字</summary>
              <pre>{s.text}</pre>
            </details>
          </section>
        );
      })}
    </div>
  );
}

function evidenceLabel(e: BatchEvidence, snapshots: MaterialSnapshot[]) {
  const s = snapshots[e.sourceIndex - 1];
  return `材料 ${e.sourceIndex} · ${s.title} · 版本 ${s.materialVersion} · UTF-16 区间 [${s.start + e.start}, ${s.start + e.end})`;
}
function Evidence({
  items,
  snapshots,
}: {
  items: BatchEvidence[];
  snapshots: MaterialSnapshot[];
}) {
  return (
    <>
      {items.map((e, index) => (
        <blockquote key={index}>
          <pre>{e.quote}</pre>
          <small>{evidenceLabel(e, snapshots)}</small>
        </blockquote>
      ))}
    </>
  );
}
function copyText(r: BatchRecord) {
  const refs = (items: BatchEvidence[]) =>
    items
      .map((e) => `${evidenceLabel(e, r.snapshots)}\n“${e.quote}”`)
      .join("\n");
  const body =
    r.operation === "check"
      ? [
          r.findings.length
            ? "疑点需人工核对"
            : r.outcome === "needs_information"
              ? "需要补充信息"
              : "未发现明显问题（不代表材料正确）",
          ...r.findings.map(
            (f) =>
              `${f.title}\n${f.explanation}\n建议：${f.suggestion}\n${refs(f.evidence)}`,
          ),
        ]
      : r.operation === "understand"
        ? [
            r.summary || "材料不足，尚未生成摘要。",
            refs(r.summaryEvidence),
            ...r.keyPoints.map(
              (p) => `${p.title}\n${p.explanation}\n${refs(p.evidence)}`,
            ),
          ]
        : [
            "AI 草稿（待人工确认）",
            r.draft || "材料不足，尚未生成草稿。",
            ...r.alternatives.map(
              (a) => `备选方向：${a.title}\n${a.description}`,
            ),
            ...r.sourceFacts.map(
              (f) => `采用的原文事实：${f.statement}\n${refs(f.evidence)}`,
            ),
            ...r.assumptions.map((a) => `创作假设：${a}`),
          ];
  return [
    `多材料 ${r.operation} · Gemini · 结果需人工审阅`,
    `要求：${r.instruction || "无"}`,
    ...r.snapshots.map(
      (s, i) =>
        `材料 ${i + 1}：${s.title} · ID ${s.materialId} · 版本 ${s.materialVersion} · 范围 [${s.start}, ${s.end})\n${sourceDescription(s)}`,
    ),
    ...body,
    ...r.missingInformation.map((m) => `待补充：${m}`),
    `模型：${r.metadata.modelId} · ${r.createdAt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function BatchResult({
  record: r,
  close,
  again,
  summon,
}: {
  record: BatchRecord;
  close: () => void;
  again: () => void;
  summon?: () => void;
}) {
  const materials = useDocuments((s) => s.materials);
  const [copy, setCopy] = useState("");
  const copyTicket = useRef(0);
  async function copyResult(draftOnly = false) {
    const ticket = ++copyTicket.current;
    const finish = captureOutcome();
    try {
      await navigator.clipboard.writeText(
        draftOnly && r.operation === "create" ? r.draft : copyText(r),
      );
      if (ticket === copyTicket.current && finish("success")) setCopy("已复制");
    } catch {
      if (ticket === copyTicket.current && finish("error"))
        setCopy("复制失败，请重试。");
    }
  }
  const label = r.operation[0].toUpperCase() + r.operation.slice(1);
  return (
    <div className="batch-result">
      <div className="eyebrow">GEMINI · {r.snapshots.length} 份独立材料</div>
      <h2>多材料 {label} 结果</h2>
      <p className="notice">
        依据本次冻结文字综合生成；引用匹配只证明文字存在于指定材料，不保证概括或草稿正确。结果不修改原文。
      </p>
      {r.instruction && <p>补充要求：{r.instruction}</p>}
      {r.operation === "understand" && (
        <>
          <h3>综合摘要</h3>
          <p>{r.summary || "材料不足，尚未生成摘要。"}</p>
          <Evidence items={r.summaryEvidence} snapshots={r.snapshots} />
          {r.keyPoints.map((p, i) => (
            <section className="scope" key={i}>
              <h3>{p.title}</h3>
              <p>{p.explanation}</p>
              <Evidence items={p.evidence} snapshots={r.snapshots} />
            </section>
          ))}
        </>
      )}
      {r.operation === "check" && (
        <>
          {!r.findings.length && (
            <p>
              {r.outcome === "needs_information"
                ? "需要补充信息"
                : "未发现明显问题（不代表材料正确）"}
            </p>
          )}
          {r.findings.map((f, i) => (
            <section className="scope" key={i}>
              <h3>{f.title}</h3>
              <p>{f.explanation}</p>
              <p>建议：{f.suggestion}</p>
              <Evidence items={f.evidence} snapshots={r.snapshots} />
            </section>
          ))}
        </>
      )}
      {r.operation === "create" && (
        <>
          <h3>AI 草稿（待人工确认）</h3>
          <pre className="batch-draft">
            {r.draft || "材料不足，尚未生成草稿。"}
          </pre>
          {r.alternatives.map((a, i) => (
            <section className="scope" key={i}>
              <h3>备选：{a.title}</h3>
              <p>{a.description}</p>
            </section>
          ))}
          {r.sourceFacts.map((f, i) => (
            <section className="scope" key={i}>
              <h3>采用的原文事实</h3>
              <p>{f.statement}</p>
              <Evidence items={f.evidence} snapshots={r.snapshots} />
            </section>
          ))}
          {!!r.assumptions.length && (
            <section>
              <h3>创作假设</h3>
              <ul>
                {r.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {!!r.missingInformation.length && (
        <section>
          <h3>待补充信息</h3>
          <ul>
            {r.missingInformation.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      <h3>本次材料与版本</h3>
      <BatchSources snapshots={r.snapshots} />
      <p className="subtle">
        模型 {r.metadata.modelId} · {new Date(r.createdAt).toLocaleString()} ·
        耗时 {r.metadata.durationMs} ms
      </p>
      <p role="status">{copy}</p>
      <div className="panel-actions">
        <button onClick={() => void copyResult()}>复制多材料结果</button>
        {r.operation === "create" && (
          <button disabled={!r.draft} onClick={() => void copyResult(true)}>
            仅复制草稿
          </button>
        )}
        {summon && <button onClick={summon}>继续召唤使魔</button>}
        <button
          disabled={r.snapshots.some(
            (s) => !materials.some((m) => m.id === s.materialId),
          )}
          onClick={again}
        >
          重新确认当前材料
        </button>
        <button onClick={close}>关闭多材料结果</button>
      </div>
    </div>
  );
}
