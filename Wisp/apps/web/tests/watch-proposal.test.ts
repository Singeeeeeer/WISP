import { it, expect } from "vitest";
import { seeds, snapshot } from "../src/domain/model";
import { runCheck } from "../src/domain/check";
import {
  initialWatchProposal,
  proposeWatch,
  reconcileWatchProposal,
  finishWatchProposal,
} from "../src/domain/watch-proposal";
const materials = seeds();
const record = runCheck(snapshot(materials[0]), "");
const context = {
  enabled: true,
  blocked: false,
  occupied: false,
  active: [],
  materials,
};
it("only offers supported explicit Checks when enabled and not already watched", () => {
  const s = initialWatchProposal();
  expect(proposeWatch(s, record, false, [], 0)).toBe(s);
  expect(
    proposeWatch(s, { ...record, outcome: "unsupported" }, true, [], 0),
  ).toBe(s);
  expect(proposeWatch(s, record, true, [record.snapshot.materialId], 0)).toBe(
    s,
  );
  expect(proposeWatch(s, record, true, [], 0).proposal?.status).toBe(
    "candidate",
  );
});
it("shares the occupied slot and cooldown, then suppresses dismissed material", () => {
  const s = proposeWatch(initialWatchProposal(), record, true, [], 0);
  expect(reconcileWatchProposal(s, { ...context, occupied: true }, 1)).toBe(s);
  expect(reconcileWatchProposal(s, { ...context, blocked: true }, 1)).toBe(s);
  expect(reconcileWatchProposal(s, { ...context, lastShownAt: 0 }, 59999)).toBe(
    s,
  );
  const visible = reconcileWatchProposal(
    s,
    { ...context, lastShownAt: 0 },
    60000,
  );
  expect(visible.proposal?.status).toBe("visible");
  const dismissed = finishWatchProposal(visible, "dismissed");
  expect(proposeWatch(dismissed, record, true, [], 70000)).toBe(dismissed);
});
it("invalidates changed sources, expired invitations and newly active watches", () => {
  const s = proposeWatch(initialWatchProposal(), record, true, [], 0);
  expect(
    reconcileWatchProposal(
      s,
      {
        ...context,
        materials: materials.map((m) => ({ ...m, version: m.version + 1 })),
      },
      1,
    ).proposal?.status,
  ).toBe("expired");
  expect(reconcileWatchProposal(s, context, 600000).proposal?.status).toBe(
    "expired",
  );
  expect(
    reconcileWatchProposal(
      s,
      { ...context, active: [record.snapshot.materialId] },
      1,
    ).proposal?.status,
  ).toBe("expired");
});
