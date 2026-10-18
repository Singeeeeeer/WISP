import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  sliceBatchSnapshot,
  validBatchSnapshots,
  batchContinuationDraft,
  type BatchDraft,
  type BatchRecord,
} from "../../domain/batch";
import { roles } from "../../domain/task";
import type { Familiar } from "../../domain/model";
import { createBatchSubmission } from "../../services/batch";
import { createRepository } from "../../services/repository";
import { submitBatchTask, useTasks } from "../../services/task-runtime";
import { useDocuments, useInteraction } from "../../state/stores";
import { FloatingPanel } from "../../shared/FloatingPanel";
import { SourceInfo } from "../../shared/SourceInfo";
import { SummaryChoice } from "../check/SummaryChoice";
import { captureOutcome } from "../companion/outcome";
import { useTaskActivity } from "../companion/activity";
import { captureSummonFlight } from "../companion/summon-flight";
import { BatchResult } from "./BatchResult";
import { openBatchDraft, prepareBatchAgain, familiarForBatch } from "./actions";
import "./batch.css";

const repository = createRepository();
export function BatchPanel({ draft }: { draft: BatchDraft }) {
  const activity = useTaskActivity("brewing");
  const materials = useDocuments((s) => s.materials);
  const saveStatus = useDocuments((s) => s.status);
  const ready = useTasks((s) => s.ready);
  const original = useRef(structuredClone(draft.snapshots));
  const [ranges, setRanges] = useState<Record<number, [number, number]>>({});
  const [record, setRecord] = useState<BatchRecord>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runState, setRunState] = useState("idle");
  const submission = useRef<
    ReturnType<typeof createBatchSubmission> | undefined
  >(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const locked = useRef(false);
  const mounted = useRef(true);
  const attempted = useRef(false);
  const requestId = useRef(draft.id);
  const operation =
    draft.entry === "summon" ? roles[draft.familiar].operation : draft.entry;
  const operationLabel = operation[0].toUpperCase() + operation.slice(1);
  const frozen = busy || !!submission.current?.hasResult();
  const total = draft.snapshots.reduce((sum, s) => sum + s.text.length, 0);
  const valid =
    validBatchSnapshots(draft.snapshots) && draft.instruction.length <= 4000;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  function change(patch: Partial<BatchDraft>) {
    if (frozen) return;
    if (attempted.current) requestId.current = crypto.randomUUID();
    attempted.current = false;
    submission.current = undefined;
    setError("");
    setRunState("idle");
    useInteraction.setState({ batchDraft: { ...draft, ...patch } });
  }
  function close() {
    if (locked.current) return;
    if (
      submission.current?.hasResult() &&
      !record &&
      !window.confirm("The result is not saved yet. Closing will discard the pending result on this page. Close anyway?")
    )
      return;
    if (!record) captureOutcome()("cancel");
    useInteraction.setState({ batchDraft: undefined });
  }
  function useRange(index: number, full = false) {
    try {
      const source = original.current[index];
      const [start, end] = full
        ? [0, source.text.length]
        : (ranges[index] ?? [0, 0]);
      const snapshots = [...draft.snapshots];
      snapshots[index] = sliceBatchSnapshot(source, start, end);
      change({ snapshots });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Select a complete, non-empty text range.");
    }
  }
  function selectWithKeyboard(
    e: KeyboardEvent<HTMLTextAreaElement>,
    index: number,
  ) {
    if (
      e.altKey ||
      e.metaKey ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) ||
      (e.ctrlKey && e.key.startsWith("Arrow"))
    )
      return;
    const target = e.currentTarget;
    const text = target.value;
    const start = target.selectionStart,
      end = target.selectionEnd;
    const backward = target.selectionDirection === "backward";
    const anchor = backward ? end : start;
    const focus = backward ? start : end;
    let next = focus;
    if (e.key === "Home")
      next =
        e.ctrlKey || focus === 0 ? 0 : text.lastIndexOf("\n", focus - 1) + 1;
    else if (e.key === "End") {
      const lineEnd = text.indexOf("\n", focus);
      next = e.ctrlKey || lineEnd < 0 ? text.length : lineEnd;
    } else if (!e.shiftKey && start !== end)
      next = e.key === "ArrowLeft" ? start : end;
    else if (e.key === "ArrowRight") {
      next = Math.min(text.length, focus + 1);
      if (
        /[\uD800-\uDBFF]/.test(text[focus] ?? "") &&
        /[\uDC00-\uDFFF]/.test(text[next] ?? "")
      )
        next++;
    } else {
      next = Math.max(0, focus - 1);
      if (
        /[\uDC00-\uDFFF]/.test(text[next] ?? "") &&
        /[\uD800-\uDBFF]/.test(text[next - 1] ?? "")
      )
        next--;
    }
    // Readonly textareas scroll on arrow keys in Chrome; provide standard text
    // selection without making the frozen preview editable or splitting emoji.
    e.preventDefault();
    const from = e.shiftKey ? anchor : next;
    target.setSelectionRange(
      Math.min(from, next),
      Math.max(from, next),
      next < from ? "backward" : "forward",
    );
    setRanges((before) => ({
      ...before,
      [index]: [target.selectionStart, target.selectionEnd],
    }));
  }
  async function submit(event: MouseEvent<HTMLButtonElement>) {
    if (locked.current || !valid) return;
    const finish = captureOutcome();
    const finishActivity =
      draft.entry === "summon"
        ? undefined
        : activity.start(event.currentTarget);
    const launch =
      draft.entry === "summon"
        ? captureSummonFlight(draft.familiar, event.currentTarget, event)
        : undefined;
    locked.current = true;
    attempted.current = true;
    setBusy(true);
    setError("");
    setRunState("running");
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (draft.entry === "summon") {
        await submitBatchTask({
          ...draft,
          id: requestId.current,
          summaryStyle:
            operation === "understand"
              ? (draft.summaryStyle ?? "standard")
              : undefined,
        });
        if (mounted.current) {
          launch?.();
          finish("success");
          useInteraction.setState({ batchDraft: undefined });
        }
      } else {
        submission.current ??= createBatchSubmission(
          requestId.current,
          draft.snapshots,
          draft.instruction,
          operation === "understand"
            ? { operation, summaryStyle: draft.summaryStyle ?? "standard" }
            : { operation },
          (result) => repository.saveRecord(result),
        );
        const saved = await submission.current.run(abort.signal);
        if (mounted.current) {
          finishActivity?.("success");
          finish("success");
          setRecord(saved);
          setRunState("completed");
        }
      }
    } catch (e) {
      if (mounted.current) {
        const cancelled =
          abort.signal.aborted && !submission.current?.hasResult();
        finishActivity?.(cancelled ? "cancel" : "error");
        finish(cancelled ? "cancel" : "error");
        setRunState(cancelled ? "cancelled" : "failed");
        setError(
          e instanceof Error ? e.message : "Multi-material processing failed. Please retry manually.",
        );
      }
      if (!submission.current?.hasResult()) submission.current = undefined;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <FloatingPanel
      title={record ? `Multi-material ${operationLabel} result` : "Multi-material confirmation"}
      busy={busy}
      close={close}
    >
      <div
        className="batch-panel"
        data-wisp-context="cauldron"
        data-wisp-operation={operation}
        data-wisp-run-id={requestId.current}
        data-wisp-state={runState}
        aria-busy={busy}
      >
        {record ? (
          <BatchResult
            record={record}
            close={close}
            again={() =>
              prepareBatchAgain(
                record,
                record.operation,
                familiarForBatch(record),
              )
            }
            summon={() => openBatchDraft(batchContinuationDraft(record))}
          />
        ) : (
          <>
            <div className="eyebrow">
              {draft.entry === "summon" ? "SUMMON" : operationLabel} · GEMINI ·
              Multi-material
            </div>
            <h2>Confirm these {draft.snapshots.length} materials</h2>
            {draft.fromResult && (
              <p className="notice">
                The original material copy used for this result will be reused; the generated result will not become source text. Review it before submitting.
              </p>
            )}
            <p className="notice">
              Multi-material processing uses only the text explicitly confirmed below. Local rules remain available in single-material mode. Citations require human review and do not verify facts.
            </p>
            {draft.entry === "summon" && (
              <div className="role-grid">
                {(Object.keys(roles) as Familiar[]).map((id) => (
                  <button
                    key={id}
                    disabled={frozen}
                    aria-pressed={draft.familiar === id}
                    onClick={() =>
                      change({ familiar: id, summaryStyle: undefined })
                    }
                  >
                    <strong>{roles[id].name}</strong>
                    <small>{roles[id].operation}</small>
                  </button>
                ))}
              </div>
            )}
            {operation === "understand" && (
              <SummaryChoice
                value={draft.summaryStyle ?? "standard"}
                disabled={frozen}
                onChange={(summaryStyle) => change({ summaryStyle })}
              />
            )}
            <label className="field-label">
              Additional instruction for this multi-material run
              <textarea
                className="instruction"
                value={draft.instruction}
                maxLength={4000}
                disabled={frozen}
                onChange={(e) => change({ instruction: e.target.value })}
              />
            </label>
            <p className={valid ? "notice" : "error"} role="status">
              {draft.snapshots.length} confirmed items · Total: {total.toLocaleString("en-US")} / 60,000 UTF-16 units.
              {!valid && " Each item must be non-empty and the combined text must stay within the limit. Reduce a range before submitting."}
            </p>
            {draft.snapshots.map((s, index) => {
              const current = materials.find((m) => m.id === s.materialId);
              const stale =
                !current ||
                current.version !== s.materialVersion ||
                current.title !== s.title ||
                current.text.slice(s.start, s.end) !== s.text;
              const n = index + 1;
              const range = ranges[index];
              return (
                <section
                  className="scope"
                  key={s.materialId}
                  aria-label={`Material ${n} confirmed range`}
                >
                  <h3>
                    {n}. {s.title}
                  </h3>
                  <SourceInfo value={s} />
                  <p>
                    Version {s.materialVersion} · UTF-16 range [{s.start}, {s.end})
                    · {s.text.length.toLocaleString("en-US")} units
                  </p>
                  {stale && (
                    <p className="notice">
                      The source changed or is unavailable; this frozen copy will still be used.
                    </p>
                  )}
                  {saveStatus[s.materialId] !== "saved" && (
                    <p className="notice">
                      The source has not been saved successfully; this run saves only the confirmed copy and result.
                    </p>
                  )}
                  <pre data-testid={`batch-snapshot-${n}`}>
                    {s.text || "Empty range"}
                  </pre>
                  <details>
                    <summary>Adjust the text range for material {n}</summary>
                    <p className="subtle">
                      Select text, or use Home/End and Shift + arrow keys.
                    </p>
                    <label className="field-label">
                      Material {n} range preview
                      <textarea
                        readOnly
                        disabled={frozen}
                        value={original.current[index].text}
                        onKeyDown={(e) => selectWithKeyboard(e, index)}
                        onSelect={(e) => {
                          const target = e.currentTarget;
                          setRanges((before) => ({
                            ...before,
                            [index]: [
                              target.selectionStart,
                              target.selectionEnd,
                            ],
                          }));
                        }}
                      />
                    </label>
                    <div className="batch-range-actions">
                      <button
                        disabled={frozen || !range || range[0] === range[1]}
                        onClick={() => useRange(index)}
                      >
                        Use the selected excerpt from material {n}
                      </button>
                      <button
                        disabled={frozen}
                        onClick={() => useRange(index, true)}
                      >
                        Restore the full text for material {n}
                      </button>
                    </div>
                  </details>
                </section>
              );
            })}
            <p className="notice">
              Only the numbered text, instruction, and summary settings for this run are sent through the local service to
              Gemini; charges may apply. Titles, filenames, and source notes are not sent. Results do not modify source text.
              {draft.entry === "summon" &&
                " The familiar depends on this page; refreshing or closing interrupts it. Recall cannot undo provider processing or charges."}
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="panel-actions">
              <button
                className="primary"
                disabled={
                  busy || !valid || (draft.entry === "summon" && !ready)
                }
                onClick={(event) => void submit(event)}
              >
                {busy
                  ? "Processing and saving…"
                  : submission.current?.hasResult()
                    ? "Retry saving multi-material result"
                    : draft.entry === "summon"
                      ? "Summon multi-material familiar"
                      : "Start multi-material processing"}
              </button>
              {busy &&
                draft.entry !== "summon" &&
                !submission.current?.hasResult() && (
                  <button onClick={() => controller.current?.abort()}>
                    Stop waiting
                  </button>
                )}
              <button
                aria-label="Close multi-material confirmation"
                disabled={busy}
                onClick={close}
              >
                Continue working
              </button>
            </div>
          </>
        )}
      </div>
    </FloatingPanel>
  );
}
