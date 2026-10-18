import type { Operation, ExcerptLimit } from "./model";
export interface ExcerptPreference {
  kind: "excerpt_length";
  excerptLimit: ExcerptLimit;
  confirmedAt: string;
  source: "proposal";
}
export interface Proposal {
  id: string;
  kind: "excerpt_preference";
  status:
    | "candidate"
    | "visible"
    | "accepted"
    | "dismissed"
    | "expired"
    | "completed";
  createdAt: number;
  expiresAt: number;
}
export interface ProposalState {
  seen: string[];
  suppressed: boolean;
  lastShownAt?: number;
  proposal?: Proposal;
}
export interface ProposalContext {
  enabled: boolean;
  hasPreference: boolean;
  blocked: boolean;
}
export const initialProposalState = (): ProposalState => ({
  seen: [],
  suppressed: false,
});
export function completeOperation(
  s: ProposalState,
  event: { id: string; operation: Operation },
  c: ProposalContext,
  now: number,
): ProposalState {
  if (
    !c.enabled ||
    c.hasPreference ||
    s.suppressed ||
    s.proposal ||
    event.operation !== "understand" ||
    s.seen.includes(event.id)
  )
    return s;
  const seen = [...s.seen, event.id];
  return {
    ...s,
    seen,
    proposal:
      seen.length < 3
        ? undefined
        : {
            id: "excerpt-" + event.id,
            kind: "excerpt_preference",
            status: "candidate",
            createdAt: now,
            expiresAt: now + 600000,
          },
  };
}
export function reconcileProposal(
  s: ProposalState,
  c: ProposalContext,
  now: number,
): ProposalState {
  const p = s.proposal;
  if (!p) return !c.enabled && s.seen.length ? { ...s, seen: [] } : s;
  if (p.status !== "candidate" && p.status !== "visible") return s;
  if (!c.enabled || c.hasPreference || now >= p.expiresAt)
    return { ...s, suppressed: true, proposal: { ...p, status: "expired" } };
  if (
    p.status === "candidate" &&
    !c.blocked &&
    (s.lastShownAt === undefined || now - s.lastShownAt >= 60000)
  )
    return { ...s, lastShownAt: now, proposal: { ...p, status: "visible" } };
  return s;
}
export function dismissProposal(s: ProposalState): ProposalState {
  return {
    ...s,
    suppressed: true,
    proposal: s.proposal ? { ...s.proposal, status: "dismissed" } : undefined,
  };
}
export function acceptProposal(s: ProposalState, now: number): ProposalState {
  if (s.proposal?.status !== "visible") return s;
  return {
    ...s,
    suppressed: true,
    proposal: {
      ...s.proposal,
      status: now >= s.proposal.expiresAt ? "expired" : "accepted",
    },
  };
}
export function validPreference(value: unknown): value is ExcerptPreference {
  const p = value as ExcerptPreference | null;
  return (
    !!p &&
    p.kind === "excerpt_length" &&
    (p.excerptLimit === 3 || p.excerptLimit === 8) &&
    p.source === "proposal" &&
    typeof p.confirmedAt === "string" &&
    Number.isFinite(Date.parse(p.confirmedAt))
  );
}
