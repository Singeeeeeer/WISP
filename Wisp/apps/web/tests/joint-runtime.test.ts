import "fake-indexeddb/auto";
import { afterEach, it, expect, vi } from "vitest";
import { initialProposalState } from "../src/domain/proposal";
import { initialJointState } from "../src/domain/joint-proposal";
import { seeds, snapshot } from "../src/domain/model";
import { runText } from "../src/domain/local-text";
import {
  useProposals,
  visitedForProposal,
  reconcile,
  completedForProposal,
  dismissInvitation,
  acceptJointInvitation,
  setProposalsEnabled,
} from "../src/services/proposal-runtime";
afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  useProposals.setState({
    session: initialProposalState(),
    joint: initialJointState(),
    lastShownAt: undefined,
    enabled: true,
    ready: true,
    preference: undefined,
  });
  return seeds();
}
it("shares one visible slot and 60-second cooldown between both proposal types", () => {
  const m = setup();
  for (let i = 0; i < 3; i++)
    completedForProposal(runText("understand", snapshot(m[0]), ""));
  reconcile(false, m);
  expect(useProposals.getState().session.proposal?.status).toBe("visible");
  for (const id of [m[0].id, m[1].id, m[0].id]) visitedForProposal(id, m);
  reconcile(false, m);
  expect(useProposals.getState().joint.proposal?.status).toBe("candidate");
  dismissInvitation();
  vi.setSystemTime(159999);
  reconcile(false, m);
  expect(useProposals.getState().joint.proposal?.status).toBe("candidate");
  vi.setSystemTime(160000);
  reconcile(false, m);
  expect(useProposals.getState().joint.proposal?.status).toBe("visible");
});
it("confirmed preference does not suppress joint proposal; acceptance freezes both full sources and limit", () => {
  const m = setup();
  useProposals.setState({
    preference: {
      kind: "excerpt_length",
      excerptLimit: 3,
      source: "proposal",
      confirmedAt: new Date().toISOString(),
    },
  });
  for (const id of [m[0].id, m[1].id, m[0].id]) visitedForProposal(id, m);
  reconcile(false, m);
  const draft = acceptJointInvitation(m)!;
  expect(draft.excerptLimit).toBe(3);
  m[0].text = "changed after confirmation";
  expect(draft.snapshots[0].text).not.toBe(m[0].text);
  expect(useProposals.getState().joint.proposal?.status).toBe("accepted");
});
it("revalidates sources at acceptance and clears visits on disabled", () => {
  const m = setup();
  for (const id of [m[0].id, m[1].id, m[0].id]) visitedForProposal(id, m);
  reconcile(false, m);
  expect(
    acceptJointInvitation([{ ...m[0], version: 2 }, m[1]]),
  ).toBeUndefined();
  expect(useProposals.getState().joint.proposal?.status).toBe("expired");
  setProposalsEnabled(false);
  expect(useProposals.getState().joint.visits).toHaveLength(0);
});
