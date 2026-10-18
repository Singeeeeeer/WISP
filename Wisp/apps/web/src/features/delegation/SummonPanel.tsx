import { captureOutcome } from "../companion/outcome";
import { captureSummonFlight } from "../companion/summon-flight";
import { ExecutionChoice } from "../check/ExecutionChoice";
import { SummaryChoice } from "../check/SummaryChoice";
import { GEMINI_TEXT_LIMIT } from "../../domain/gemini-text";
import { GEMINI_LIMIT } from "../../domain/gemini-check";
import { SourceInfo } from "../../shared/SourceInfo";
import { useRef, useState, type MouseEvent } from "react";
import { useDocuments, useInteraction } from "../../state/stores";
import {
  snapshot,
  type ActionDraft,
  type Familiar,
  type ExcerptLimit,
} from "../../domain/model";
import { roles } from "../../domain/task";
import { limitDescription } from "../../domain/local-text";
import { defaultExcerptLimit } from "../../services/proposal-runtime";
import { ExcerptChoice } from "../proposals/ExcerptChoice";
import { submitTask, useTasks } from "../../services/task-runtime";
import { FloatingPanel } from "../../shared/FloatingPanel";
export function SummonPanel({ draft }: { draft: ActionDraft }) {
  const current = useDocuments((s) => s.materials).find(
    (m) => m.id === draft.snapshot.materialId,
  );
  const saveStatus = useDocuments((s) => s.status[draft.snapshot.materialId]);
  const gemini = draft.execution === "gemini";
  const ready = useTasks((s) => s.ready);
  const runtimeError = useTasks((s) => s.error);
  const [busy, setBusy] = useState(false);
  const [excerptLimit, setExcerptLimit] = useState<ExcerptLimit | undefined>(
    draft.excerptLimit,
  );
  const localLimit = excerptLimit ?? (gemini ? 8 : defaultExcerptLimit());
  const [error, setError] = useState("");
  const lock = useRef(false);
  const close = () => {
    if (!lock.current) {
      captureOutcome()("cancel");
      useInteraction.setState({ draft: undefined });
    }
  };
  async function submit(event: MouseEvent<HTMLButtonElement>) {
    if (lock.current) return;
    const finish = captureOutcome();
    const launch = captureSummonFlight(
      draft.familiar,
      event.currentTarget,
      event,
    );
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await submitTask({
        ...draft,
        excerptLimit:
          !gemini && draft.familiar === "page_sprite" ? localLimit : undefined,
        summaryStyle:
          gemini && draft.familiar === "page_sprite"
            ? (draft.summaryStyle ?? "standard")
            : undefined,
        execution: gemini ? "gemini" : "local",
      });
      launch();
      finish("success");
      useInteraction.setState({ draft: undefined });
    } catch (e) {
      finish("error");
      setError(
        e instanceof Error
          ? e.message
          : "Could not save delegation. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <FloatingPanel busy={busy} title="Material confirmation" close={close}>
      <div className="eyebrow">
        SUMMON ·{" "}
        {gemini
          ? "One-time Gemini delegation"
          : "One-time local delegation · no AI"}
      </div>
      <h2>Entrust one task to a familiar</h2>
      <p className="summon-intro">
        Keep working. It will bring its discoveries back.
      </p>
      {draft.fromResult && (
        <p className="notice">
          This task reuses the source copy and instruction from the previous
          result. The generated result is not used as source text. Check the
          range below before summoning; nothing is submitted automatically.
        </p>
      )}
      <div className="role-grid">
        {(Object.keys(roles) as Familiar[]).map((id) => (
          <button
            key={id}
            disabled={busy}
            aria-pressed={draft.familiar === id}
            onClick={() =>
              useInteraction.setState({
                draft: {
                  ...draft,
                  familiar: id,
                  execution: "local",
                  summaryStyle: undefined,
                },
              })
            }
          >
            <img
              src={`/assets/prototype/${id === "scout_bat" ? "bat_open.png" : id === "page_sprite" ? "book_open.png" : "pot_idle.png"}`}
              alt=""
            />
            <strong>{roles[id].name.split(" · ")[0]}</strong>
            <small>{roles[id].operation}</small>
          </button>
        ))}
      </div>
      <p className="subtle">One-time delegation · stops when complete</p>
      <ExecutionChoice
        value={gemini ? "gemini" : "local"}
        disabled={busy}
        onChange={(execution) =>
          useInteraction.setState({
            draft: { ...draft, execution },
          })
        }
      />
      <details className="summon-method">
        <summary>How this familiar works</summary>
        <p className="notice">
          {gemini
            ? draft.familiar === "scout_bat"
              ? GEMINI_LIMIT
              : GEMINI_TEXT_LIMIT
            : limitDescription(roles[draft.familiar].operation, localLimit)}
        </p>
      </details>
      {draft.familiar === "page_sprite" && !gemini && (
        <ExcerptChoice
          value={localLimit}
          onChange={setExcerptLimit}
          disabled={busy}
        />
      )}
      {draft.familiar === "page_sprite" && gemini && (
        <SummaryChoice
          value={draft.summaryStyle ?? "standard"}
          disabled={busy}
          onChange={(summaryStyle) =>
            useInteraction.setState({ draft: { ...draft, summaryStyle } })
          }
        />
      )}
      <label className="field-label" htmlFor="summon-instruction">
        {gemini
          ? "Delegation instruction"
          : "Delegation instruction (record only; local rules do not interpret free text)"}
      </label>
      <textarea
        id="summon-instruction"
        maxLength={gemini ? 4000 : undefined}
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
        <div className="eyebrow">ONLY THIS MATERIAL · Frozen copy</div>
        <strong>{draft.snapshot.title}</strong>
        <details className="summon-source">
          <summary>Source and range</summary>
          <SourceInfo value={draft.snapshot} />
          <p>
            Version {draft.snapshot.materialVersion} · UTF-16 range [
            {draft.snapshot.start}, {draft.snapshot.end})
          </p>
        </details>
        <pre data-testid="snapshot-text">{draft.snapshot.text}</pre>
      </div>
      {current?.version !== draft.snapshot.materialVersion && (
        <p className="notice">
          The source changed; this copy will still be delegated.
          {current && (
            <button
              disabled={busy}
              onClick={() =>
                useInteraction.setState({
                  draft: { ...draft, snapshot: snapshot(current) },
                })
              }
            >
              Update to current full text
            </button>
          )}
        </p>
      )}
      {saveStatus !== "saved" && (
        <p className="notice">
          The source has not been saved successfully. Delegation uses this
          confirmed copy; saving the reply does not save the source.
        </p>
      )}
      <p>
        {gemini
          ? "This text and instruction are sent to Gemini through the local service and may incur charges. The task depends on this page, but you can switch documents. Refreshing or closing interrupts it; it does not rerun automatically. Recall only stops receiving the result; the provider may continue processing and billing."
          : "Runs only in the local worker for this page; you can switch documents. Closing or refreshing interrupts unfinished work and it will not rerun automatically. The source is not modified."}
      </p>
      {(error || runtimeError) && (
        <p role="alert" className="error">
          {error || runtimeError}
        </p>
      )}
      <div className="panel-actions">
        <button
          className="primary"
          disabled={busy || !ready}
          onClick={(event) => void submit(event)}
        >
          {busy ? "Saving delegation…" : "Summon familiar"}
        </button>
        <button
          aria-label="Close material panel"
          disabled={busy}
          onClick={close}
        >
          Continue working
        </button>
      </div>
    </FloatingPanel>
  );
}
