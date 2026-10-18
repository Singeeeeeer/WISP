import { captureOutcome } from "../companion/outcome";
import { useState } from "react";
import {
  GEMINI_LIMIT,
  geminiHeading,
  type GeminiCheckRecord,
} from "../../domain/gemini-check";
import { useDocuments } from "../../state/stores";
import { SourceInfo } from "../../shared/SourceInfo";
import { sourceDescription } from "../../domain/cauldron";
const usageLabels: Record<string, string> = {
  total_input_tokens: "输入",
  total_output_tokens: "输出",
  total_thought_tokens: "思考",
  total_cached_tokens: "缓存",
  total_tool_use_tokens: "工具",
  total_tokens: "总计",
};
export function GeminiResult({
  record: r,
  close,
  again,
  againLabel,
  summon,
}: {
  record: GeminiCheckRecord;
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
  const copy = async () => {
    const finish = captureOutcome();
    try {
      await navigator.clipboard.writeText(
        [
          "Check · Gemini",
          geminiHeading(r),
          GEMINI_LIMIT,
          stale ? "旧版本结果，不代表当前材料" : "",
          r.snapshot.title + " · 版本 " + r.snapshot.materialVersion,
          sourceDescription(r.snapshot),
          "补充要求：" + r.instruction,
          ...r.findings.flatMap((f) => [
            f.title,
            f.explanation,
            "建议：" + f.suggestion,
            ...f.evidence.map(
              (e) =>
                "原文依据 [" +
                (r.snapshot.start + e.start) +
                "," +
                (r.snapshot.start + e.end) +
                ")：" +
                e.quote,
            ),
          ]),
          "待补充：",
          ...r.missingInformation,
          "模型：" + meta.modelId,
          "耗时(ms)：" + meta.durationMs,
          "用量：" + (meta.usage ? JSON.stringify(meta.usage) : "未提供"),
        ].join("\n"),
      );
      if (finish("success")) setCopied("已复制结果");
    } catch {
      if (finish("error")) setCopied("复制失败，请手动选择结果文字复制。");
    }
  };
  return (
    <>
      <div className="eyebrow">Check · Gemini · 已保存</div>
      <h2>{geminiHeading(r)}</h2>
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
      <p className="notice">{GEMINI_LIMIT}</p>
      {r.instruction && <p>补充要求：{r.instruction}</p>}
      {r.findings.map((f, i) => (
        <section className="scope" key={i}>
          <h3>{f.title}</h3>
          <p>{f.explanation}</p>
          <p>建议：{f.suggestion}</p>
          {f.evidence.map((e, j) => (
            <blockquote key={j}>
              <pre>{e.quote}</pre>
              <small>
                原文版本 {r.snapshot.materialVersion} · UTF-16 区间 [
                {r.snapshot.start + e.start}, {r.snapshot.start + e.end})
              </small>
            </blockquote>
          ))}
        </section>
      ))}
      {r.missingInformation.length > 0 && (
        <section className="scope">
          <h3>待补充信息</h3>
          <ul>
            {r.missingInformation.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </section>
      )}
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
        {summon && <button onClick={summon}>继续召唤使魔</button>}
        <button disabled={!current} onClick={again}>
          {againLabel ?? "再次检查当前全文"}
        </button>
        <button onClick={close}>关闭检查结果</button>
      </div>
    </>
  );
}
