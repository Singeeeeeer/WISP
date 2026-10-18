import { downloadText } from "../../shared/download";
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
  total_input_tokens: "Input",
  total_output_tokens: "Output",
  total_thought_tokens: "Thoughts",
  total_cached_tokens: "Cached",
  total_tool_use_tokens: "Tools",
  total_tokens: "Total",
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
  const resultText = () =>
    [
      "Check · Gemini",
      geminiHeading(r),
      GEMINI_LIMIT,
      stale ? "Old-version result; not the current material" : "",
      r.snapshot.title + " · Version " + r.snapshot.materialVersion,
      sourceDescription(r.snapshot),
      "Additional instruction: " + r.instruction,
      ...r.findings.flatMap((f) => [
        f.title,
        f.explanation,
        "Suggestion: " + f.suggestion,
        ...f.evidence.map(
          (e) =>
            "Source evidence [" +
            (r.snapshot.start + e.start) +
            ", " +
            (r.snapshot.start + e.end) +
            "): " +
            e.quote,
        ),
      ]),
      "To add: ",
      ...r.missingInformation,
      "Model: " + meta.modelId,
      "Duration (ms): " + meta.durationMs,
      "Usage: " + (meta.usage ? JSON.stringify(meta.usage) : "Not provided"),
    ].join("\n");
  const copy = async () => {
    const finish = captureOutcome();
    try {
      await navigator.clipboard.writeText(resultText());
      if (finish("success")) setCopied("Result copied");
    } catch {
      if (finish("error"))
        setCopied("Copy failed. Select and copy the result text manually.");
    }
  };
  return (
    <>
      <div className="eyebrow">Check · Gemini · Saved</div>
      <h2>{geminiHeading(r)}</h2>
      <p>
        {r.snapshot.title} · Version {r.snapshot.materialVersion} ·{" "}
        {new Date(r.createdAt).toLocaleString("en-US")}
      </p>
      <SourceInfo value={r.snapshot} />
      {stale && (
        <p role="status" className="notice">
          The source has changed or is unavailable. This result uses an older
          version and does not represent the current material.
        </p>
      )}
      <p className="notice">{GEMINI_LIMIT}</p>
      {r.instruction && <p>Additional instruction: {r.instruction}</p>}
      {r.findings.map((f, i) => (
        <section className="scope" key={i}>
          <h3>{f.title}</h3>
          <p>{f.explanation}</p>
          <p>Suggestion: {f.suggestion}</p>
          {f.evidence.map((e, j) => (
            <blockquote key={j}>
              <pre>{e.quote}</pre>
              <small>
                Source text version {r.snapshot.materialVersion} · UTF-16 range
                [{r.snapshot.start + e.start}, {r.snapshot.start + e.end})
              </small>
            </blockquote>
          ))}
        </section>
      ))}
      {r.missingInformation.length > 0 && (
        <section className="scope">
          <h3>Information to add</h3>
          <ul>
            {r.missingInformation.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </section>
      )}
      <details className="scope">
        <summary>Execution details</summary>
        <p>
          Model: {meta.modelId} · Duration: {Math.round(meta.durationMs)} ms
        </p>
        <p>
          Prompt {meta.promptVersion} · Validator {meta.validatorVersion}
        </p>
        <p>Provider-reported usage (tokens):</p>
        {meta.usage ? (
          Object.entries(meta.usage).map(([key, value]) => (
            <p key={key}>
              {usageLabels[key] ?? key}: {value}
            </p>
          ))
        ) : (
          <p>Not provided; no estimate</p>
        )}
      </details>
      <details className="scope">
        <summary>View the complete material copy for this run</summary>
        <pre data-testid="check-source">{r.snapshot.text}</pre>
      </details>
      <p role="status">{copied}</p>
      <div className="panel-actions">
        <button onClick={() => void copy()}>Copy result</button>
        <button
          onClick={() =>
            downloadText(
              "Wisp-check-result.md",
              `# Wisp check result\n\n${resultText()}`,
              "text/markdown;charset=utf-8",
            )
          }
        >
          Save result as Markdown
        </button>
        {summon && <button onClick={summon}>Summon familiar again</button>}
        <button disabled={!current} onClick={again}>
          {againLabel ?? "Check current full text again"}
        </button>
        <button onClick={close}>Close check result</button>
      </div>
    </>
  );
}
