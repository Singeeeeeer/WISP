import {
  initialWatchProposal,
  proposeWatch,
  reconcileWatchProposal,
  finishWatchProposal,
  type WatchProposalState,
} from "../domain/watch-proposal";
import type { MaterialSnapshot } from "../domain/model";
import {
  initialJointState,
  visitMaterial,
  reconcileJoint,
  finishJoint,
  validJointContext,
  type JointState,
} from "../domain/joint-proposal";
import { snapshot, type Material } from "../domain/model";
import type { JointDraft } from "../domain/joint";
import { create } from "zustand";
import { createRepository } from "./repository";
import {
  acceptProposal,
  completeOperation,
  dismissProposal,
  initialProposalState,
  reconcileProposal,
  validPreference,
  type ExcerptPreference,
  type ProposalState,
} from "../domain/proposal";
import type { ExcerptLimit } from "../domain/model";
import type { LocalRecord } from "../domain/local-text";
const repository = createRepository();
const key = "confirmed-excerpt-preference";
export const useProposals = create<{
  session: ProposalState;
  joint: JointState;
  watch: WatchProposalState;
  watchedMaterials: string[];
  lastShownAt?: number;
  preference?: ExcerptPreference;
  enabled: boolean;
  ready: boolean;
  busy: boolean;
  error: string;
}>(() => ({
  session: initialProposalState(),
  joint: initialJointState(),
  watch: initialWatchProposal(),
  watchedMaterials: [],
  enabled: false,
  ready: false,
  busy: false,
  error: "",
}));
const channel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("wisp-excerpt-preference");
let revision = 0;
export async function loadExcerptPreference() {
  const current = ++revision;
  try {
    const value = await repository.readPreference<unknown>(key);
    if (current !== revision) return;
    if (value != null && !validPreference(value))
      throw new Error("The excerpt preference is invalid and was not applied. Try again or forget it.");
    useProposals.setState({
      preference: validPreference(value) ? value : undefined,
      ready: true,
      error: "",
    });
    reconcile(true);
  } catch (e) {
    if (current === revision)
      useProposals.setState({
        ready: false,
        error: e instanceof Error ? e.message : "Could not load the excerpt preference.",
      });
  }
}
export function observePreferences() {
  const refresh = () => {
    if (!useProposals.getState().busy) void loadExcerptPreference();
  };
  channel?.addEventListener("message", refresh);
  window.addEventListener("focus", refresh);
  return () => {
    channel?.removeEventListener("message", refresh);
    window.removeEventListener("focus", refresh);
  };
}
export function setProposalsEnabled(enabled: boolean) {
  useProposals.setState({ enabled });
  reconcile(true);
}
let jointMaterials: Material[] = [];
export function reconcile(blocked: boolean, materials?: Material[]) {
  if (materials) jointMaterials = materials;
  const s = useProposals.getState();
  const now = Date.now();
  const watchOccupies =
    s.watch.proposal?.status === "visible" ||
    s.watch.proposal?.status === "accepted";
  const jointOccupies =
    s.joint.proposal?.status === "visible" ||
    s.joint.proposal?.status === "accepted";
  const before =
    s.session.lastShownAt === s.lastShownAt
      ? s.session
      : { ...s.session, lastShownAt: s.lastShownAt };
  const session = reconcileProposal(
    before,
    {
      enabled: s.enabled && s.ready,
      hasPreference: !!s.preference,
      blocked: blocked || jointOccupies || watchOccupies,
    },
    now,
  );
  let lastShownAt = s.lastShownAt;
  if (
    session.proposal?.status === "visible" &&
    s.session.proposal?.status !== "visible"
  )
    lastShownAt = now;
  const preferenceOccupies =
    session.proposal?.status === "visible" ||
    (session.proposal?.status === "accepted" && !s.preference);
  const joint = reconcileJoint(
    s.joint,
    {
      enabled: s.enabled && s.ready,
      blocked,
      occupied: preferenceOccupies || watchOccupies,
      materials: jointMaterials,
      lastShownAt,
    },
    now,
  );
  if (
    joint.proposal?.status === "visible" &&
    s.joint.proposal?.status !== "visible"
  )
    lastShownAt = now;
  const watch = reconcileWatchProposal(
    s.watch,
    {
      enabled: s.enabled && s.ready,
      blocked,
      occupied:
        preferenceOccupies ||
        joint.proposal?.status === "visible" ||
        joint.proposal?.status === "accepted",
      active: s.watchedMaterials,
      materials: jointMaterials,
      lastShownAt,
    },
    now,
  );
  if (
    watch.proposal?.status === "visible" &&
    s.watch.proposal?.status !== "visible"
  )
    lastShownAt = now;
  if (
    watch !== s.watch ||
    session !== s.session ||
    joint !== s.joint ||
    lastShownAt !== s.lastShownAt
  )
    useProposals.setState({ session, joint, watch, lastShownAt });
}
export function visitedForProposal(id: string, materials: Material[]) {
  jointMaterials = materials;
  const s = useProposals.getState();
  const joint = visitMaterial(
    s.joint,
    id,
    materials,
    s.enabled && s.ready,
    Date.now(),
  );
  if (joint !== s.joint) useProposals.setState({ joint });
}
export function finishJointInvitation(
  status: "dismissed" | "completed" = "dismissed",
) {
  useProposals.setState((s) => ({ joint: finishJoint(s.joint, status) }));
}
export function acceptJointInvitation(
  materials: Material[],
): JointDraft | undefined {
  reconcile(true, materials);
  const s = useProposals.getState();
  const p = s.joint.proposal;
  if (
    !s.enabled ||
    !s.ready ||
    p?.status !== "visible" ||
    Date.now() >= p.expiresAt ||
    !validJointContext(p, materials)
  )
    return;
  const snapshots = p.sources.map((ref) =>
    snapshot(materials.find((m) => m.id === ref.id)!),
  ) as JointDraft["snapshots"];
  useProposals.setState({
    joint: {
      ...s.joint,
      proposal: { ...p, status: "accepted" },
      suppressedPairs: [...new Set([...s.joint.suppressedPairs, p.pair])],
    },
  });
  return {
    id: crypto.randomUUID(),
    snapshots,
    excerptLimit: defaultExcerptLimit(),
  };
}
export function completedForProposal(record: LocalRecord) {
  const s = useProposals.getState();
  const session = completeOperation(
    s.session,
    { id: record.id, operation: record.operation },
    {
      enabled: s.enabled && s.ready,
      hasPreference: !!s.preference,
      blocked: true,
    },
    Date.now(),
  );
  const watch =
    record.operation === "check"
      ? proposeWatch(
          s.watch,
          record,
          s.enabled && s.ready,
          s.watchedMaterials,
          Date.now(),
        )
      : s.watch;
  if (session !== s.session || watch !== s.watch)
    useProposals.setState({ session, watch });
}
export function setWatchedMaterials(watchedMaterials: string[]) {
  useProposals.setState({ watchedMaterials });
  reconcile(true);
}
export function finishWatchInvitation(
  status: "dismissed" | "completed" = "dismissed",
) {
  useProposals.setState((s) => ({
    watch: finishWatchProposal(s.watch, status),
  }));
}
export function acceptWatchInvitation(
  materials: Material[],
): MaterialSnapshot | undefined {
  reconcile(true, materials);
  const s = useProposals.getState(),
    p = s.watch.proposal;
  if (!s.enabled || !s.ready || p?.status !== "visible") return;
  const m = materials.find((m) => m.id === p.materialId);
  if (!m) return;
  useProposals.setState({
    watch: {
      ...s.watch,
      suppressed: [...new Set([...s.watch.suppressed, p.materialId])],
      proposal: { ...p, status: "accepted" },
    },
  });
  return snapshot(m);
}
export function acceptInvitation() {
  const s = useProposals.getState();
  if (!s.enabled || !s.ready || s.preference) return false;
  const session = acceptProposal(s.session, Date.now());
  useProposals.setState({ session, error: "" });
  return session.proposal?.status === "accepted";
}
export function dismissInvitation() {
  useProposals.setState((s) => ({ session: dismissProposal(s.session) }));
}
export async function saveExcerptPreference(excerptLimit: ExcerptLimit) {
  const s = useProposals.getState();
  if (s.busy || s.session.proposal?.status !== "accepted") return;
  if (excerptLimit !== 3 && excerptLimit !== 8) return;
  useProposals.setState({ busy: true, error: "" });
  ++revision;
  const preference: ExcerptPreference = {
    kind: "excerpt_length",
    excerptLimit,
    source: "proposal",
    confirmedAt: new Date().toISOString(),
  };
  try {
    await repository.writePreference(key, preference);
    useProposals.setState({
      preference,
      ready: true,
      session: {
        ...s.session,
        suppressed: true,
        proposal: { ...s.session.proposal, status: "completed" },
      },
    });
    channel?.postMessage("changed");
  } catch (e) {
    useProposals.setState({
      error: e instanceof Error ? e.message : "Could not save the preference. Please try again.",
    });
  } finally {
    useProposals.setState({ busy: false });
  }
}
export async function forgetExcerptPreference() {
  if (useProposals.getState().busy) return;
  useProposals.setState({ busy: true, error: "" });
  ++revision;
  try {
    await repository.writePreference(key, null);
    useProposals.setState((s) => ({
      preference: undefined,
      ready: true,
      session: dismissProposal(s.session),
    }));
    channel?.postMessage("changed");
  } catch (e) {
    useProposals.setState({
      error: e instanceof Error ? e.message : "Could not forget the preference. Please try again.",
    });
  } finally {
    useProposals.setState({ busy: false });
  }
}
export const defaultExcerptLimit = (): ExcerptLimit =>
  useProposals.getState().preference?.excerptLimit ?? 8;

export function sharedProposalDelay(now = Date.now()) {
  const lastShownAt = useProposals.getState().lastShownAt;
  return lastShownAt === undefined
    ? 0
    : Math.max(0, 60000 - (now - lastShownAt));
}
export function claimSharedProposalSlot(now = Date.now()) {
  const state = useProposals.getState();
  const occupied =
    [state.joint.proposal, state.watch.proposal].some(
      (proposal) =>
        proposal?.status === "visible" || proposal?.status === "accepted",
    ) ||
    state.session.proposal?.status === "visible" ||
    (state.session.proposal?.status === "accepted" && !state.preference);
  if (occupied || sharedProposalDelay(now) > 0) return false;
  useProposals.setState({ lastShownAt: now });
  return true;
}
