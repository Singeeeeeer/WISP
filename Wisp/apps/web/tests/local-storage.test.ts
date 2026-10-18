import { openDB } from "idb";
import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { createRepository } from "../src/services/repository";
import { snapshot, seeds } from "../src/domain/model";
import { runCheck } from "../src/domain/check";
import { runText } from "../src/domain/local-text";
it("preserves old Check records alongside new operations with idempotent saves", async () => {
  const r = createRepository("local-" + crypto.randomUUID());
  const c = runCheck(snapshot(seeds()[0]), "");
  await r.saveCheck(c);
  const u = runText("understand", snapshot(seeds()[0]), "");
  await r.saveRecord(u);
  await r.saveRecord(u);
  const d = runText("create", snapshot(seeds()[0]), "");
  await r.saveRecord(d);
  expect(await r.listRecords()).toHaveLength(3);
  expect(await r.listChecks()).toEqual([c]);
  expect((await r.listRecords()).map((x) => x.operation).sort()).toEqual([
    "check",
    "create",
    "understand",
  ]);
});

it("upgrades v2 and preserves its Check records and user documents", async () => {
  const name = "v2-" + crypto.randomUUID();
  const old = await openDB(name, 2, {
    upgrade(db) {
      db.createObjectStore("materials", { keyPath: "id" });
      db.createObjectStore("preferences");
      db.createObjectStore("checks", { keyPath: "id" });
    },
  });
  const check = runCheck(snapshot(seeds()[0]), "旧记录");
  const material = { ...seeds()[0], text: "用户自有草稿", version: 9 };
  await old.put("materials", material);
  await old.put("preferences", true, "initialized");
  await old.put("checks", check);
  old.close();
  const r = createRepository(name);
  expect(await r.listChecks()).toEqual([check]);
  expect(await r.initialize()).toEqual([material]);
  const probe = await openDB(name);
  expect(probe.version).toBe(9);
  probe.close();
});
it("does not return a different operation for a reused submission ID", async () => {
  const r = createRepository("collision-" + crypto.randomUUID());
  const s = snapshot(seeds()[0]);
  await r.saveRecord(runText("understand", s, ""));
  await expect(r.saveRecord(runText("create", s, ""))).rejects.toThrow(
    "submission ID",
  );
});
