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
    <div aria-label="Sources for this multi-material run">
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
              Material {index + 1} · {s.title}
            </strong>
            <p>
              Version {s.materialVersion} · UTF-16 range [{s.start}, {s.end})
            </p>
            <SourceInfo value={s} />
            {stale && (
              <p role="status" className="notice">
                This source changed or is unavailable; the copy from the old version is retained.
              </p>
            )}
            <details>
              <summary>View the frozen text for material {index + 1}</summary>
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
  return `Material ${e.sourceIndex} · ${s.title} · Version ${s.materialVersion} · UTF-16 range [${s.start + e.start}, ${s.start + e.end})`;
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
            ? "Findings require human review"
            : r.outcome === "needs_information"
              ? "More information needed"
              : "No obvious issues found (this does not mean the material is correct)",
          ...r.findings.map(
            (f) =>
              `${f.title}\n${f.explanation}\nSuggestion: ${f.suggestion}\n${refs(f.evidence)}`,
          ),
        ]
      : r.operation === "understand"
        ? [
            r.summary || "Not enough material to generate a summary.",
            refs(r.summaryEvidence),
            ...r.keyPoints.map(
              (p) => `${p.title}\n${p.explanation}\n${refs(p.evidence)}`,
            ),
          ]
        : [
            "AI draft (requires human review)",
            r.draft || "Not enough material to generate a draft.",
            ...r.alternatives.map(
              (a) => `Alternative direction: ${a.title}\n${a.description}`,
            ),
            ...r.sourceFacts.map(
              (f) => `Source fact used: ${f.statement}\n${refs(f.evidence)}`,
            ),
            ...r.assumptions.map((a) => `Creative assumption: ${a}`),
          ];
  return [
    `Multi-material ${r.operation} · Gemini · result requires human review`,
    `Instruction: ${r.instruction || "None"}`,
    ...r.snapshots.map(
      (s, i) =>
        `Material ${i + 1}: ${s.title} · ID ${s.materialId} · Version ${s.materialVersion} · Range [${s.start}, ${s.end})\n${sourceDescription(s)}`,
    ),
    ...body,
    ...r.missingInformation.map((m) => `To add: ${m}`),
    `Model: ${r.metadata.modelId} · ${r.createdAt}`,
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
      if (ticket === copyTicket.current && finish("success")) setCopy("Copied");
    } catch {
      if (ticket === copyTicket.current && finish("error"))
        setCopy("Copy failed. Please try again.");
    }
  }
  const label = r.operation[0].toUpperCase() + r.operation.slice(1);
  return (
    <div className="batch-result">
      <div className="eyebrow">GEMINI · {r.snapshots.length} independent materials</div>
      <h2>Multi-material {label} result</h2>
      <p className="notice">
        Generated from the confirmed frozen text. Citation matches only show that text exists in the specified material; they do not guarantee that the summary or draft is correct. Results do not modify the source.
      </p>
      {r.instruction && <p>Additional instruction: {r.instruction}</p>}
      {r.operation === "understand" && (
        <>
          <h3>Combined summary</h3>
          <p>{r.summary || "Not enough material to generate a summary."}</p>
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
                ? "More information needed"
                : "No obvious issues found (this does not mean the material is correct)"}
            </p>
          )}
          {r.findings.map((f, i) => (
            <section className="scope" key={i}>
              <h3>{f.title}</h3>
              <p>{f.explanation}</p>
              <p>Suggestion: {f.suggestion}</p>
              <Evidence items={f.evidence} snapshots={r.snapshots} />
            </section>
          ))}
        </>
      )}
      {r.operation === "create" && (
        <>
          <h3>AI draft (requires human review)</h3>
          <pre className="batch-draft">
            {r.draft || "Not enough material to generate a draft."}
          </pre>
          {r.alternatives.map((a, i) => (
            <section className="scope" key={i}>
              <h3>Alternative: {a.title}</h3>
              <p>{a.description}</p>
            </section>
          ))}
          {r.sourceFacts.map((f, i) => (
            <section className="scope" key={i}>
              <h3>Source facts used</h3>
              <p>{f.statement}</p>
              <Evidence items={f.evidence} snapshots={r.snapshots} />
            </section>
          ))}
          {!!r.assumptions.length && (
            <section>
              <h3>Creative assumptions</h3>
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
          <h3>Information to add</h3>
          <ul>
            {r.missingInformation.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      <h3>Materials and versions in this run</h3>
      <BatchSources snapshots={r.snapshots} />
      <p className="subtle">
        Model: {r.metadata.modelId} · {new Date(r.createdAt).toLocaleString("en-US")} ·
        Duration: {r.metadata.durationMs} ms
      </p>
      <p role="status">{copy}</p>
      <div className="panel-actions">
        <button onClick={() => void copyResult()}>Copy multi-material result</button>
        {r.operation === "create" && (
          <button disabled={!r.draft} onClick={() => void copyResult(true)}>
            Copy draft only
          </button>
        )}
        {summon && <button onClick={summon}>Summon familiar again</button>}
        <button
          disabled={r.snapshots.some(
            (s) => !materials.some((m) => m.id === s.materialId),
          )}
          onClick={again}
        >
          Confirm current materials again
        </button>
        <button onClick={close}>Close multi-material result</button>
      </div>
    </div>
  );
}
