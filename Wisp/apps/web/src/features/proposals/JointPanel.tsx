import { captureOutcome } from "../companion/outcome";
import { sourceDescription } from "../../domain/cauldron";
import { SourceInfo } from "../../shared/SourceInfo";
import { useRef, useState } from "react";
import {
  jointLimit,
  runJoint,
  type JointDraft,
  type JointRecord,
} from "../../domain/joint";
import { snapshot } from "../../domain/model";
import { createRepository } from "../../services/repository";
import {
  defaultExcerptLimit,
  finishJointInvitation,
} from "../../services/proposal-runtime";
import { useDocuments, useInteraction } from "../../state/stores";
import { Dialog } from "../../shared/Dialog";
import { LocalResult } from "../check/CheckPanel";
import { ExcerptChoice } from "./ExcerptChoice";
const repository = createRepository();
export function prepareJointAgain(record: JointRecord) {
  const materials = useDocuments.getState().materials;
  const current = record.sources.map((s) =>
    materials.find((m) => m.id === s.snapshot.materialId),
  );
  if (current.some((m) => !m)) return false;
  useInteraction.setState({
    book: false,
    menu: false,
    jointDraft: {
      id: crypto.randomUUID(),
      snapshots: current.map((m) => snapshot(m!)) as JointDraft["snapshots"],
      excerptLimit: defaultExcerptLimit(),
    },
  });
  return true;
}
export function JointResult({
  record,
  close,
  again,
}: {
  record: JointRecord;
  close: () => void;
  again: () => void;
}) {
  const materials = useDocuments((s) => s.materials);
  const [copy, setCopy] = useState("");
  const available = record.sources.every((s) =>
    materials.some((m) => m.id === s.snapshot.materialId),
  );
  async function copyResult() {
    const finish = captureOutcome();
    const text = [
      "Joint organization of two texts · Local excerpts · no AI",
      jointLimit,
      `Up to ${record.excerptLimit} non-empty lines per material`,
      ...record.sources.flatMap((part) => {
        const s = part.snapshot;
        const current = materials.find((m) => m.id === s.materialId);
        const stale =
          !current ||
          current.version !== s.materialVersion ||
          current.title !== s.title ||
          current.text !== s.text;
        return [
          `Source: ${s.title} · ID ${s.materialId} · Version ${s.materialVersion}`,
          `Full text UTF-16 range [${s.start}, ${s.end})`,
          sourceDescription(s),
          stale ? "Old-version result; not the current material" : "",
          ...part.excerpts.map(
            (e) =>
              `${e.quote}\nSource evidence: ${s.title} · ID ${s.materialId} · Version ${s.materialVersion} · UTF-16 [${s.start + e.start}, ${s.start + e.end})`,
          ),
          `Non-empty lines not shown: ${part.omittedLines}`,
        ];
      }),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      if (finish("success")) setCopy("Copied joint result");
    } catch {
      if (finish("error")) setCopy("Copy failed. Select and copy the result text manually.");
    }
  }
  return (
    <>
      <h2>Joint organization of two texts</h2>
      <p className="notice">{jointLimit}</p>
      {record.sources.map((part, i) => (
        <section
          className="scope"
          key={part.snapshot.materialId}
          data-testid="joint-result-source"
        >
          <h3>
            Material {i + 1}: {part.snapshot.title}
          </h3>
          <p>
            Source ID: {part.snapshot.materialId} · Full text UTF-16 range [
            {part.snapshot.start}, {part.snapshot.end})
          </p>
          <LocalResult record={part} embedded close={close} again={again} />
        </section>
      ))}
      <p role="status">{copy}</p>
      <div className="panel-actions">
        <button onClick={() => void copyResult()}>Copy joint result</button>
        <button disabled={!available} onClick={again}>
          Confirm both full texts again
        </button>
        <button onClick={close}>Close joint result</button>
      </div>
    </>
  );
}
export function JointPanel({ draft }: { draft: JointDraft }) {
  const materials = useDocuments((s) => s.materials);
  const [excerptLimit, setExcerptLimit] = useState(draft.excerptLimit);
  const [record, setRecord] = useState<JointRecord>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const close = () => {
    if (lock.current) return;
    if (!record) captureOutcome()("cancel");
    finishJointInvitation();
    useInteraction.setState({ jointDraft: undefined });
  };
  const current = draft.snapshots.map((s) =>
    materials.find((m) => m.id === s.materialId),
  );
  const stale = draft.snapshots.some(
    (s, i) =>
      !current[i] ||
      current[i]!.version !== s.materialVersion ||
      current[i]!.text !== s.text ||
      current[i]!.title !== s.title,
  );
  const refresh = () => {
    if (current.some((m) => !m) || lock.current) return;
    useInteraction.setState({
      jointDraft: {
        id: crypto.randomUUID(),
        snapshots: current.map((m) => snapshot(m!)) as JointDraft["snapshots"],
        excerptLimit,
      },
    });
  };
  async function submit() {
    if (lock.current) return;
    const finish = captureOutcome();
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await repository.saveRecord(
        runJoint({ ...draft, excerptLimit }),
      );
      finish("success");
      setRecord(saved);
      finishJointInvitation("completed");
    } catch (e) {
      finish("error");
      setError(e instanceof Error ? e.message : "Could not save joint result. Please retry.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title={record ? "Joint result" : "Joint material confirmation"} close={close}>
      {record ? (
        <JointResult
          record={record}
          close={close}
          again={() => prepareJointAgain(record)}
        />
      ) : (
        <>
          <div className="eyebrow">JOINT · Two local texts · No AI used</div>
          <h2>Confirm both full-text materials</h2>
          <p className="notice">{jointLimit}</p>
          <p>
            This run uses the two full texts below and does not reuse a single-document selection. Processing and saving begin only after you click “Organize two texts”; sources are not modified.
          </p>
          <ExcerptChoice
            value={excerptLimit}
            onChange={setExcerptLimit}
            disabled={busy}
          />
          <p>This line limit applies to each material.</p>
          {draft.snapshots.map((s, i) => (
            <section
              className="scope"
              key={s.materialId}
              data-testid="joint-source"
            >
              <h3>
                Material {i + 1}: {s.title}
              </h3>
              <p>
                Source ID: {s.materialId} · Version {s.materialVersion} · Full text UTF-16
                range [{s.start}, {s.end})
              </p>
              <SourceInfo value={s} />
              <pre>{s.text}</pre>
            </section>
          ))}
          {stale && (
            <p className="notice">
              The source changed or is unavailable; the copy in this confirmation panel is still used.
              <button
                disabled={busy || current.some((m) => !m)}
                onClick={refresh}
              >
                Update both current full texts
              </button>
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="panel-actions">
            <button
              disabled={busy}
              className="primary"
              onClick={() => void submit()}
            >
              {busy ? "Processing and saving…" : "Organize two texts"}
            </button>
            <button disabled={busy} onClick={close}>
              Cancel joint organization
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
