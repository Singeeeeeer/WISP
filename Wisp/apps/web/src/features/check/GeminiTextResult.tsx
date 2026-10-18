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
  total_input_tokens: "Input",
  total_output_tokens: "Output",
  total_thought_tokens: "Thoughts",
  total_cached_tokens: "Cached",
  total_tool_use_tokens: "Tools",
  total_tokens: "Total",
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
    "Source evidence [" +
    (r.snapshot.start + e.start) +
    ", " +
    (r.snapshot.start + e.end) +
    "): " +
    e.quote;
  const evidence = (items: Evidence[]) =>
    items.map((e, i) => (
      <blockquote key={i}>
        <pre>{e.quote}</pre>
        <small>
          Source text version {r.snapshot.materialVersion} · UTF-16 range [
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
              "Summary length: " + (r.summaryStyle === "brief" ? "Brief" : "Standard"),
              "Material overview",
              r.summary || "Not enough material to generate a summary.",
              ...r.summaryEvidence.map(evidenceText),
              "Key points",
              ...r.keyPoints.flatMap((p) => [
                p.title,
                p.explanation,
                ...p.evidence.map(evidenceText),
              ]),
            ]
          : [
              "AI draft (requires human review)",
              r.draft || "Not enough material to generate a draft.",
              "Alternative directions (suggestions)",
              ...r.alternatives.flatMap((a) => [a.title, a.description]),
              "Source evidence used",
              ...r.sourceFacts.flatMap((f) => [
                f.statement,
                ...f.evidence.map(evidenceText),
              ]),
              "Creative assumptions",
              ...(r.assumptions.length ? r.assumptions : ["None"]),
            ];
      const text =
        draftOnly && r.operation === "create"
          ? r.draft
          : [
              labels[r.operation] + " · Gemini",
              geminiTextHeading(r),
              GEMINI_TEXT_LIMIT,
              stale ? "Old-version result; not the current material" : "",
              r.snapshot.title + " · Version " + r.snapshot.materialVersion,
              "Created: " + r.createdAt,
              sourceDescription(r.snapshot),
              "Additional instruction: " + r.instruction,
              ...body,
              "Information to add",
              ...(r.missingInformation.length ? r.missingInformation : ["None"]),
              "Model: " + meta.modelId,
              "Prompt: " + meta.promptVersion,
              "Validator: " + meta.validatorVersion,
              "Duration (ms): " + meta.durationMs,
              "Provider-reported usage: " +
                (meta.usage ? JSON.stringify(meta.usage) : "Not provided; no estimate"),
            ].join("\n");
      await navigator.clipboard.writeText(text);
      if (finish("success"))
        setCopied(draftOnly ? "Draft text copied" : "Result copied");
    } catch {
      if (finish("error")) setCopied("Copy failed. Select and copy the result text manually.");
    }
  }
  return (
    <>
      <div className="eyebrow">{labels[r.operation]} · Gemini · Saved</div>
      <h2>{geminiTextHeading(r)}</h2>
      <p>
        {r.snapshot.title} · Version {r.snapshot.materialVersion} ·{" "}
        {new Date(r.createdAt).toLocaleString("en-US")}
      </p>
      <SourceInfo value={r.snapshot} />
      {stale && (
        <p role="status" className="notice">
          The source has changed or is unavailable. This result uses an older version and does not represent the current material.
        </p>
      )}
      <p className="notice">{GEMINI_TEXT_LIMIT}</p>
      {r.instruction && <p>Additional instruction: {r.instruction}</p>}
      {r.operation === "understand" ? (
        <>
          <p>
            Summary length for this run:{" "}
            {r.summaryStyle === "brief"
              ? "Brief · up to 3 key points"
              : "Standard · up to 8 key points"}
          </p>
          <section className="scope">
            <h3>Material overview</h3>
            <pre>{r.summary || "Not enough material to generate a summary."}</pre>
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
            <h3>AI draft (requires human review)</h3>
            <pre data-testid="gemini-draft">
              {r.draft || "Not enough material to generate a draft."}
            </pre>
          </section>
          <section className="scope">
            <h3>Alternative directions (suggestions)</h3>
            {r.alternatives.length ? (
              r.alternatives.map((a, i) => (
                <div key={i}>
                  <h4>{a.title}</h4>
                  <pre>{a.description}</pre>
                </div>
              ))
            ) : (
              <p>No alternative directions.</p>
            )}
          </section>
          <section className="scope">
            <h3>Source evidence used</h3>
            {r.sourceFacts.length ? (
              r.sourceFacts.map((f, i) => (
                <div key={i}>
                  <pre>{f.statement}</pre>
                  {evidence(f.evidence)}
                </div>
              ))
            ) : (
              <p>No citable source facts were used.</p>
            )}
          </section>
          <section className="scope">
            <h3>Creative assumptions</h3>
            {r.assumptions.length ? (
              <ul>
                {r.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <p>No creative assumptions listed; human review is still required.</p>
            )}
          </section>
        </>
      )}
      <section className="scope">
        <h3>Information to add</h3>
        {r.missingInformation.length ? (
          <ul>
            {r.missingInformation.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        ) : (
          <p>None listed; this does not mean the material is complete.</p>
        )}
      </section>
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
        {r.operation === "create" && (
          <button
            disabled={!r.draft}
            title="Copy draft text only; excludes evidence, assumptions, and execution details"
            onClick={() => void copy(true)}
          >
            Copy draft only
          </button>
        )}
        {summon && <button onClick={summon}>Summon familiar again</button>}
        <button disabled={!current} onClick={again}>
          {againLabel ?? "Process current full text again"}
        </button>
        <button onClick={close}>Close result</button>
      </div>
    </>
  );
}
