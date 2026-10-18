import { useEffect, useState } from "react";
import { useDocuments, useInteraction } from "../../state/stores";
import { pointer } from "../companion/pointer";
import {
  acceptInvitation,
  acceptWatchInvitation,
  finishWatchInvitation,
  acceptJointInvitation,
  finishJointInvitation,
  dismissInvitation,
  forgetExcerptPreference,
  loadExcerptPreference,
  reconcile,
  saveExcerptPreference,
  useProposals,
} from "../../services/proposal-runtime";
import type { ExcerptLimit } from "../../domain/model";
import "./proposal.css";
export function ProposalHost({ blocked }: { blocked: boolean }) {
  const proposal = useProposals((s) => s.session.proposal);
  const joint = useProposals((s) => s.joint.proposal);
  const watch = useProposals((s) => s.watch.proposal);
  const materials = useDocuments((s) => s.materials);
  const enabled = useProposals((s) => s.enabled);
  const preference = useProposals((s) => s.preference);
  const visible =
    enabled && !preference && !blocked && proposal?.status === "visible";
  useEffect(() => {
    reconcile(blocked, materials);
    const timer = setInterval(() => reconcile(blocked, materials), 1000);
    return () => clearInterval(timer);
  }, [
    blocked,
    enabled,
    preference,
    proposal?.status,
    joint?.status,
    watch?.status,
    materials,
  ]);
  if (visible) return <Invitation key={proposal.id} />;
  if (enabled && !blocked && watch?.status === "visible")
    return <Invitation key={watch.id} watch />;
  return enabled && !blocked && joint?.status === "visible" ? (
    <Invitation key={joint.id} joint />
  ) : null;
}
function Invitation({
  joint = false,
  watch = false,
}: {
  joint?: boolean;
  watch?: boolean;
}) {
  const watched = useProposals((s) => s.watch.proposal);
  const sources = useProposals((s) => s.joint.proposal?.sources);
  const [anchor] = useState(() => ({ x: pointer.x + 40, y: pointer.y + 24 }));
  return (
    <aside
      className="proposal-card"
      aria-label="Helpful proposal"
      style={{
        left: Math.max(12, Math.min(innerWidth - 344, anchor.x)),
        top: Math.max(56, Math.min(innerHeight - 440, anchor.y)),
      }}
    >
      <div className="eyebrow">WISP · A small proposal</div>
      <p role="status">
        {watch
          ? "This check is complete. Let Scout Bat watch for later changes while this page stays open?"
          : joint
            ? "You switched between two texts. Organize their excerpts separately by source?"
            : "You have organized excerpts several times. Make future excerpts shorter by default?"}
      </p>
      <small>
        {watch
          ? watched?.title + ". Confirm the full-text range first; continuous watch has not started."
          : joint
            ? sources?.map((s) => s.title).join(" + ") +
              ". Suggested because you switched between these texts; no material has been processed."
            : "Suggested after three successful excerpt runs since proposals were enabled on this page; no preference has been saved."}
      </small>
      <div className="panel-actions">
        <button
          onClick={() => {
            if (watch) {
              const watchDraft = acceptWatchInvitation(
                useDocuments.getState().materials,
              );
              if (watchDraft)
                useInteraction.setState({
                  watchDraft,
                  menu: false,
                  book: false,
                });
              return;
            }
            if (joint) {
              const jointDraft = acceptJointInvitation(
                useDocuments.getState().materials,
              );
              if (jointDraft)
                useInteraction.setState({
                  jointDraft,
                  menu: false,
                  book: false,
                });
              return;
            }
            if (acceptInvitation())
              useInteraction.setState({
                book: true,
                bookTab: "About you",
                menu: false,
              });
          }}
        >
          {watch ? "View watch scope" : joint ? "View the two materials" : "View settings"}
        </button>
        <button
          onClick={() =>
            watch
              ? finishWatchInvitation()
              : joint
                ? finishJointInvitation()
                : dismissInvitation()
          }
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
export function AboutYou() {
  const preference = useProposals((s) => s.preference);
  const proposal = useProposals((s) => s.session.proposal);
  const busy = useProposals((s) => s.busy);
  const error = useProposals((s) => s.error);
  const [value, setValue] = useState<ExcerptLimit>(3);
  useEffect(
    () => () => {
      if (
        useProposals.getState().session.proposal?.status === "accepted" &&
        !useProposals.getState().busy
      )
        dismissInvitation();
    },
    [],
  );
  return (
    <div className="book-page">
      {error && (
        <p role="alert">
          {error}{" "}
          <button disabled={busy} onClick={() => void loadExcerptPreference()}>
            Retry loading preference
          </button>
        </p>
      )}
      {proposal?.status === "accepted" && !preference ? (
        <>
          <h3>Confirm excerpt preference</h3>
          <p>
            This changes only the default excerpt length for future local Understand and Page Sprite tasks. Excerpts preserve source order and do not generate a semantic summary. History is unchanged, and you can adjust the length before each run.
          </p>
          <label>
            Default excerpt length{" "}
            <select
              disabled={busy}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) as ExcerptLimit)}
            >
              <option value={3}>Brief excerpt · up to 3 non-empty lines</option>
              <option value={8}>Standard excerpt · up to 8 non-empty lines</option>
            </select>
          </label>
          <div className="panel-actions">
            <button
              disabled={busy}
              onClick={() => void saveExcerptPreference(value)}
            >
              {busy ? "Saving…" : "Save preference"}
            </button>
            <button disabled={busy} onClick={dismissInvitation}>
              Cancel preference confirmation
            </button>
          </div>
        </>
      ) : preference ? (
        <>
          <h3>Your confirmed preference</h3>
          <p>
            Confirmed: {preference.excerptLimit === 3 ? "Brief" : "Standard"} excerpt (up to{" "}
            {preference.excerptLimit} non-empty lines)
          </p>
          <p>
            Source: explicitly saved after accepting a helpful proposal ·{" "}
            {new Date(preference.confirmedAt).toLocaleString("en-US")}
          </p>
          <p>
            Saved only in this browser. Forgetting it restores standard excerpts for new requests; history and confirmed tasks are unchanged.
          </p>
          <button
            disabled={busy}
            onClick={() => void forgetExcerptPreference()}
          >
            Forget excerpt preference
          </button>
        </>
      ) : (
        <>
          <h3>No preference recorded</h3>
          <p>
            Only preferences you confirm appear here. Using a capability repeatedly does not mean you agreed to save a preference.
          </p>
          {error && (
            <button
              disabled={busy}
              onClick={() => void forgetExcerptPreference()}
            >
              Forget excerpt preference
            </button>
          )}
        </>
      )}
    </div>
  );
}
