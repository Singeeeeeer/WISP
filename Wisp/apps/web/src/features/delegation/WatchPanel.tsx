import { SourceInfo } from "../../shared/SourceInfo";
import { useRef, useState } from "react";
import { snapshot, type MaterialSnapshot } from "../../domain/model";
import { CHECK_LIMIT } from "../../domain/check";
import { useDocuments, useInteraction } from "../../state/stores";
import { finishWatchInvitation } from "../../services/proposal-runtime";
import {
  startWatching,
  stopWatching,
  pauseWatching,
  resumeWatching,
  recoverWatches,
  useWatches,
} from "../../services/watch-runtime";
import { Dialog } from "../../shared/Dialog";
export function WatchPanel({ source }: { source: MaterialSnapshot }) {
  const current = useDocuments((s) => s.materials).find(
    (m) => m.id === source.materialId,
  );
  const ready = useWatches((s) => s.ready);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const close = () => {
    if (!lock.current) {
      finishWatchInvitation();
      useInteraction.setState({ watchDraft: undefined });
    }
  };
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await startWatching(source);
      finishWatchInvitation("completed");
      useInteraction.setState({ watchDraft: undefined });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save watch. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title="Confirm continuous watch" close={close}>
      <h2>Let Scout Bat watch this text</h2>
      <p className="notice">
        Watching covers the full text, regardless of the selection used for
        Check. After confirmation, version {source.materialVersion} is the
        baseline; only later saved versions are checked, without an immediate
        repeat.
      </p>
      <section className="scope">
        <strong>{source.title}</strong>
        <SourceInfo value={source} />
        <p>
          Source ID: {source.materialId} · Full text UTF-16 range [0,{" "}
          {source.end})
        </p>
        <pre>{source.text}</pre>
      </section>
      <p>
        Watching runs only while the page that started it remains open; other
        Wisp tabs can view, pause or stop it. Closing or refreshing interrupts
        active watching, and it does not resume automatically. Paused watches
        stay paused across refresh. Consecutive edits are combined; newer saved
        versions are processed after each check completes. Open Familiars in the
        Grimoire to control watching at any time.
      </p>
      <p className="notice">{CHECK_LIMIT}</p>
      {current?.version !== source.materialVersion && (
        <p className="notice">
          The material changed. Update the range and confirm.
          {current && (
            <button
              disabled={busy}
              onClick={() =>
                useInteraction.setState({ watchDraft: snapshot(current) })
              }
            >
              Update watched full text
            </button>
          )}
        </p>
      )}
      <p>
        Turning off Helpful proposals only stops new proposals. Use “Stop
        watching” to end this watch. Empty versions and versions over the limit
        are skipped with a reason; failed checks are not retried indefinitely
        for the same version.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="panel-actions">
        <button
          disabled={
            busy || !ready || current?.version !== source.materialVersion
          }
          onClick={() => void confirm()}
        >
          {busy ? "Saving watch…" : "Confirm and start watching"}
        </button>
        <button disabled={busy} onClick={close}>
          Cancel continuous watch
        </button>
      </div>
    </Dialog>
  );
}
export function WatchList() {
  const watches = useWatches((s) => s.watches),
    error = useWatches((s) => s.error);
  const materials = useDocuments((s) => s.materials);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function action(id: string, kind: "stop" | "pause" | "resume") {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      await (kind === "pause"
        ? pauseWatching(id)
        : kind === "resume"
          ? resumeWatching(id)
          : stopWatching(id));
    } catch (e) {
      setFailure(
        e instanceof Error
          ? e.message
          : "Could not update watching. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Continuous watch</h3>
      {(error || failure) && (
        <p role="alert">
          {failure || error}
          <button onClick={() => void recoverWatches()}>
            Refresh watch records
          </button>
        </p>
      )}
      {!watches.length && <p>Continuous watch has not been authorized.</p>}
      {watches.map((w) => (
        <section className="scope" key={w.id} data-testid="watch-card">
          <strong>Scout Bat · {w.title}</strong>
          <SourceInfo value={w.baseline} />
          <p>
            {w.status === "active"
              ? "Watching"
              : w.status === "paused"
                ? "Paused"
                : w.status === "stopped"
                  ? "Stopped"
                  : "Interrupted"}{" "}
            · Full text · baseline version {w.baseline.materialVersion} · latest
            processed/skipped version {w.lastVersion}
          </p>
          <p>{w.notice}</p>
          {w.status === "paused" && (
            <p className="notice">
              Continue keeps this watch and its history, finishes any paused
              check from its frozen version, then checks newer saved changes. No
              checks run while paused.
            </p>
          )}
          <small>
            Watch ID: {w.id} · Confirmed on{" "}
            {new Date(w.confirmedAt).toLocaleString("en-US")}
          </small>
          <div className="panel-actions">
            {w.status === "active" || w.status === "paused" ? (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(
                      w.id,
                      w.status === "paused" ? "resume" : "pause",
                    )
                  }
                >
                  {w.status === "paused" ? "Continue watch" : "Pause watch"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void action(w.id, "stop")}
                >
                  Stop watching
                </button>
              </>
            ) : (
              <button
                disabled={
                  !materials.some((m) => m.id === w.materialId) ||
                  watches.some(
                    (x) =>
                      x.materialId === w.materialId &&
                      (x.status === "active" || x.status === "paused"),
                  )
                }
                onClick={() => {
                  const m = useDocuments
                    .getState()
                    .materials.find((m) => m.id === w.materialId);
                  if (m)
                    useInteraction.setState({
                      book: false,
                      watchDraft: snapshot(m),
                    });
                }}
              >
                Confirm watch again
              </button>
            )}
          </div>
        </section>
      ))}
    </section>
  );
}
