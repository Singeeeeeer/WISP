import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { createRepository } from "../src/services/repository";
import { seeds, snapshot } from "../src/domain/model";
import { newWatch, watchTask } from "../src/domain/watch";
import { runLocal } from "../src/domain/local-text";
it("starts only from confirmed saved full version and deduplicates one material", async () => {
  const r = createRepository("watch-" + crypto.randomUUID());
  const docs = await r.initialize();
  const w = newWatch(snapshot(docs[0]));
  await r.startWatch(w);
  await expect(r.startWatch(newWatch(snapshot(docs[0])))).rejects.toThrow();
  expect(await r.listWatches()).toHaveLength(1);
  const other = newWatch(snapshot(docs[1]));
  await r.saveMaterial({ ...docs[1], version: 2, text: "已改动" }, 1);
  await expect(r.startWatch(other)).rejects.toThrow("变化");
});
it("atomically enqueues only a new persisted version and stop wins over late replies", async () => {
  const r = createRepository("watch-tasks-" + crypto.randomUUID());
  const docs = await r.initialize();
  const w = newWatch(snapshot(docs[0]));
  await r.startWatch(w);
  expect(await r.enqueueWatchTask(watchTask(w, docs[0]))).toBeUndefined();
  const next = {
    ...docs[0],
    version: 2,
    text: "活动于11月8日开放。海报于11月10日定稿，随后开放报名。",
  };
  await r.saveMaterial(next, 1);
  const t = watchTask(w, next);
  await r.enqueueWatchTask(t);
  expect(await r.enqueueWatchTask(t)).toBeUndefined();
  expect(await r.listTasks()).toHaveLength(1);
  await r.changeTask(t.id, { type: "start" });
  await r.endWatch(w.id, "stopped");
  await r.changeTask(t.id, {
    type: "complete",
    result: runLocal("check", t.snapshot, t.instruction),
  });
  expect((await r.listTasks())[0].status).toBe("cancelled");
  const newer = { ...next, version: 3 };
  await r.saveMaterial(newer, 2);
  expect(await r.enqueueWatchTask(watchTask(w, newer))).toBeUndefined();
  expect((await r.listWatches())[0].status).toBe("stopped");
});
it("retains completed replies when stopping and records skipped invalid revisions", async () => {
  const r = createRepository("watch-complete-" + crypto.randomUUID());
  const docs = await r.initialize();
  const w = newWatch(snapshot(docs[0]));
  await r.startWatch(w);
  const next = { ...docs[0], version: 2 };
  await r.saveMaterial(next, 1);
  const t = watchTask(w, next);
  await r.enqueueWatchTask(t);
  await r.changeTask(t.id, { type: "start" });
  await r.changeTask(t.id, {
    type: "complete",
    result: runLocal("check", t.snapshot, t.instruction),
  });
  await r.saveMaterial({ ...next, version: 3, text: "" }, 2);
  await r.noteWatch(w.id, 3, "材料为空，跳过该版本");
  await r.endWatch(w.id, "interrupted");
  expect((await r.listTasks())[0].status).toBe("completed");
  expect((await r.listWatches())[0].lastVersion).toBe(3);
  expect((await r.listWatches())[0].status).toBe("interrupted");
});
