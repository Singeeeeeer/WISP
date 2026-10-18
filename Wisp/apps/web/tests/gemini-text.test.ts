import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { openDB } from "idb";
import { snapshot, seeds } from "../src/domain/model";
import { validateProcessing } from "../src/domain/processing";
import { newTask, transition } from "../src/domain/task";
import { summonFromResult } from "../src/domain/continuation";
import { createRepository } from "../src/services/repository";
import { runCheck } from "../src/domain/check";
import { newWatch } from "../src/domain/watch";
import { runText } from "../src/domain/local-text";
export const textResult = (
  operation: "understand" | "create" = "understand",
) => {
  const s = snapshot({ ...seeds()[0], text: "😀时间待定。时间待定。" });
  const evidence = [{ start: 7, end: 11, quote: "时间待定" }];
  const common = {
    id: s.id,
    snapshot: s,
    instruction: "请处理",
    status: "completed",
    execution: "gemini",
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "test-model",
      promptVersion: "text-1",
      validatorVersion: "text-1",
      durationMs: 1,
    },
  };
  return operation === "understand"
    ? {
        ...common,
        operation,
        schemaVersion: "gemini-understand-1",
        summaryStyle: "standard",
        outcome: "ready",
        summary: "时间尚未确定。",
        summaryEvidence: evidence,
        keyPoints: [{ title: "时间", explanation: "需补充时间", evidence }],
        missingInformation: ["时间"],
      }
    : {
        ...common,
        operation,
        schemaVersion: "gemini-create-1",
        outcome: "draft",
        draft: "欢迎参加【待补充：日期】的活动。",
        alternatives: [{ title: "轻松方向", description: "以问候开篇。" }],
        sourceFacts: [{ statement: "时间未定", evidence }],
        assumptions: ["面向一般读者"],
        missingInformation: ["日期"],
      };
};
const valid = (r: unknown) => validateProcessing(r as never);
it("accepts independently bound Gemini summaries and drafts, rejecting schema and quote corruption", () => {
  for (const op of ["understand", "create"] as const) {
    const r = textResult(op);
    expect(valid(r)).toBe(true);
    for (const bad of [
      null,
      {},
      { ...r, schemaVersion: "gemini-check-1" },
      { ...r, extra: true },
      { ...r, instruction: "x".repeat(4001) },
      { ...r, outcome: "no_findings" },
      { ...r, snapshot: { ...r.snapshot, end: 0 } },
      { ...r, metadata: { ...r.metadata, usage: null } },
    ])
      expect(valid(bad)).toBe(false);
  }
  const r = textResult();
  expect(
    valid({ ...r, summaryEvidence: [{ start: 1, end: 5, quote: "时间待定" }] }),
  ).toBe(false);
  expect(
    valid({
      ...r,
      summaryStyle: "brief",
      keyPoints: Array(4).fill(
        r.operation === "understand" ? r.keyPoints[0] : undefined,
      ),
    }),
  ).toBe(false);
  expect(
    valid({
      ...r,
      summary: "",
      summaryEvidence: [],
      keyPoints: [],
      outcome: "needs_information",
    }),
  ).toBe(true);
  expect(
    valid({
      ...r,
      summary: "",
      summaryEvidence: [],
      keyPoints: [],
      missingInformation: [],
      outcome: "needs_information",
    }),
  ).toBe(false);
  expect(valid({ ...r, excerptLimit: 8 })).toBe(false);
  const c = textResult("create");
  expect(valid({ ...c, summaryStyle: "standard" })).toBe(false);
  expect(
    valid({ ...c, draft: "", alternatives: [], outcome: "needs_information" }),
  ).toBe(true);
  expect(
    valid({
      ...c,
      draft: "",
      alternatives: [],
      missingInformation: [],
      outcome: "needs_information",
    }),
  ).toBe(false);
});
it("binds Page and Alchemy replies, keeps continuation settings and rejects watch tasks", async () => {
  for (const op of ["understand", "create"] as const) {
    const r = textResult(op);
    const d = {
      entry: "summon" as const,
      familiar:
        op === "understand"
          ? ("page_sprite" as const)
          : ("alchemy_imp" as const),
      execution: "gemini" as const,
      snapshot: r.snapshot,
      instruction: r.instruction,
      ...(op === "understand" ? { summaryStyle: "standard" as const } : {}),
    };
    const task = newTask(d);
    expect(task.operation).toBe(op);
    expect(task.excerptLimit).toBeUndefined();
    const running = transition(task, { type: "start" });
    expect(
      transition(running, { type: "complete", result: r as never }).status,
    ).toBe("completed");
    expect(() =>
      transition(
        { ...running, watchId: "forbidden" },
        { type: "complete", result: r as never },
      ),
    ).toThrow();
    expect(() => newTask({ ...d, watchId: "forbidden" } as never)).toThrow();
    const repo = createRepository("text-task-" + crypto.randomUUID());
    await repo.enqueueTask(task);
    await expect(
      repo.enqueueTask({ ...task, watchId: "forbidden" }),
    ).rejects.toThrow();
    if (op === "understand") {
      await expect(
        repo.enqueueTask({ ...task, summaryStyle: "brief" } as never),
      ).rejects.toThrow();
      expect(() =>
        transition(running, {
          type: "complete",
          result: { ...r, summaryStyle: "brief" } as never,
        }),
      ).toThrow();
    }
    const continuation = summonFromResult(r as never);
    expect(continuation.snapshot.text).toBe(r.snapshot.text);
    expect(continuation.snapshot.id).not.toBe(r.id);
    expect(continuation.execution).toBe("gemini");
    expect(continuation.excerptLimit).toBeUndefined();
    expect((continuation as any).summaryStyle).toBe(
      op === "understand" ? "standard" : undefined,
    );
    await repo.saveRecord(r as never);
    expect(await repo.listRecords()).toEqual([r]);
    if (op === "understand")
      await expect(
        repo.saveRecord({ ...r, summaryStyle: "brief" } as never),
      ).rejects.toThrow();
  }
});
it("upgrades all six v6 stores without rewriting data and rejects old version opens", async () => {
  const name = "text-v7-" + crypto.randomUUID();
  const old = await openDB(name, 6, {
    upgrade(db) {
      for (const store of ["materials", "checks", "tasks", "watches"])
        db.createObjectStore(store, { keyPath: "id" });
      db.createObjectStore("preferences");
      db.createObjectStore("cauldronEntries", { keyPath: "materialId" });
    },
  });
  const material = seeds()[0],
    s = snapshot(material),
    record = runCheck(s, "");
  const legacy = runText("understand", snapshot(material), "");
  delete legacy.excerptLimit;
  const task = newTask({
    entry: "summon",
    familiar: "scout_bat",
    snapshot: snapshot(material),
    instruction: "",
  });
  const watch = newWatch(snapshot(material));
  const entry = { materialId: material.id, addedAt: new Date().toISOString() };
  await old.put("materials", material);
  await old.put("checks", record);
  await old.put("checks", legacy);
  await old.put("tasks", task);
  await old.put("watches", watch);
  await old.put("cauldronEntries", entry);
  await old.put("preferences", true, "initialized");
  await old.put("preferences", { excerptLimit: 3 }, "custom");
  let closed = false;
  old.addEventListener("versionchange", () => {
    closed = true;
    old.close();
  });
  const repo = createRepository(name);
  expect(await repo.initialize()).toEqual([material]);
  expect(closed).toBe(true);
  expect(await repo.listRecords()).toEqual(
    expect.arrayContaining([record, legacy]),
  );
  expect(await repo.listTasks()).toEqual([task]);
  expect(await repo.listWatches()).toEqual([watch]);
  expect(await repo.listCauldronEntries()).toEqual([entry]);
  expect(await repo.readPreference("custom")).toEqual({ excerptLimit: 3 });
  const probe = await openDB(name);
  expect(probe.version).toBe(9);
  probe.close();
  await expect(openDB(name, 6)).rejects.toMatchObject({ name: "VersionError" });
});

it("enforces field limits and aggregate output budgets, including UTF-16 quote boundaries", () => {
  const u = textResult();
  if (u.operation !== "understand") throw Error("fixture");
  for (const bad of [
    { ...u, summary: "x".repeat(4001) },
    { ...u, summaryStyle: "brief", summary: "x".repeat(1201) },
    { ...u, summaryEvidence: [] },
    { ...u, keyPoints: [{...u.keyPoints[0],title:"x".repeat(201)}] },
    { ...u, keyPoints: [{...u.keyPoints[0],evidence:[]}] },
    { ...u, missingInformation:Array(11).fill("missing") },
    { ...u, missingInformation:[" "] },
    { ...u, summaryEvidence:[{start:0,end:1,quote:"\uD83D"}] },
  ]) expect(valid(bad)).toBe(false);
  const c = textResult("create");
  if (c.operation !== "create") throw Error("fixture");
  for (const bad of [
    {...c,draft:"x".repeat(12001)}, {...c, alternatives:Array(3).fill(c.alternatives[0])},
    {...c,sourceFacts:[{...c.sourceFacts[0],evidence:[]}]},
    {...c,assumptions:[" "]}, {...c,assumptions:Array(11).fill("assumed")},
    {...c,draft:"x".repeat(12000),alternatives:Array(2).fill({title:"t".repeat(200),description:"d".repeat(4000)}),
      sourceFacts:[],assumptions:Array(10).fill("a".repeat(2000)),missingInformation:Array(10).fill("m".repeat(2000))},
  ]) expect(valid(bad)).toBe(false);
  expect(valid({...c,sourceFacts:[],assumptions:["创意方向，不是已证实事实"]})).toBe(true);
});
it("rejects v7 upgrade blocked by an old page without deleting the old material", async () => {
  const name = "text-v7-blocked-" + crypto.randomUUID();
  const old = await openDB(name,6,{upgrade(db){db.createObjectStore("materials",{keyPath:"id"});}});
  const m=seeds()[0];
  await old.put("materials",m);
  await expect(createRepository(name).listMaterials()).rejects.toThrow("其他 Wisp 标签页阻塞");
  expect(await old.get("materials",m.id)).toEqual(m);
  old.close();
  const repo=createRepository(name);
  expect(await repo.listMaterials()).toEqual([m]);
});
