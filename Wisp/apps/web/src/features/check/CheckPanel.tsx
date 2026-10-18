import { downloadText } from "../../shared/download";
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
import {
  isBatchRecord,
  batchContinuationDraft,
  type BatchRecord,
} from "../../domain/batch";
import { BatchResult } from "../batch/BatchResult";
import {
  openBatchDraft,
  prepareBatchAgain,
  familiarForBatch,
} from "../batch/actions";
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
  const resultText = () =>
    [
      labels[record.operation] + " · Local rules/templates · No AI used",
      heading,
      stale ? "Old-version result; not the current material" : "",
      limitDescription(
        record.operation,
        record.operation === "understand" ? record.excerptLimit : undefined,
      ),
      `Material: ${record.snapshot.title} · Version ${record.snapshot.materialVersion}`,
      record.instruction
        ? `Additional instruction recorded in history: ${record.instruction}`
        : "",
      sourceDescription(record.snapshot),
      ...resultBody(record),
    ].join("\n");

  return (
    <>
      <div className="eyebrow">
        {labels[record.operation]} · Local rules/templates · No AI used
      </div>
      <h2>{heading}</h2>
      <p>
        {record.snapshot.title} · Version {record.snapshot.materialVersion} ·{" "}
        {new Date(record.createdAt).toLocaleString("en-US")}
      </p>
      <SourceInfo value={record.snapshot} />
      {stale && (
        <p role="status" className="notice">
          The source has changed or is unavailable. This result uses an older
          version and does not represent the current material.
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
          Additional instruction recorded in history: {record.instruction}{" "}
          (Local rules do not interpret or execute free-text instructions.)
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
                  Source text version {record.snapshot.materialVersion} · UTF-16
                  range [{record.snapshot.start + e.start},{" "}
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
              <h3>
                Template draft (not confirmed and not written back
                automatically)
              </h3>
              <pre data-testid="template-draft">{record.draft}</pre>
            </section>
          )}
          <section className="scope">
            <h3>
              {record.operation === "understand"
                ? "Excerpts in source order"
                : "Evidence for template fields"}
            </h3>
            {record.excerpts.map((e) => (
              <blockquote key={e.start}>
                <pre>{e.quote}</pre>
                <small>
                  Source text version {record.snapshot.materialVersion} · UTF-16
                  range [{record.snapshot.start + e.start},{" "}
                  {record.snapshot.start + e.end})
                </small>
              </blockquote>
            ))}
            {record.operation === "understand" && (
              <p>
                Non-empty lines not shown: {record.omittedLines}. These lines
                are not included in the excerpts for this run.
              </p>
            )}
            {record.operation === "create" && record.excerpts.length === 0 && (
              <p>
                No explicit fields could be used from the source. Fill in the
                template’s placeholders.
              </p>
            )}
          </section>
        </>
      )}
      <details className="scope">
        <summary>View the complete material copy for this run</summary>
        <pre data-testid="check-source">{record.snapshot.text}</pre>
      </details>
      <p role="status">{copy}</p>
      {!embedded && (
        <div className="panel-actions">
          <button
            onClick={() => {
              const finish = captureOutcome();
              void Promise.resolve()
                .then(() => navigator.clipboard.writeText(resultText()))
                .then(() => {
                  if (finish("success")) setCopy("Result copied");
                })
                .catch(() => {
                  if (finish("error"))
                    setCopy(
                      "Copy failed. Select and copy the result text manually.",
                    );
                });
            }}
          >
            Copy result
          </button>
          <button
            onClick={() =>
              downloadText(
                `Wisp-${record.operation}-result.md`,
                `# Wisp ${record.operation} result\n\n${resultText()}`,
                "text/markdown;charset=utf-8",
              )
            }
          >
            Save result as Markdown
          </button>
          {summon && <button onClick={summon}>Summon familiar again</button>}
          <button disabled={!current} onClick={again}>
            {againLabel ??
              (record.operation === "check"
                ? "Check current full text again"
                : "Process current full text again")}
          </button>
          <button onClick={close}>
            {record.operation === "check"
              ? "Close check result"
              : "Close result"}
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
  if (isBatchRecord(props.record))
    return <BatchResult {...props} record={props.record} />;
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
      setError(
        e instanceof Error
          ? e.message
          : "Processing or saving failed. Please retry.",
      );
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
            ? "Check result"
            : labels[operation] + " result"
          : "Material confirmation"
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
            {labels[operation]} · Local rules/templates · No AI used
          </div>
          <h2>Confirm material for this run</h2>
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
            Additional instruction (record only; local rules do not execute
            free-text instructions)
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
              Version {draft.snapshot.materialVersion} · UTF-16 range [
              {draft.snapshot.start}, {draft.snapshot.end})
            </p>
            <pre data-testid="snapshot-text">{draft.snapshot.text}</pre>
          </div>
          {current?.version !== draft.snapshot.materialVersion && (
            <div className="notice">
              The source changed; this is still the copy from when the panel
              opened.
              {current && (
                <button disabled={busy} onClick={reset}>
                  Update to current full text
                </button>
              )}
            </div>
          )}
          {saveStatus !== "saved" && (
            <p className="notice">
              The source has not been saved successfully. This run uses the copy
              in the confirmation panel; saving the result does not save the
              source.
            </p>
          )}
          <p>
            Processed locally; the material copy and result are saved when
            complete. The source is not modified.
          </p>
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
              {busy ? "Processing and saving…" : actions[operation]}
            </button>
            <button
              aria-label="Close material panel"
              disabled={busy}
              onClick={close}
            >
              Continue working
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
      .catch(() => setError("Could not load run history. Close and retry."))
      .finally(() => setLoading(false));
  }, []);
  return (
    <Dialog title="Run history" close={close}>
      {selected ? (
        isBatchRecord(selected) ? (
          <BatchResult
            record={selected}
            close={() => setSelected(undefined)}
            again={() => {
              if (
                prepareBatchAgain(
                  selected,
                  selected.operation,
                  familiarForBatch(selected),
                )
              )
                close();
            }}
            summon={() => {
              close();
              openBatchDraft(batchContinuationDraft(selected));
            }}
          />
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
          <h2>Run history</h2>
          <p>
            Only successfully saved results are shown, with execution mode;
            familiar replies appear in Familiars.
          </p>
          {loading && <p role="status">Loading…</p>}
          {error && <p role="alert">{error}</p>}
          {!loading && !error && records.length === 0 && (
            <p>No run history yet.</p>
          )}
          {records.map((r) => (
            <div className="scope" key={r.id}>
              <strong>
                {isBatchRecord(r)
                  ? r.snapshots
                      .map((s) => s.title + " · Version " + s.materialVersion)
                      .join(" + ")
                  : r.operation === "joint"
                    ? r.sources
                        .map(
                          (part) =>
                            part.snapshot.title +
                            " · Version " +
                            part.snapshot.materialVersion,
                        )
                        .join(" + ")
                    : r.snapshot.title +
                      " · Version " +
                      r.snapshot.materialVersion}
              </strong>
              <p>
                {new Date(r.createdAt).toLocaleString("en-US")} ·{" "}
                {isBatchRecord(r)
                  ? "Multi-material " + labels[r.operation] + " · Gemini"
                  : r.operation === "joint"
                    ? "Joint organization of two texts"
                    : labels[r.operation] +
                      " · " +
                      (r.execution === "gemini"
                        ? r.operation === "check"
                          ? geminiHeading(r)
                          : geminiTextHeading(r)
                        : resultHeading(r))}
              </p>
              <button onClick={() => setSelected(r)}>
                {isBatchRecord(r)
                  ? "View multi-material " + labels[r.operation] + " result"
                  : r.operation === "joint"
                    ? "View joint result"
                    : r.operation === "check"
                      ? "View check result"
                      : "View " + labels[r.operation] + " result"}
              </button>
            </div>
          ))}
          <div className="panel-actions">
            <button onClick={close}>Close run history</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
