import "fake-indexeddb/auto";
import { openDB } from "idb";
import { expect, it, vi } from "vitest";
import { createRepository } from "../src/services/repository";
import type { Material } from "../src/domain/model";

const capturedAt = "2026-10-18T08:00:00Z";
function copyOf(
  original: Material,
  range?: { start: number; end: number },
  id = "frozen-copy",
): Material {
  const start = range?.start ?? 0;
  const end = range?.end ?? original.text.length;
  const source = range ? "selection_copy" : "document_copy";
  return {
    id,
    kind: "text",
    title: original.title + " · 副本",
    text: original.text.slice(start, end),
    version: 1,
    source,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    origin: {
      kind: source,
      addedAt: capturedAt,
      copy: {
        materialId: original.id,
        materialVersion: original.version,
        title: original.title,
        source: original.source,
        start,
        end,
      },
    },
  };
}
async function setup() {
  const name = "copy-storage-" + crypto.randomUUID();
  const repo = createRepository(name);
  const [seed] = await repo.initialize();
  const original: Material = {
    ...seed,
    title: "原文标题",
    text: "前文😀选区\n末尾",
    version: seed.version + 1,
  };
  await repo.saveMaterial(original, seed.version);
  return { name, repo, original };
}

it("stores independent full and selection copies with frozen source metadata", async () => {
  const { repo, original } = await setup();
  const full = copyOf(original);
  const selection = copyOf(original, { start: 2, end: 6 }, "selection");
  await repo.createCauldronMaterial(full);
  await repo.createCauldronMaterial(selection);
  expect(selection.text).toBe("😀选区");
  await repo.saveMaterial(
    { ...original, text: "原文已经更新", title: "改后标题", version: 3 },
    original.version,
  );
  expect(await repo.readMaterial(full.id)).toEqual(full);
  expect(await repo.readMaterial(selection.id)).toEqual(selection);
  expect(
    (await repo.listCauldronEntries()).map((entry) => entry.materialId),
  ).toEqual([full.id, selection.id]);
  const editedCopy = { ...selection, text: "单独编辑副本", version: 2 };
  await repo.saveMaterial(editedCopy, selection.version);
  expect(await repo.readMaterial(selection.id)).toEqual(editedCopy);
  expect((await repo.readMaterial(original.id))?.text).toBe("原文已经更新");
  expect(editedCopy.origin?.copy).toEqual(selection.origin?.copy);
});

it.each([
  { version: 3 },
  { title: "其他标签页改名" },
  { text: "前文😀改动\n末尾" },
  { source: "pasted_text" as const },
])("rejects a new copy when saved source fields change: %o", async (change) => {
  const { name, repo, original } = await setup();
  const pending = copyOf(original, { start: 2, end: 6 });
  await createRepository(name).saveMaterial(
    { ...original, ...change },
    original.version,
  );
  await expect(repo.createCauldronMaterial(pending)).rejects.toThrow(
    "重新载入页面",
  );
  expect(await repo.readMaterial(pending.id)).toBeUndefined();
  expect(await repo.listCauldronEntries()).toEqual([]);
});

it("rejects a missing source without leaving a material or membership", async () => {
  const { name, repo, original } = await setup();
  const pending = copyOf(original);
  const db = await openDB(name);
  await db.delete("materials", original.id);
  db.close();
  await expect(repo.createCauldronMaterial(pending)).rejects.toThrow(
    "重新载入页面",
  );
  expect(await repo.readMaterial(pending.id)).toBeUndefined();
  expect(await repo.listCauldronEntries()).toEqual([]);
});

it.each([
  { start: -1, end: 3 },
  { start: 0, end: 100 },
  { start: 0.5, end: 2 },
  { start: 2, end: 2 },
  { start: 3, end: 6 },
  { start: 2, end: 3 },
])(
  "rejects invalid source ranges even if the sliced text matches: %o",
  async (range) => {
    const { repo, original } = await setup();
    const pending = copyOf(original, range);
    await expect(repo.createCauldronMaterial(pending)).rejects.toThrow("选区");
    expect(await repo.readMaterial(pending.id)).toBeUndefined();
    expect(await repo.listCauldronEntries()).toEqual([]);
  },
);

it("rejects a partial range labeled as a full copy and inconsistent copy kinds", async () => {
  const { repo, original } = await setup();
  const partial = copyOf(original, { start: 2, end: 6 });
  await expect(
    repo.createCauldronMaterial({
      ...partial,
      source: "document_copy",
      origin: { ...partial.origin!, kind: "document_copy" },
    }),
  ).rejects.toThrow("全文副本范围");
  await expect(
    repo.createCauldronMaterial({
      ...partial,
      source: "pasted_text",
    }),
  ).rejects.toThrow("副本来源");
  await expect(
    repo.createCauldronMaterial({
      ...partial,
      origin: { kind: "selection_copy", addedAt: capturedAt },
    }),
  ).rejects.toThrow("副本来源");
  expect(await repo.listCauldronEntries()).toEqual([]);
});

it("returns the same saved copy on retry after the source changes or disappears", async () => {
  const { name, repo, original } = await setup();
  const frozen = copyOf(original);
  await repo.createCauldronMaterial(frozen);
  const entries = await repo.listCauldronEntries();
  await repo.saveMaterial({ ...original, text: "已改动", version: 3 }, 2);
  expect(await repo.createCauldronMaterial(frozen)).toEqual(frozen);
  expect(await repo.listCauldronEntries()).toEqual(entries);
  const db = await openDB(name);
  await db.delete("materials", original.id);
  db.close();
  expect(await repo.createCauldronMaterial(frozen)).toEqual(frozen);
  await repo.removeCauldronEntry(frozen.id);
  expect(await repo.createCauldronMaterial(frozen)).toEqual(frozen);
  expect(await repo.listCauldronEntries()).toHaveLength(1);
});

it.each([
  { materialId: "other" },
  { materialVersion: 100 },
  { title: "伪造标题" },
  { start: 2 },
  { end: 2 },
  { source: "pasted_text" as const },
])(
  "rejects same-id retries that change frozen provenance: %o",
  async (change) => {
    const { repo, original } = await setup();
    const frozen = copyOf(original);
    await repo.createCauldronMaterial(frozen);
    const altered = structuredClone(frozen);
    altered.origin!.copy = { ...altered.origin!.copy!, ...change };
    await expect(repo.createCauldronMaterial(altered)).rejects.toThrow(
      "材料标识",
    );
    expect(await repo.readMaterial(frozen.id)).toEqual(frozen);
    expect(await repo.listCauldronEntries()).toHaveLength(1);
  },
);

it("serializes a concurrent source update before copy validation", async () => {
  const { name, repo, original } = await setup();
  const otherTab = createRepository(name);
  await otherTab.listMaterials();
  const updated = { ...original, text: "跨标签新版本", version: 3 };
  const outcomes = await Promise.allSettled([
    otherTab.saveMaterial(updated, original.version),
    repo.createCauldronMaterial(copyOf(original)),
  ]);
  expect(outcomes[0].status).toBe("fulfilled");
  expect(outcomes[1].status).toBe("rejected");
  expect(await repo.readMaterial(original.id)).toEqual(updated);
  expect(await repo.readMaterial("frozen-copy")).toBeUndefined();
  expect(await repo.listCauldronEntries()).toEqual([]);
});

it("limits concurrent copies to twelve without leaving the rejected copy behind", async () => {
  const { name, repo, original } = await setup();
  const outcomes = await Promise.allSettled(
    Array.from({ length: 13 }, (_, index) =>
      createRepository(name).createCauldronMaterial(
        copyOf(original, undefined, "copy-" + index),
      ),
    ),
  );
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(12);
  expect(
    outcomes.filter((result) => result.status === "rejected"),
  ).toHaveLength(1);
  expect(await repo.listCauldronEntries()).toHaveLength(12);
  const copies = (await repo.listMaterials()).filter(
    (material) => material.source === "document_copy",
  );
  expect(copies).toHaveLength(12);
  await repo.saveMaterial({ ...original, text: "已修改", version: 3 }, 2);
  expect(await repo.createCauldronMaterial(copies[0])).toEqual(copies[0]);
});

it("rolls back a copy when entry storage fails and allows the same draft to retry", async () => {
  const { repo, original } = await setup();
  const frozen = copyOf(original);
  const add = IDBObjectStore.prototype.add;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "add")
    .mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "cauldronEntries")
        throw new DOMException("quota exhausted", "QuotaExceededError");
      return add.call(this, value, key);
    });
  try {
    await expect(repo.createCauldronMaterial(frozen)).rejects.toThrow(
      "quota exhausted",
    );
  } finally {
    spy.mockRestore();
  }
  expect(await repo.readMaterial(frozen.id)).toBeUndefined();
  expect(await repo.readMaterial(original.id)).toEqual(original);
  expect(await repo.listCauldronEntries()).toEqual([]);
  expect(await repo.createCauldronMaterial(frozen)).toEqual(frozen);
});

it("freezes the submission before waiting for database access", async () => {
  const { repo, original } = await setup();
  const draft = copyOf(original);
  const submitted = structuredClone(draft);
  const saving = repo.createCauldronMaterial(draft);
  draft.text = "调用方后来改动";
  draft.origin!.copy = { ...draft.origin!.copy!, title: "调用方后来改名" };
  expect(await saving).toEqual(submitted);
  expect(await repo.readMaterial(draft.id)).toEqual(submitted);
});
