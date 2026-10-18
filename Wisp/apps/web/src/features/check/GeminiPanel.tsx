import { captureOutcome } from "../companion/outcome";
import { operationPose, useTaskActivity } from "../companion/activity";
import { useEffect, useRef, useState } from "react";
import { snapshot, type ActionDraft } from "../../domain/model";
import { GEMINI_LIMIT } from "../../domain/gemini-check";
import { createGeminiSubmission } from "../../services/gemini";
import type { GeminiRecord } from "../../domain/processing";
import { GEMINI_TEXT_LIMIT } from "../../domain/gemini-text";
import { labels } from "../../domain/local-text";
import { SummaryChoice } from "./SummaryChoice";
import { GeminiTextResult } from "./GeminiTextResult";
import { createRepository } from "../../services/repository";
import { useDocuments, useInteraction } from "../../state/stores";
import { FloatingPanel } from "../../shared/FloatingPanel";
import { summonFromResult } from "../../domain/continuation";
import { SourceInfo } from "../../shared/SourceInfo";
import { GeminiResult } from "./GeminiResult";
import { ExecutionChoice } from "./ExecutionChoice";
const repository = createRepository();
export function GeminiPanel({ draft }: { draft: ActionDraft }) {
  const operation = draft.entry === "summon" ? "check" : draft.entry;
  const activity = useTaskActivity(
    draft.presentation === "brewing" ? "brewing" : operationPose(operation),
  );
  const resultProps = {
    close: () => close(),
    again: () => reset(),
    summon: () =>
      record && useInteraction.setState({ draft: summonFromResult(record) }),
  };
  const current = useDocuments((s) => s.materials).find(
      (m) => m.id === draft.snapshot.materialId,
    ),
    saveStatus = useDocuments((s) => s.status[draft.snapshot.materialId]);
  const [record, setRecord] = useState<GeminiRecord>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submission = useRef<
      ReturnType<typeof createGeminiSubmission> | undefined
    >(undefined),
    controller = useRef<AbortController | undefined>(undefined),
    locked = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const close = () => {
    if (!locked.current) {
      if (
        submission.current?.hasResult() &&
        !record &&
        !window.confirm("The result is not saved yet. Closing will discard the pending result on this page. Close anyway?")
      )
        return;
      if (!record) captureOutcome()("cancel");
      useInteraction.setState({ draft: undefined });
    }
  };
  const reset = () => {
    if (current && !locked.current) {
      activity.clear();
      submission.current = undefined;
      setRecord(undefined);
      setError("");
      useInteraction.setState({
        draft: { ...draft, snapshot: snapshot(current) },
      });
    }
  };
  const frozen = busy || !!submission.current?.hasResult();
  async function submit(origin: Element) {
    if (locked.current) return;
    const finish = captureOutcome();
    const finishActivity = activity.start(origin);
    locked.current = true;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    const signal = controller.current.signal;
    submission.current ??= createGeminiSubmission(
      draft.snapshot,
      draft.instruction,
      operation === "understand"
        ? { operation, summaryStyle: draft.summaryStyle ?? "standard" }
        : { operation },
      (r) => repository.saveRecord(r),
    );
    try {
      const saved = await submission.current.run(signal);
      if (mounted.current) {
        finishActivity("success");
        finish("success");
        setRecord(saved);
      }
    } catch (e) {
      if (mounted.current) {
        finishActivity(
          signal.aborted && !submission.current?.hasResult() ? "cancel" : "error",
        );
        finish(
          signal.aborted && !submission.current?.hasResult()
            ? "cancel"
            : "error",
        );
        setError(e instanceof Error ? e.message : "Check failed");
      }
      if (!submission.current?.hasResult()) submission.current = undefined;
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
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
        record.operation === "check" ? (
          <GeminiResult record={record} {...resultProps} />
        ) : (
          <GeminiTextResult record={record} {...resultProps} />
        )
      ) : (
        <>
          <div className="eyebrow">{labels[operation]} · Gemini</div>
          <h2>Confirm material for this run</h2>
          <ExecutionChoice
            value="gemini"
            disabled={frozen}
            onChange={(execution) =>
              useInteraction.setState({
                draft: { ...draft, execution },
              })
            }
          />
          <p className="notice">
            {operation === "check" ? GEMINI_LIMIT : GEMINI_TEXT_LIMIT}
          </p>
          {operation === "understand" && (
            <SummaryChoice
              value={draft.summaryStyle ?? "standard"}
              disabled={frozen}
              onChange={(summaryStyle) =>
                useInteraction.setState({ draft: { ...draft, summaryStyle } })
              }
            />
          )}
          <label className="field-label" htmlFor="gemini-instruction">
            Additional instruction
          </label>
          <textarea
            id="gemini-instruction"
            className="instruction"
            disabled={frozen}
            maxLength={4000}
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
            <p className="notice">
              The source has changed; this run will still use the copy shown above.
              <button disabled={frozen || !current} onClick={reset}>
                Update to current full text
              </button>
            </p>
          )}
          {saveStatus !== "saved" && (
            <p className="notice">
              The source has not been saved successfully. This run processes only the confirmed copy; saving the result does not save the source.
            </p>
          )}
          <p>
            After clicking Run, this text and instruction are sent through the local service to
            Gemini. Charges may apply. No other material is sent, and there is no automatic retry. A manual retry after a network failure may incur another charge.
          </p>
          {submission.current?.hasResult() && (
            <p className="notice">
              The model result was received but has not been saved. Retrying only saves the result and does not call Gemini again. Refreshing the page loses this unsaved result.
            </p>
          )}
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
              {busy
                ? "Processing and saving…"
                : submission.current?.hasResult()
                  ? "Retry saving result"
                  : operation === "check"
                    ? "Run Gemini Check"
                    : operation === "understand"
                      ? "Run Gemini Understand"
                      : "Run Gemini Create"}
            </button>
            {busy && (
              <button onClick={() => controller.current?.abort()}>
                Stop waiting
              </button>
            )}
            <button aria-label="Close material panel" disabled={busy} onClick={close}>
              Continue working
            </button>
          </div>
        </>
      )}
    </FloatingPanel>
  );
}
