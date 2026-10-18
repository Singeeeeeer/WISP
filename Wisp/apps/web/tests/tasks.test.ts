import { openDB } from "idb";
import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { createRepository } from "../src/services/repository";
import { snapshot, seeds } from "../src/domain/model";
import { newTask } from "../src/domain/task";
import { runLocal } from "../src/domain/local-text";
const draft = () => ({
  entry: "summon" as const,
  snapshot: snapshot(seeds()[0]),
  instruction: "仅记录",
  familiar: "page_sprite" as const,
});
it("deduplicates submission, saves a bound reply and archives without deleting it", async () => {
  const r = createRepository("tasks-" + crypto.randomUUID());
  const t = newTask(draft());
  await r.enqueueTask(t);
  await r.enqueueTask(t);
  expect(await r.listTasks()).toHaveLength(1);
  await r.changeTask(t.id, { type: "start" });
  const result = runLocal(t.operation, t.snapshot, t.instruction);
  await r.changeTask(t.id, { type: "complete", result });
  expect((await r.listTasks())[0]).toMatchObject({
    status: "completed",
    unread: true,
    result,
  });
  await r.changeTask(t.id, { type: "read" });
  await r.changeTask(t.id, { type: "archive" });
  expect((await r.listTasks())[0]).toMatchObject({
    status: "completed",
    unread: false,
    archived: true,
    result,
  });
});
it("cancellation wins against late completion and interruption never marks success", async () => {
  const r = createRepository("cancel-" + crypto.randomUUID());
  const t = newTask(draft());
  await r.enqueueTask(t);
  await r.changeTask(t.id, { type: "start" });
  await r.changeTask(t.id, { type: "cancel" });
  await r.changeTask(t.id, {
    type: "complete",
    result: runLocal(t.operation, t.snapshot, t.instruction),
  });
  expect((await r.listTasks())[0]).toMatchObject({
    status: "cancelled",
    unread: false,
  });
  expect((await r.listTasks())[0].result).toBeUndefined();
  const other = newTask(draft());
  await r.enqueueTask(other);
  await r.changeTask(other.id, { type: "interrupt" });
  expect((await r.listTasks()).find((x) => x.id === other.id)?.status).toBe(
    "interrupted",
  );
});
it("rejects foreign results and empty material, and maps all roles", async () => {
  const r = createRepository("bound-" + crypto.randomUUID());
  const t = newTask(draft());
  await r.enqueueTask(t);
  await r.changeTask(t.id, { type: "start" });
  await expect(
    r.changeTask(t.id, {
      type: "complete",
      result: runLocal("understand", snapshot(seeds()[1]), ""),
    }),
  ).rejects.toThrow("绑定");
  expect(() =>
    newTask({ ...draft(), snapshot: { ...t.snapshot, text: " " } }),
  ).toThrow("材料");
  expect(newTask({ ...draft(), familiar: "scout_bat" }).operation).toBe(
    "check",
  );
  expect(newTask({ ...draft(), familiar: "alchemy_imp" }).operation).toBe(
    "create",
  );
});

it("rejects changed authorization under the same submission ID", async () => {
  const r = createRepository("identity-" + crypto.randomUUID());
  const d = draft();
  await r.enqueueTask(newTask(d));
  await expect(
    r.enqueueTask(newTask({ ...d, familiar: "alchemy_imp" })),
  ).rejects.toThrow("提交标识");
  await expect(
    r.enqueueTask(newTask({ ...d, instruction: "不同要求" })),
  ).rejects.toThrow("提交标识");
});
it("upgrades v3 without losing documents, preferences or direct processing records", async () => {
  const name = "v3-" + crypto.randomUUID();
  const old = await openDB(name, 3, {
    upgrade(db) {
      db.createObjectStore("materials", { keyPath: "id" });
      db.createObjectStore("preferences");
      db.createObjectStore("checks", { keyPath: "id" });
    },
  });
  const material = { ...seeds()[0], text: "已有草稿", version: 5 };
  const result = runLocal("understand", snapshot(material), "");
  await old.put("materials", material);
  await old.put("preferences", true, "initialized");
  await old.put("preferences", { characterVisible: false }, "settings");
  await old.put("checks", result);
  old.close();
  const r = createRepository(name);
  expect(await r.initialize()).toEqual([material]);
  expect(await r.listRecords()).toEqual([result]);
  expect(await r.readPreference("settings")).toEqual({
    characterVisible: false,
  });
  expect(await r.listTasks()).toEqual([]);
});
