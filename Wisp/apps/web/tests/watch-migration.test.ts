import "fake-indexeddb/auto";
import { openDB } from "idb";
import { it, expect } from "vitest";
import { seeds, snapshot } from "../src/domain/model";
import { runJoint } from "../src/domain/joint";
import { newTask } from "../src/domain/task";
import { createRepository } from "../src/services/repository";
it("upgrades v4 without losing documents, settings, joint records or tasks", async () => {
  const name = "watch-upgrade-" + crypto.randomUUID();
  const old = await openDB(name, 4, {
    upgrade(db) {
      for (const store of ["materials", "checks", "tasks"])
        db.createObjectStore(store, { keyPath: "id" });
      db.createObjectStore("preferences");
    },
  });
  const docs = seeds();
  const joint = runJoint({
    id: "old-joint",
    snapshots: [snapshot(docs[0]), snapshot(docs[1])],
    excerptLimit: 3,
  });
  const task = newTask({
    entry: "summon",
    familiar: "scout_bat",
    snapshot: snapshot(docs[0]),
    instruction: "old",
  });
  for (const doc of docs) await old.put("materials", doc);
  await old.put("preferences", true, "initialized");
  await old.put("preferences", { helpfulProposals: true }, "settings");
  await old.put("checks", joint);
  await old.put("tasks", task);
  old.close();
  const repo = createRepository(name);
  expect(await repo.listWatches()).toEqual([]);
  expect(await repo.initialize()).toEqual(docs);
  expect(await repo.listRecords()).toEqual([joint]);
  expect(await repo.listTasks()).toEqual([task]);
  expect(await repo.readPreference("settings")).toEqual({
    helpfulProposals: true,
  });
  const probe = await openDB(name);
  expect(probe.version).toBe(9);
  probe.close();
});
