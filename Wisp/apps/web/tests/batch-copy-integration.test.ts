import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createTextMaterial } from "../src/domain/cauldron";
import {
  sliceBatchSnapshot,
  validBatchSnapshots,
  validateBatch,
} from "../src/domain/batch";
import { createMaterialCopy } from "../src/domain/material-copy";
import { selectText, snapshot, type Operation } from "../src/domain/model";
import { newBatchTask } from "../src/domain/task";
import {
  createBatchSubmission,
  requestBatchGemini,
} from "../src/services/batch";
import { createRepository } from "../src/services/repository";
import { batchDraft, batchResult } from "./batch-fixtures";

afterEach(() => vi.unstubAllGlobals());

function copyBatch(operation: Operation = "understand") {
  const result = batchResult(operation);
  const document = {
    ...createTextMaterial({
      title: "Original document",
      text: result.snapshots[0].text,
      source: "pdf_file",
      file: { name: "original.pdf", size: 123, lastModified: 456 },
    }),
    version: 7,
  };
  const prefix = "😀前言\n";
  const selected = {
    ...createTextMaterial({
      title: "Original selection",
      text: prefix + result.snapshots[1].text + "\n结尾",
      source: "pasted_text",
    }),
    version: 9,
  };
  const copies = [
    createMaterialCopy(document),
    createMaterialCopy(
      selected,
      selectText(
        selected,
        prefix.length,
        prefix.length + result.snapshots[1].text.length,
      ),
    ),
  ];
  return { ...result, snapshots: copies.map((copy) => snapshot(copy)) };
}

it.each(["understand", "check", "create"] as const)(
  "preserves document and selection copy provenance through batch %s and both storage paths",
  async (operation) => {
    const result = copyBatch(operation);
    const name = "batch-copy-" + crypto.randomUUID();
    const repo = createRepository(name);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal("fetch", fetchMock);
    expect(validBatchSnapshots(result.snapshots)).toBe(true);
    expect(validateBatch(result)).toBe(true);
    expect(result.snapshots[0]).toMatchObject({
      source: "document_copy",
      origin: {
        fileName: "original.pdf",
        copy: {
          materialVersion: 7,
          start: 0,
          end: result.snapshots[0].text.length,
          source: "pdf_file",
        },
      },
    });
    expect(result.snapshots[1]).toMatchObject({
      source: "selection_copy",
      start: 0,
      origin: {
        copy: {
          materialVersion: 9,
          start: 5,
          end: 5 + result.snapshots[1].text.length,
          source: "pasted_text",
        },
      },
    });
    const options =
      operation === "understand"
        ? { operation, summaryStyle: "standard" as const }
        : { operation };
    const submission = createBatchSubmission(
      result.id,
      result.snapshots,
      result.instruction,
      options,
      (record) => repo.saveRecord(record),
    );
    expect(await submission.run()).toEqual(result);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).snapshots).toEqual(
      result.snapshots,
    );
    expect(await createRepository(name).listRecords()).toEqual([result]);

    const task = newBatchTask(batchDraft(result));
    await repo.enqueueTask(task);
    await repo.changeTask(task.id, { type: "start" });
    await repo.changeTask(task.id, { type: "complete", result });
    expect((await repo.listTasks())[0].result).toEqual(result);
  },
);

it("keeps original selection provenance when a copied batch source is narrowed again", () => {
  const result = copyBatch();
  const source = result.snapshots[1];
  const narrowed = sliceBatchSnapshot(source, 2, 5);
  expect(narrowed).toMatchObject({
    text: "40人",
    start: 2,
    end: 5,
    origin: source.origin,
  });
  expect(narrowed.origin?.copy).not.toBe(source.origin?.copy);
  expect(validBatchSnapshots([result.snapshots[0], narrowed])).toBe(true);
});

it("rejects malformed copy provenance before network or storage and rejects altered response provenance", async () => {
  const result = copyBatch();
  const repo = createRepository("batch-copy-invalid-" + crypto.randomUUID());
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  for (const copy of [
    undefined,
    { ...result.snapshots[0].origin!.copy!, materialVersion: 0 },
  ]) {
    const broken = structuredClone(result);
    broken.snapshots[0] = {
      ...broken.snapshots[0],
      origin: { ...broken.snapshots[0].origin!, copy },
    };
    expect(validBatchSnapshots(broken.snapshots)).toBe(false);
    expect(validateBatch(broken)).toBe(false);
    await expect(
      requestBatchGemini(broken.id, broken.snapshots, broken.instruction, {
        operation: "understand",
        summaryStyle: "standard",
      }),
    ).rejects.toThrow("2～12");
    await expect(repo.saveRecord(broken)).rejects.toThrow("校验");
  }
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await repo.listRecords()).toEqual([]);

  const changed = structuredClone(result);
  changed.snapshots[1] = {
    ...changed.snapshots[1],
    origin: {
      ...changed.snapshots[1].origin!,
      copy: { ...changed.snapshots[1].origin!.copy!, materialVersion: 10 },
    },
  };
  expect(validateBatch(changed)).toBe(true);
  fetchMock.mockResolvedValue(new Response(JSON.stringify(changed)));
  const save = vi.fn();
  const submission = createBatchSubmission(
    result.id,
    result.snapshots,
    result.instruction,
    {
      operation: "understand",
      summaryStyle: "standard",
    },
    save,
  );
  await expect(submission.run()).rejects.toThrow("绑定");
  expect(save).not.toHaveBeenCalled();
});
