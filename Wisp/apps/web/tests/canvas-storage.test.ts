import "fake-indexeddb/auto";
import { openDB } from "idb";
import { expect, it, vi } from "vitest";
import { createRepository } from "../src/services/repository";
import {
  connectionIsCurrent,
  snapshotNote,
  type CanvasNote,
  type SavedConnection,
} from "../src/domain/canvas";

const note = (id: string): CanvasNote => ({
  id,
  title: id,
  text: "共同材料",
  version: 1,
  revision: 1,
  x: 20,
  y: 20,
  updatedAt: "2026-10-18T00:00:00Z",
});
const relation = (
  a: CanvasNote,
  b: CanvasNote,
  id = "relation",
): SavedConnection => ({
  id,
  notes: [snapshotNote(a), snapshotNote(b)],
  operation: "connect",
  schemaVersion: "gemini-connection-1",
  execution: "gemini",
  status: "completed",
  createdAt: "2026-10-18T00:00:00Z",
  savedAt: "2026-10-18T00:01:00Z",
  reason: "",
  connections: [
    {
      title: "共同主题",
      explanation: "都有材料",
      evidence: [a, b].map((n) => ({
        noteId: n.id,
        quote: n.text,
        start: 0,
        end: n.text.length,
      })),
    },
  ],
  metadata: {
    modelId: "mock",
    promptVersion: "mock",
    validatorVersion: "mock",
    durationMs: 1,
  },
});
async function setup() {
  const name = "canvas-" + crypto.randomUUID(),
    repo = createRepository(name),
    a = note("a"),
    b = note("b");
  await repo.saveCanvasNote(a, null);
  await repo.saveCanvasNote(b, null);
  return { repo, name, a, b };
}

it("upgrades v7 without changing materials, existing results, settings, tasks or watches", async () => {
  const name = "canvas-migration-" + crypto.randomUUID();
  const old = await openDB(name, 7, {
    upgrade(db) {
      for (const store of ["materials", "checks", "tasks", "watches"])
        db.createObjectStore(store, { keyPath: "id" });
      db.createObjectStore("cauldronEntries", { keyPath: "materialId" });
      db.createObjectStore("preferences");
    },
  });
  const values = {
    materials: { id: "material", text: "旧文档" },
    checks: { id: "check", result: "保留结果" },
    tasks: { id: "task", state: "queued" },
    watches: { id: "watch", state: "active" },
    cauldronEntries: { materialId: "material", addedAt: "2026-10-17" },
  };
  for (const [store, value] of Object.entries(values))
    await old.put(store, value);
  await old.put("preferences", { reducedMotion: true }, "settings");
  old.close();
  const repo = createRepository(name);
  expect(await repo.listCanvasNotes()).toEqual([]);
  expect(await repo.listCanvasConnections()).toEqual([]);
  const upgraded = await openDB(name);
  expect(upgraded.version).toBe(8);
  expect(upgraded.objectStoreNames.length).toBe(8);
  for (const [store, value] of Object.entries(values))
    expect(await upgraded.getAll(store)).toEqual([value]);
  expect(await upgraded.get("preferences", "settings")).toEqual({
    reducedMotion: true,
  });
  upgraded.close();
});

it("requires revision locks and increments content versions only for edits", async () => {
  const { repo, name, a, b } = await setup();
  await expect(repo.saveCanvasNote(a, null)).rejects.toThrow("冲突");
  await expect(
    repo.saveCanvasNote({ ...a, revision: 2, version: 2, x: 40 }, 1),
  ).rejects.toThrow("版本");
  await expect(
    repo.saveCanvasNote({ ...a, revision: 2, title: "编辑" }, 1),
  ).rejects.toThrow("版本");
  const moved = { ...a, revision: 2, x: 80 };
  expect(await repo.saveCanvasNote(moved, 1)).toEqual(moved);
  expect(
    connectionIsCurrent(relation(a, b), await repo.listCanvasNotes()),
  ).toBe(true);
  const outcomes = await Promise.allSettled(
    ["first", "second"].map((text) =>
      createRepository(name).saveCanvasNote(
        { ...moved, text, version: 2, revision: 3 },
        2,
      ),
    ),
  );
  expect(
    outcomes.filter((outcome) => outcome.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    outcomes.filter((outcome) => outcome.status === "rejected"),
  ).toHaveLength(1);
  expect(
    connectionIsCurrent(relation(a, b), await repo.listCanvasNotes()),
  ).toBe(false);
  await expect(repo.deleteCanvasNote(a.id, 2)).rejects.toThrow("冲突");
  expect(await repo.listCanvasNotes()).toHaveLength(2);
});

it("saves once for the same pair/version even with reversed order or concurrent confirmations", async () => {
  const { repo, name, a, b } = await setup();
  const first = relation(a, b);
  await repo.saveCanvasConnection(first);
  expect(await repo.saveCanvasConnection(relation(b, a, "reversed"))).toEqual(
    first,
  );
  await expect(
    repo.saveCanvasConnection({
      ...first,
      connections: [{ ...first.connections[0], title: "不同结果" }],
    }),
  ).rejects.toThrow("提交标识");
  await repo.deleteCanvasConnection(first.id);
  const results = await Promise.all(
    ["one", "two"].map((id) =>
      createRepository(name).saveCanvasConnection(relation(a, b, id)),
    ),
  );
  expect(results[0].id).toBe(results[1].id);
  expect(await repo.listCanvasConnections()).toHaveLength(1);
  expect(await createRepository(name).listCanvasNotes()).toEqual([a, b]);
});

it("checks actual saved contents when retaining results, preserving old relations as stale after edits", async () => {
  const { repo, a, b } = await setup();
  await repo.saveCanvasConnection(relation(a, b));
  const moved = { ...a, revision: 2, x: 200 };
  await repo.saveCanvasNote(moved, 1);
  await expect(
    repo.saveCanvasConnection(relation(a, b, "moved")),
  ).resolves.toHaveProperty("id", "relation");
  await repo.saveCanvasNote(
    { ...moved, title: "新标题", version: 2, revision: 3 },
    2,
  );
  await expect(
    repo.saveCanvasConnection(relation(a, b, "stale")),
  ).rejects.toThrow("已失效");
  const stored = await repo.listCanvasConnections();
  expect(stored).toHaveLength(1);
  expect(connectionIsCurrent(stored[0], await repo.listCanvasNotes())).toBe(
    false,
  );
  await repo.deleteCanvasNote(b.id, b.revision);
  expect(await repo.listCanvasConnections()).toEqual([]);
  await expect(
    repo.saveCanvasConnection(relation(a, b, "missing")),
  ).rejects.toThrow("已失效");
});

it("rejects empty or invalid relationships without persisting them", async () => {
  const { repo, a, b } = await setup();
  await expect(
    repo.saveCanvasConnection({
      ...relation(a, b),
      connections: [],
      reason: "没有联系",
    }),
  ).rejects.toThrow("有效候选");
  const invalid = relation(a, b);
  invalid.connections[0].evidence[0].quote = "假的";
  await expect(repo.saveCanvasConnection(invalid)).rejects.toThrow("校验");
  expect(await repo.listCanvasConnections()).toEqual([]);
});

it("rolls back cascade deletion if the note delete fails and surfaces storage errors", async () => {
  const { repo, a, b } = await setup();
  const record = relation(a, b);
  await repo.saveCanvasConnection(record);
  const original = IDBObjectStore.prototype.delete;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "delete")
    .mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (this.name === "canvasNotes")
        throw new DOMException("disk failure", "UnknownError");
      return original.call(this, key);
    });
  try {
    await expect(repo.deleteCanvasNote(a.id, 1)).rejects.toThrow(
      "disk failure",
    );
  } finally {
    spy.mockRestore();
  }
  expect(await repo.listCanvasNotes()).toEqual([a, b]);
  expect(await repo.listCanvasConnections()).toEqual([record]);
  const originalAdd = IDBObjectStore.prototype.add;
  await repo.deleteCanvasConnection(record.id);
  const quota = vi
    .spyOn(IDBObjectStore.prototype, "add")
    .mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "canvasConnections")
        throw new DOMException("quota exhausted", "QuotaExceededError");
      return originalAdd.call(this, value, key);
    });
  try {
    await expect(repo.saveCanvasConnection(record)).rejects.toThrow(
      "quota exhausted",
    );
  } finally {
    quota.mockRestore();
  }
  expect(await repo.listCanvasConnections()).toEqual([]);
});
