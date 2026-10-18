import type { Material } from "./model";
import type { Proposal } from "./proposal";
export type SourceRef = { id: string; version: number; title: string };
export interface JointProposal extends Omit<Proposal, "kind"> {
  kind: "joint_text";
  sources: [SourceRef, SourceRef];
  pair: string;
}
export interface JointState {
  visits: { id: string; at: number }[];
  suppressedPairs: string[];
  proposal?: JointProposal;
}
export const initialJointState = (): JointState => ({
  visits: [],
  suppressedPairs: [],
});
export function validJointContext(p: JointProposal, materials: Material[]) {
  return p.sources.every((s) =>
    materials.some(
      (m) =>
        m.id === s.id &&
        m.version === s.version &&
        m.title === s.title &&
        !!m.text.trim() &&
        m.text.length <= 60000,
    ),
  );
}
export function visitMaterial(
  s: JointState,
  id: string,
  materials: Material[],
  enabled: boolean,
  now: number,
): JointState {
  if (!enabled) return { ...s, visits: [] };
  if (
    s.proposal &&
    ["candidate", "visible", "accepted"].includes(s.proposal.status)
  )
    return s;
  const recent = s.visits.filter((v) => now - v.at <= 120000);
  if (recent.at(-1)?.id === id) return s;
  const visits = [...recent, { id, at: now }].slice(-3);
  const next = { ...s, visits };
  if (visits.length !== 3 || visits[0].id !== visits[2].id) return next;
  const pair = JSON.stringify([visits[0].id, visits[1].id].sort());
  if (s.suppressedPairs.includes(pair)) return next;
  const selected = [visits[0].id, visits[1].id].map((id) =>
    materials.find((m) => m.id === id),
  );
  if (selected.some((m) => !m || !m.text.trim() || m.text.length > 60000))
    return next;
  return {
    ...next,
    proposal: {
      id: "joint-" + now + "-" + pair,
      kind: "joint_text",
      pair,
      status: "candidate",
      createdAt: now,
      expiresAt: now + 600000,
      sources: selected.map((m) => ({
        id: m!.id,
        version: m!.version,
        title: m!.title,
      })) as [SourceRef, SourceRef],
    },
  };
}
export function finishJoint(
  s: JointState,
  status: "dismissed" | "expired" | "completed",
): JointState {
  if (!s.proposal) return { ...s, visits: [] };
  return {
    ...s,
    visits: [],
    suppressedPairs: [...new Set([...s.suppressedPairs, s.proposal.pair])],
    proposal: { ...s.proposal, status },
  };
}
export function reconcileJoint(
  s: JointState,
  c: {
    enabled: boolean;
    blocked: boolean;
    occupied: boolean;
    materials: Material[];
    lastShownAt?: number;
  },
  now: number,
): JointState {
  const p = s.proposal;
  if (!p) return !c.enabled && s.visits.length ? { ...s, visits: [] } : s;
  if (p.status !== "candidate" && p.status !== "visible") return s;
  if (!c.enabled || now >= p.expiresAt || !validJointContext(p, c.materials))
    return finishJoint(s, "expired");
  if (
    p.status === "candidate" &&
    !c.blocked &&
    !c.occupied &&
    (c.lastShownAt === undefined || now - c.lastShownAt >= 60000)
  )
    return { ...s, proposal: { ...p, status: "visible" } };
  return s;
}
