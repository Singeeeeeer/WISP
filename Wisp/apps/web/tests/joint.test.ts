import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { seeds, snapshot } from "../src/domain/model";
import { runJoint, validateJoint } from "../src/domain/joint";
import {
  initialJointState,
  visitMaterial,
  reconcileJoint,
} from "../src/domain/joint-proposal";
import { createRepository } from "../src/services/repository";
import { runText } from "../src/domain/local-text";
const docs = () =>
  seeds().map((m, i) => ({ ...m, text: `${i}😀来源\n第二行\n第三行\n第四行` }));
const draft = () => ({
  id: crypto.randomUUID(),
  snapshots: docs().map((m) => snapshot(m)) as [
    ReturnType<typeof snapshot>,
    ReturnType<typeof snapshot>,
  ],
  excerptLimit: 3 as const,
});
it("keeps independent sources, exact evidence and per-material quotas", () => {
  const d = draft();
  const r = runJoint(d);
  expect(r.sources).toHaveLength(2);
  for (const part of r.sources) {
    expect(part.excerpts).toHaveLength(3);
    expect(part.omittedLines).toBe(1);
    for (const e of part.excerpts)
      expect(part.snapshot.text.slice(e.start, e.end)).toBe(e.quote);
  }
  expect(r.sources[0].snapshot.materialId).not.toBe(
    r.sources[1].snapshot.materialId,
  );
  expect(validateJoint(r)).toBe(true);
  const bad = structuredClone(r);
  bad.sources[0].excerpts[0] = bad.sources[1].excerpts[0];
  expect(validateJoint(bad)).toBe(false);
});
it("rejects duplicate, empty, oversized or partial sources", () => {
  const d = draft();
  expect(() =>
    runJoint({ ...d, snapshots: [d.snapshots[0], d.snapshots[0]] }),
  ).toThrow();
  for (const text of [" ", "字".repeat(60001)]) {
    const a = { ...d.snapshots[0], text, end: text.length };
    expect(() => runJoint({ ...d, snapshots: [a, d.snapshots[1]] })).toThrow();
  }
  expect(() =>
    runJoint({
      ...d,
      snapshots: [{ ...d.snapshots[0], start: 1 }, d.snapshots[1]],
    }),
  ).toThrow();
});
it("persists joint and old records together and rejects changed payload under one ID", async () => {
  const name = "joint-" + crypto.randomUUID();
  const repo = createRepository(name);
  const d = draft();
  const r = runJoint(d);
  await repo.saveRecord(r);
  await repo.saveRecord(runJoint(d));
  await repo.saveRecord(runText("understand", snapshot(seeds()[0]), ""));
  expect(await repo.listRecords()).toHaveLength(2);
  expect(await repo.listChecks()).toHaveLength(0);
  await expect(
    repo.saveRecord(runJoint({ ...d, excerptLimit: 8 })),
  ).rejects.toThrow();
  const changed = { ...d.snapshots[0], text: "另一份正文", end: 5 };
  await expect(
    repo.saveRecord(runJoint({ ...d, snapshots: [changed, d.snapshots[1]] })),
  ).rejects.toThrow();
  const reopened = createRepository(name);
  expect((await reopened.listRecords()).find((x) => x.id === r.id)).toEqual(r);
});
it("requires enabled A-B-A switching, not duplicate clicks or a long gap", () => {
  const m = docs();
  let s = initialJointState();
  for (const id of [m[0].id, m[0].id, m[1].id])
    s = visitMaterial(s, id, m, true, 100);
  expect(s.proposal).toBeUndefined();
  s = visitMaterial(s, m[0].id, m, true, 101);
  expect(s.proposal?.status).toBe("candidate");
  expect(
    visitMaterial(initialJointState(), m[0].id, m, false, 100).visits,
  ).toHaveLength(0);
  let late = visitMaterial(initialJointState(), m[0].id, m, true, 0);
  late = visitMaterial(late, m[1].id, m, true, 120001);
  late = visitMaterial(late, m[0].id, m, true, 120002);
  expect(late.proposal).toBeUndefined();
});
it("honors shared cooldown, occupation, disable and version invalidation", () => {
  const m = docs();
  let s = initialJointState();
  for (const id of [m[0].id, m[1].id, m[0].id])
    s = visitMaterial(s, id, m, true, 100);
  const c = {
    enabled: true,
    blocked: false,
    occupied: false,
    materials: m,
    lastShownAt: 0,
  };
  expect(reconcileJoint(s, c, 59999).proposal?.status).toBe("candidate");
  expect(reconcileJoint(s, c, 60000).proposal?.status).toBe("visible");
  expect(
    reconcileJoint(s, { ...c, occupied: true }, 60000).proposal?.status,
  ).toBe("candidate");
  expect(
    reconcileJoint(s, { ...c, materials: [{ ...m[0], version: 2 }, m[1]] }, 101)
      .proposal?.status,
  ).toBe("expired");
  expect(
    reconcileJoint(s, { ...c, enabled: false }, 101).proposal?.status,
  ).toBe("expired");
  expect(reconcileJoint(s, c, 600101).proposal?.status).toBe("expired");
});
