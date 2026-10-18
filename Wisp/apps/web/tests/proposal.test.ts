import { it, expect } from "vitest";
import {
  initialProposalState,
  completeOperation,
  reconcileProposal,
  dismissProposal,
  acceptProposal,
} from "../src/domain/proposal";
const config = { enabled: true, hasPreference: false, blocked: false };
function three() {
  let s = initialProposalState();
  for (const id of ["a", "b", "c"])
    s = completeOperation(s, { id, operation: "understand" }, config, 100);
  return s;
}
it("requires three distinct successful Understand events and ignores other operations and disabled collection", () => {
  let s = initialProposalState();
  s = completeOperation(
    s,
    { id: "off", operation: "understand" },
    { ...config, enabled: false },
    0,
  );
  s = completeOperation(s, { id: "check", operation: "check" }, config, 0);
  for (const id of ["a", "a", "b"])
    s = completeOperation(s, { id, operation: "understand" }, config, 100);
  expect(s.proposal).toBeUndefined();
  expect(s.seen).toEqual(["a", "b"]);
  s = completeOperation(s, { id: "c", operation: "understand" }, config, 100);
  expect(s.proposal?.status).toBe("candidate");
});
it("defers while blocked, enforces cooldown, expires and clears on disable", () => {
  const s = three();
  expect(
    reconcileProposal(s, { ...config, blocked: true }, 101).proposal?.status,
  ).toBe("candidate");
  expect(
    reconcileProposal({ ...s, lastShownAt: 0 }, config, 59999).proposal?.status,
  ).toBe("candidate");
  expect(
    reconcileProposal({ ...s, lastShownAt: 0 }, config, 60000).proposal?.status,
  ).toBe("visible");
  expect(reconcileProposal(s, config, 600101).proposal?.status).toBe("expired");
  expect(
    reconcileProposal(s, { ...config, enabled: false }, 101).proposal?.status,
  ).toBe("expired");
});
it("acceptance does not save a preference; dismiss and saved preference suppress further invitations", () => {
  const s = reconcileProposal(three(), config, 101);
  expect(acceptProposal(s, 102).proposal?.status).toBe("accepted");
  expect(acceptProposal(s, 600101).proposal?.status).toBe("expired");
  const dismissed = dismissProposal(s);
  expect(
    completeOperation(
      dismissed,
      { id: "d", operation: "understand" },
      config,
      70000,
    ).proposal?.status,
  ).toBe("dismissed");
  expect(
    reconcileProposal(s, { ...config, hasPreference: true }, 102).proposal
      ?.status,
  ).toBe("expired");
});
