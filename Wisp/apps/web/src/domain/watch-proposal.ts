import type { CheckRecord } from "./check";
import type { Material } from "./model";
import type { Proposal } from "./proposal";
export interface WatchProposal extends Omit<Proposal, "kind"> {
  kind: "watch_text";
  materialId: string;
  version: number;
  title: string;
}
export interface WatchProposalState {
  proposal?: WatchProposal;
  suppressed: string[];
}
export const initialWatchProposal = (): WatchProposalState => ({
  suppressed: [],
});
export function proposeWatch(
  s: WatchProposalState,
  r: CheckRecord,
  enabled: boolean,
  active: string[],
  now: number,
): WatchProposalState {
  if (
    !enabled ||
    r.outcome === "unsupported" ||
    active.includes(r.snapshot.materialId) ||
    s.suppressed.includes(r.snapshot.materialId) ||
    (s.proposal &&
      ["candidate", "visible", "accepted"].includes(s.proposal.status))
  )
    return s;
  return {
    ...s,
    proposal: {
      id: "watch-" + r.id,
      kind: "watch_text",
      materialId: r.snapshot.materialId,
      version: r.snapshot.materialVersion,
      title: r.snapshot.title,
      status: "candidate",
      createdAt: now,
      expiresAt: now + 600000,
    },
  };
}
export function finishWatchProposal(
  s: WatchProposalState,
  status: "dismissed" | "completed" | "expired",
): WatchProposalState {
  if (!s.proposal) return s;
  return {
    ...s,
    suppressed: [...new Set([...s.suppressed, s.proposal.materialId])],
    proposal: { ...s.proposal, status },
  };
}
export function reconcileWatchProposal(
  s: WatchProposalState,
  c: {
    enabled: boolean;
    blocked: boolean;
    occupied: boolean;
    active: string[];
    materials: Material[];
    lastShownAt?: number;
  },
  now: number,
): WatchProposalState {
  const p = s.proposal;
  if (!p || !["candidate", "visible"].includes(p.status)) return s;
  const m = c.materials.find((m) => m.id === p.materialId);
  if (
    !c.enabled ||
    c.active.includes(p.materialId) ||
    now >= p.expiresAt ||
    !m ||
    m.version !== p.version ||
    m.title !== p.title ||
    !m.text.trim() ||
    m.text.length > 60000
  )
    return finishWatchProposal(s, "expired");
  if (
    p.status === "candidate" &&
    !c.blocked &&
    !c.occupied &&
    (c.lastShownAt === undefined || now - c.lastShownAt >= 60000)
  )
    return { ...s, proposal: { ...p, status: "visible" } };
  return s;
}
