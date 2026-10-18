import "fake-indexeddb/auto";
import { openDB } from "idb";
import { expect, it } from "vitest";
import { createRepository } from "../src/services/repository";
import { newBatchTask } from "../src/domain/task";
import { runText } from "../src/domain/local-text";
import { runCheck } from "../src/domain/check";
import { batchDraft, batchResult } from "./batch-fixtures";

it("stores one batch result, deduplicates retry and rejects changed source authorization or scope", async () => {
  const repo = createRepository("batch-record-" + crypto.randomUUID()),
    record = batchResult("understand");
  await repo.saveRecord(record);
  await repo.saveRecord(structuredClone(record));
  expect(await repo.listRecords()).toEqual([record]);
  for (const other of [
    {
      ...record,
      snapshots: record.snapshots.map((s) => ({ ...s, title: "不同标题" })),
    },
    { ...record, instruction: "不同要求" },
    { ...record, summaryStyle: "brief" },
    {
      ...record,
      snapshots: record.snapshots.map((s) => ({ ...s, materialVersion: 2 })),
    },
  ])
    await expect(repo.saveRecord(other as never)).rejects.toThrow("提交标识");
  const local = runText(
    "understand",
    { ...record.snapshots[0], id: record.id },
    "",
  );
  await expect(repo.saveRecord(local)).rejects.toThrow("提交标识");
  await expect(
    repo.saveRecord({ ...record, summaryEvidence: [] }),
  ).rejects.toThrow("校验");
});
it("keeps legacy check queries single-material while the complete record query includes batch checks", async () => {
  const repo = createRepository("batch-legacy-check-" + crypto.randomUUID()),
    batch = batchResult("check");
  const single = runCheck(batch.snapshots[0], "");
  await repo.saveRecord(batch);
  await repo.saveCheck(single);
  expect(await repo.listChecks()).toEqual([single]);
  expect(await repo.listRecords()).toHaveLength(2);
});
it("saves one multi-material familiar reply and preserves it through read and archive", async () => {
  for (const operation of ["understand", "check", "create"] as const) {
    const repo = createRepository("batch-reply-" + crypto.randomUUID()),
      result = batchResult(operation),
      task = newBatchTask(batchDraft(result));
    await repo.enqueueTask(task);
    await repo.enqueueTask(task);
    await repo.changeTask(task.id, { type: "start" });
    await repo.changeTask(task.id, { type: "complete", result });
    expect(await repo.listTasks()).toHaveLength(1);
    expect((await repo.listTasks())[0]).toMatchObject({
      status: "completed",
      unread: true,
      result,
    });
    expect(await repo.listRecords()).toEqual([]);
    await repo.changeTask(task.id, { type: "read" });
    await repo.changeTask(task.id, { type: "archive" });
    expect((await repo.listTasks())[0]).toMatchObject({
      archived: true,
      unread: false,
      result,
    });
  }
});
it("deduplicates complete batch tasks and rejects changing any frozen member or role", async () => {
  const repo = createRepository("batch-auth-" + crypto.randomUUID()),
    task = newBatchTask(batchDraft());
  await repo.enqueueTask(task);
  await expect(
    repo.enqueueTask({ ...task, instruction: "changed" }),
  ).rejects.toThrow("提交标识");
  await expect(
    repo.enqueueTask({ ...task, snapshots: [...task.snapshots].reverse() }),
  ).rejects.toThrow("提交标识");
  await expect(
    repo.enqueueTask({
      ...task,
      familiar: "scout_bat",
      operation: "check",
      summaryStyle: undefined,
    }),
  ).rejects.toThrow("提交标识");
  await expect(
    repo.enqueueTask({ ...task, snapshots: [task.snapshots[0]] }),
  ).rejects.toThrow();
});
it("cancellation, interruption and failure isolate every late result without saving a false success", async () => {
  for (const action of [
    { type: "cancel" },
    { type: "interrupt" },
    { type: "fail", error: "mock failure" },
  ] as const) {
    const repo = createRepository("batch-stopped-" + crypto.randomUUID()),
      result = batchResult(),
      task = newBatchTask(batchDraft(result));
    await repo.enqueueTask(task);
    await repo.changeTask(task.id, { type: "start" });
    const stopped = await repo.changeTask(task.id, action);
    expect(
      await repo.changeTask(task.id, { type: "complete", result }),
    ).toEqual(stopped);
    expect(stopped.result).toBeUndefined();
    expect(await repo.listRecords()).toEqual([]);
  }
});
it("upgrades v8 without altering existing data and blocks old clients from batch records", async () => {
  const name = "batch-upgrade-" + crypto.randomUUID();
  const old = await openDB(name, 8, {
    upgrade(db) {
      db.createObjectStore("checks", { keyPath: "id" });
    },
  });
  const batch = batchResult(),
    oldRecord = runText("understand", batch.snapshots[0], "");
  await old.put("checks", oldRecord);
  old.close();
  const repo = createRepository(name);
  await repo.saveRecord(batch);
  expect(await repo.listRecords()).toEqual(
    expect.arrayContaining([oldRecord, batch]),
  );
  const db = await openDB(name);
  expect(db.version).toBe(9);
  db.close();
  await expect(openDB(name, 8)).rejects.toMatchObject({ name: "VersionError" });
});
