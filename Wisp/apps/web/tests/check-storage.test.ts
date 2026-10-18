import "fake-indexeddb/auto";
import { openDB } from "idb";
import { it, expect } from "vitest";
import { createRepository } from "../src/services/repository";
import { snapshot, seeds } from "../src/domain/model";
import { runCheck } from "../src/domain/check";
it("upgrades v1 without losing material or settings and stores one immutable record per confirmation", async () => {
  const name = "upgrade-" + crypto.randomUUID();
  const old = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("materials", { keyPath: "id" });
      db.createObjectStore("preferences");
    },
  });
  const material = { ...seeds()[0], text: "我的已有内容", version: 7 };
  await old.put("materials", material);
  await old.put("preferences", true, "initialized");
  await old.put("preferences", { characterVisible: false }, "settings");
  old.close();
  const repo = createRepository(name);
  expect((await repo.initialize())[0]).toEqual(material);
  expect(await repo.readPreference("settings")).toEqual({
    characterVisible: false,
  });
  const result = runCheck(snapshot(seeds()[0]), "");
  await repo.saveCheck(result);
  await repo.saveCheck({ ...result, instruction: "重复提交不覆盖" });
  const saved = await repo.listChecks();
  expect(saved).toHaveLength(1);
  expect(saved[0].instruction).toBe("");
  result.snapshot = { ...result.snapshot, text: "改变内存" };
  expect((await repo.listChecks())[0].snapshot.text).not.toBe("改变内存");
});

it("reports an old tab blocking upgrade instead of hanging", async () => {
  const name = "blocked-" + crypto.randomUUID();
  const old = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("materials", { keyPath: "id" });
      db.createObjectStore("preferences");
    },
  });
  try {
    await expect(createRepository(name).initialize()).rejects.toThrow(
      "其他 Wisp 标签页",
    );
  } finally {
    old.close();
  }
});
