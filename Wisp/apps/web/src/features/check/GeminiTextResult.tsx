import { captureOutcome } from "../companion/outcome";
import { useState } from "react";
import {
  GEMINI_TEXT_LIMIT,
  geminiTextHeading,
  type GeminiTextRecord,
} from "../../domain/gemini-text";
import type { Evidence } from "../../domain/check";
import { useDocuments } from "../../state/stores";
import { SourceInfo } from "../../shared/SourceInfo";
import { sourceDescription } from "../../domain/cauldron";
import { labels } from "../../domain/local-text";

const usageLabels: Record<string, string> = {
  total_input_tokens: "输入",
  total_output_tokens: "输出",
  total_thought_tokens: "思考",
  total_cached_tokens: "缓存",
  total_tool_use_tokens: "工具",
  total_tokens: "总计",
};
export function GeminiTextResult({
  record: r,
  close,
  again,
  againLabel,
  summon,
}: {
  record: GeminiTextRecord;
  close: () => void;
  again: () => void;
  againLabel?: string;
  summon?: () => void;
}) {
  const current = useDocuments((s) => s.materials).find(
    (m) => m.id === r.snapshot.materialId,
  );
  const stale =
    !current ||
    current.version !== r.snapshot.materialVersion ||
    current.title !== r.snapshot.title ||
    current.text.slice(r.snapshot.start, r.snapshot.end) !== r.snapshot.text;
  const [copied, setCopied] = useState("");
  const meta = r.metadata;
  const evidenceText = (e: Evidence) =>
    "原文依据 [" +
    (r.snapshot.start + e.start) +
    "," +
    (r.snapshot.start + e.end) +
    ")：" +
    e.quote;
  const evidence = (items: Evidence[]) =>
    items.map((e, i) => (
      <blockquote key={i}>
        <pre>{e.quote}</pre>
        <small>
          原文版本 {r.snapshot.materialVersion} · UTF-16 区间 [
          {r.snapshot.start + e.start}, {r.snapshot.start + e.end})
        </small>
      </blockquote>
    ));
  async function copy(draftOnly = false) {
    const finish = captureOutcome();
    try {
      const body =
        r.operation === "understand"
          ? [
              "摘要长度：" + (r.summaryStyle === "brief" ? "简短" : "标准"),
              "材料概述",
              r.summary || "材料不足，尚未生成摘要。",
              ...r.summaryEvidence.map(evidenceText),
              "要点",
              ...r.keyPoints.flatMap((p) => [
                p.title,
                p.explanation,
                ...p.evidence.map(evidenceText),
              ]),
            ]
          : [
              "AI草稿（待人工确认）",
              r.draft || "材料不足，尚未生成草稿。",
              "备选方向（建议）",
              ...r.alternatives.flatMap((a) => [a.title, a.description]),
              "采用的原文依据",
              ...r.sourceFacts.flatMap((f) => [
                f.statement,
                ...f.evidence.map(evidenceText),
              ]),
              "创作假设",
              ...(r.assumptions.length ? r.assumptions : ["无"]),
            ];
      const text =
        draftOnly && r.operation === "create"
          ? r.draft
          : [
              labels[r.operation] + " · Gemini",
              geminiTextHeading(r),
              GEMINI_TEXT_LIMIT,
              stale ? "旧版本结果，不代表当前材料" : "",
              r.snapshot.title + " · 版本 " + r.snapshot.materialVersion,
              "生成时间：" + r.createdAt,
              sourceDescription(r.snapshot),
              "补充要求：" + r.instruction,
              ...body,
              "待补充信息",
              ...(r.missingInformation.length ? r.missingInformation : ["无"]),
              "模型：" + meta.modelId,
              "提示词：" + meta.promptVersion,
              "校验：" + meta.validatorVersion,
              "耗时(ms)：" + meta.durationMs,
              "供应商返回用量：" +
                (meta.usage ? JSON.stringify(meta.usage) : "未提供，不作估算"),
            ].join("\n");
      await navigator.clipboard.writeText(text);
      if (finish("success"))
        setCopied(draftOnly ? "已仅复制草稿正文" : "已复制结果");
    } catch {
      if (finish("error")) setCopied("复制失败，请手动选择结果文字复制。");
    }
  }
  return (
    <>
      <div className="eyebrow">{labels[r.operation]} · Gemini · 已保存</div>
      <h2>{geminiTextHeading(r)}</h2>
      <p>
        {r.snapshot.title} · 版本 {r.snapshot.materialVersion} ·{" "}
        {new Date(r.createdAt).toLocaleString()}
      </p>
      <SourceInfo value={r.snapshot} />
      {stale && (
        <p role="status" className="notice">
          原文已变化或不可用：这是旧版本的结果，不代表当前材料。
        </p>
      )}
      <p className="notice">{GEMINI_TEXT_LIMIT}</p>
      {r.instruction && <p>补充要求：{r.instruction}</p>}
      {r.operation === "understand" ? (
        <>
          <p>
            本次摘要长度：
            {r.summaryStyle === "brief"
              ? "简短 · 最多 3 个要点"
              : "标准 · 最多 8 个要点"}
          </p>
          <section className="scope">
            <h3>材料概述</h3>
            <pre>{r.summary || "材料不足，尚未生成摘要。"}</pre>
            {evidence(r.summaryEvidence)}
          </section>
          {r.keyPoints.map((p, i) => (
            <section className="scope" key={i}>
              <h3>{p.title}</h3>
              <pre>{p.explanation}</pre>
              {evidence(p.evidence)}
            </section>
          ))}
        </>
      ) : (
        <>
          <section className="scope">
            <h3>AI草稿（待人工确认）</h3>
            <pre data-testid="gemini-draft">
              {r.draft || "材料不足，尚未生成草稿。"}
            </pre>
          </section>
          <section className="scope">
            <h3>备选方向（建议）</h3>
            {r.alternatives.length ? (
              r.alternatives.map((a, i) => (
                <div key={i}>
                  <h4>{a.title}</h4>
                  <pre>{a.description}</pre>
                </div>
              ))
            ) : (
              <p>没有备选方向。</p>
            )}
          </section>
          <section className="scope">
            <h3>采用的原文依据</h3>
            {r.sourceFacts.length ? (
              r.sourceFacts.map((f, i) => (
                <div key={i}>
                  <pre>{f.statement}</pre>
                  {evidence(f.evidence)}
                </div>
              ))
            ) : (
              <p>没有采用可引用的原文事实。</p>
            )}
          </section>
          <section className="scope">
            <h3>创作假设</h3>
            {r.assumptions.length ? (
              <ul>
                {r.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <p>未列出创作假设；仍需人工核对。</p>
            )}
          </section>
        </>
      )}
      <section className="scope">
        <h3>待补充信息</h3>
        {r.missingInformation.length ? (
          <ul>
            {r.missingInformation.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        ) : (
          <p>未列出，不代表材料完整。</p>
        )}
      </section>
      <details className="scope">
        <summary>执行信息</summary>
        <p>
          模型：{meta.modelId} · 耗时 {Math.round(meta.durationMs)} ms
        </p>
        <p>
          提示词 {meta.promptVersion} · 校验 {meta.validatorVersion}
        </p>
        <p>供应商返回用量（tokens）：</p>
        {meta.usage ? (
          Object.entries(meta.usage).map(([key, value]) => (
            <p key={key}>
              {usageLabels[key] ?? key}：{value}
            </p>
          ))
        ) : (
          <p>未提供，不作估算</p>
        )}
      </details>
      <details className="scope">
        <summary>查看本次完整材料副本</summary>
        <pre data-testid="check-source">{r.snapshot.text}</pre>
      </details>
      <p role="status">{copied}</p>
      <div className="panel-actions">
        <button onClick={() => void copy()}>复制结果</button>
        {r.operation === "create" && (
          <button
            disabled={!r.draft}
            title="只复制草稿正文，不含依据、假设和执行信息"
            onClick={() => void copy(true)}
          >
            仅复制草稿
          </button>
        )}
        {summon && <button onClick={summon}>继续召唤使魔</button>}
        <button disabled={!current} onClick={again}>
          {againLabel ?? "重新处理当前全文"}
        </button>
        <button onClick={close}>关闭处理结果</button>
      </div>
    </>
  );
}
