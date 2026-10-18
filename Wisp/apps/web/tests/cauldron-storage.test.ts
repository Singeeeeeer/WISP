import "fake-indexeddb/auto";
import { openDB } from "idb";
import { it, expect, vi } from "vitest";
import { createRepository } from "../src/services/repository";
import { createTextMaterial } from "../src/domain/cauldron";
import { snapshot, seeds } from "../src/domain/model";
import { runJoint } from "../src/domain/joint";
import { newTask } from "../src/domain/task";
import { runCheck } from "../src/domain/check";
import type { Material } from "../src/domain/model";
import { newWatch } from "../src/domain/watch";
function legacySnapshot(m: Material) {
  const { source, origin, ...legacy } = snapshot(m);
  return legacy;
}
const material = (id: string) =>
  createTextMaterial({ id, title: id, text: "正文", source: "pasted_text" });
it("keeps seeds out and atomically limits concurrent additions to twelve", async () => {
  const name = "cauldron-" + crypto.randomUUID();
  const r = createRepository(name);
  await r.initialize();
  expect(await r.listCauldronEntries()).toEqual([]);
  const results = await Promise.allSettled(
    Array.from({ length: 13 }, (_, i) =>
      createRepository(name).createCauldronMaterial(material(String(i))),
    ),
  );
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(12);
  expect(await r.listCauldronEntries()).toHaveLength(12);
  expect(await r.listMaterials()).toHaveLength(14);
  await expect(r.addCauldronEntry("proposal")).rejects.toThrow("灵感熔炉");
  const m = (await r.listMaterials()).find((x) => x.id === "0")!;
  await expect(r.createCauldronMaterial(m)).resolves.toEqual(m);
  await expect(
    r.createCauldronMaterial({ ...m, text: "不同" }),
  ).rejects.toThrow();
  expect((await r.readMaterial(m.id))?.text).toBe("正文");
});
it("requires an existing material and removing membership preserves dependent records", async () => {
  const r = createRepository("remove-" + crypto.randomUUID());
  await r.initialize();
  await expect(r.addCauldronEntry("missing")).rejects.toThrow();
  const m = material("retained");
  await r.createCauldronMaterial(m);
  await r.addCauldronEntry(m.id);
  const task = newTask({
    entry: "summon",
    familiar: "scout_bat",
    snapshot: snapshot(m),
    instruction: "",
  });
  const watch = newWatch(snapshot(m));
  await r.enqueueTask({ ...task, watchId: watch.id });
  const running = await r.changeTask(task.id, { type: "start" });
  const result = runCheck(snapshot(m), "");
  await r.saveCheck(result);
  await r.startWatch(watch);
  await r.removeCauldronEntry(m.id);
  await r.removeCauldronEntry(m.id);
  expect(await r.listCauldronEntries()).toEqual([]);
  expect(await r.readMaterial(m.id)).toEqual(m);
  expect(await r.listTasks()).toEqual([running]);
  expect(running.status).toBe("running");
  expect(running.watchId).toBe(watch.id);
  expect(await r.listRecords()).toEqual([result]);
  expect(await r.listWatches()).toEqual([watch]);
});
it("upgrades v5 preserving all stores and leaves the cauldron empty", async () => {
  const name = "cauldron-v5-" + crypto.randomUUID();
  const old = await openDB(name, 5, {
    upgrade(db) {
      for (const s of ["materials", "checks", "tasks", "watches"])
        db.createObjectStore(s, { keyPath: "id" });
      db.createObjectStore("preferences");
    },
  });
  const docs = seeds();
  const joint = runJoint({
    id: "joint",
    snapshots: [legacySnapshot(docs[0]), legacySnapshot(docs[1])],
    excerptLimit: 3,
  });
  const task = newTask({
    entry: "summon",
    familiar: "scout_bat",
    snapshot: legacySnapshot(docs[0]),
    instruction: "",
  });
  const watch = newWatch(legacySnapshot(docs[0]));
  for (const m of docs) await old.put("materials", m);
  await old.put("checks", joint);
  await old.put("tasks", task);
  await old.put("watches", watch);
  await old.put("preferences", true, "initialized");
  await old.put("preferences", { reducedMotion: true }, "settings");
  await old.put("preferences", [{ x: 12, y: 31 }], "layout");
  old.close();
  const r = createRepository(name);
  expect(await r.initialize()).toEqual(docs);
  expect(await r.listRecords()).toEqual([joint]);
  expect(await r.listTasks()).toEqual([task]);
  expect(await r.listWatches()).toEqual([watch]);
  const storedJoint = (await r.listRecords())[0];
  if (storedJoint.operation !== "joint")
    throw new Error("Expected joint record");
  const storedTask = (await r.listTasks())[0];
  if (storedTask.scope === "batch") throw new Error("Expected single task");
  for (const oldSnapshot of [
    ...storedJoint.sources.map((source) => source.snapshot),
    storedTask.snapshot,
    (await r.listWatches())[0].baseline,
  ]) {
    expect(oldSnapshot).not.toHaveProperty("source");
    expect(oldSnapshot).not.toHaveProperty("origin");
  }
  expect(await r.readPreference("settings")).toEqual({ reducedMotion: true });
  expect(await r.readPreference("layout")).toEqual([{ x: 12, y: 31 }]);
  expect(await r.listCauldronEntries()).toEqual([]);
  const probe = await openDB(name);
  expect(probe.version).toBe(9);
  expect(probe.objectStoreNames.length).toBe(8);
  probe.close();
});

it("rolls back the material if the membership write fails", async () => {
  const r = createRepository("rollback-" + crypto.randomUUID());
  await r.initialize();
  const original = IDBObjectStore.prototype.add;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "add")
    .mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "cauldronEntries")
        throw new DOMException("quota exhausted", "QuotaExceededError");
      return original.call(this, value, key);
    });
  try {
    await expect(
      r.createCauldronMaterial(material("rollback")),
    ).rejects.toThrow("quota exhausted");
  } finally {
    spy.mockRestore();
  }
  expect(await r.readMaterial("rollback")).toBeUndefined();
  expect(await r.listCauldronEntries()).toEqual([]);
});
it("preserves old material editing without imposing the import limit", async () => {
  const r = createRepository("legacy-edit-" + crypto.randomUUID());
  const [m] = await r.initialize();
  const edited = { ...m, text: "x".repeat(60001), version: m.version + 1 };
  await r.saveMaterial(edited, m.version);
  await r.addCauldronEntry(m.id);
  expect(await r.readMaterial(m.id)).toEqual(edited);
});
