import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createTextMaterial, sourceDescription } from "../src/domain/cauldron";
import { createMaterialCopy } from "../src/domain/material-copy";
import {
  seeds,
  selectText,
  snapshot,
  type MaterialSnapshot,
  type Operation,
} from "../src/domain/model";
import {
  validateProcessing,
  type GeminiRecord,
} from "../src/domain/processing";
import { requestGemini } from "../src/services/gemini";
import { createRepository } from "../src/services/repository";

afterEach(() => vi.unstubAllGlobals());

function original() {
  return createTextMaterial({
    title: "原始标题",
    text: "😀前言\n  时间待定。\n结尾",
    source: "pdf_file",
    file: { name: "原始材料.pdf", size: 123, lastModified: 456 },
    note: "仅提取文字。",
  });
}

function answer(s: MaterialSnapshot, operation: Operation): GeminiRecord {
  const base = {
    id: s.id,
    snapshot: s,
    instruction: "处理当前材料",
    status: "completed" as const,
    execution: "gemini" as const,
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "mock",
      promptVersion: "mock",
      validatorVersion: "mock",
      durationMs: 1,
    },
    outcome: "needs_information" as const,
    missingInformation: ["请补充日期。"],
  };
  if (operation === "check")
    return {
      ...base,
      operation,
      schemaVersion: "gemini-check-1",
      findings: [],
    };
  if (operation === "understand")
    return {
      ...base,
      operation,
      schemaVersion: "gemini-understand-1",
      summaryStyle: "brief",
      summary: "",
      summaryEvidence: [],
      keyPoints: [],
    };
  return {
    ...base,
    operation,
    schemaVersion: "gemini-create-1",
    draft: "",
    alternatives: [],
    sourceFacts: [],
    assumptions: [],
  };
}

it("copies full text with an independent identity and frozen original title, version and file metadata", () => {
  const material = { ...original(), version: 7 };
  const copy = createMaterialCopy(material);
  expect(copy.id).not.toBe(material.id);
  expect(copy).toMatchObject({
    text: material.text,
    version: 1,
    source: "document_copy",
  });
  expect(copy.origin).toMatchObject({
    kind: "document_copy",
    fileName: "原始材料.pdf",
    byteSize: 123,
    lastModified: 456,
    note: "仅提取文字。",
    copy: {
      materialId: material.id,
      materialVersion: 7,
      title: "原始标题",
      start: 0,
      end: material.text.length,
      source: "pdf_file",
    },
  });
  material.text = "新的正文";
  material.title = "新标题";
  material.origin!.note = "新说明";
  expect(copy.text).toContain("时间待定");
  expect(copy.origin!.copy!.title).toBe("原始标题");
  expect(copy.origin!.note).toBe("仅提取文字。");
  expect(sourceDescription(copy)).toContain("全文副本 · 原始标题 · v7");
  expect(sourceDescription(copy)).toContain("原始材料.pdf");
});

it("preserves selected text exactly including whitespace and CRLF and deeply freezes source snapshots", () => {
  const material = { ...seeds()[0], text: "😀前言\r\n  正文\r\n结尾" };
  const selected = selectText(material, 4, 12);
  const copy = createMaterialCopy(material, selected);
  expect(copy.text).toBe("\r\n  正文\r\n");
  expect(copy.origin!.copy).toMatchObject({ start: 4, end: 12 });
  const frozen = snapshot(copy);
  expect(Object.isFrozen(copy.origin!.copy)).toBe(true);
  expect(Object.isFrozen(frozen.origin)).toBe(true);
  expect(Object.isFrozen(frozen.origin!.copy)).toBe(true);
  expect(frozen.origin!.copy).not.toBe(copy.origin!.copy);
  expect(() => {
    (frozen.origin!.copy as { title: string }).title = "被改写";
  }).toThrow();
});

it("rejects stale or mismatched selections and split surrogate pairs", () => {
  const material = original();
  const selected = selectText(material, 0, 4);
  for (const selection of [
    { ...selected, materialId: "different" },
    { ...selected, materialVersion: material.version + 1 },
    { ...selected, selectedText: "不同文本" },
    { ...selected, start: 1, selectedText: material.text.slice(1, 4) },
    { ...selected, end: 1, selectedText: material.text.slice(0, 1) },
    { ...selected, start: -1, end: 0, selectedText: "" },
  ])
    expect(() => createMaterialCopy(material, selection)).toThrow();
});

it("applies nonblank, NUL and UTF-16 limits without truncating text or splitting title characters", () => {
  for (const text of ["  \r\n", "正文\0", "😀".repeat(30001)])
    expect(() => createMaterialCopy({ ...original(), text })).toThrow();
  const material = {
    ...original(),
    title: "😀".repeat(100),
    text: "😀".repeat(30000),
  };
  const copy = createMaterialCopy(material);
  expect(copy.text.length).toBe(60000);
  expect(copy.title.length).toBeLessThanOrEqual(120);
  expect(copy.title.endsWith(" · 全文副本")).toBe(true);
  expect(copy.title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  expect(() => createMaterialCopy(material, undefined, material.id)).toThrow(
    "独立",
  );
});

it("a second copy points at its direct saved source and keeps original file details", () => {
  const first = createMaterialCopy(original());
  first.text = "副本经过编辑。";
  first.version = 2;
  const second = createMaterialCopy(first, selectText(first, 0, 4));
  expect(second.origin!.copy).toEqual({
    materialId: first.id,
    materialVersion: 2,
    title: first.title,
    start: 0,
    end: 4,
    source: "document_copy",
  });
  expect(second.origin!.fileName).toBe("原始材料.pdf");
  expect(second.origin!.note).toBe("仅提取文字。");
});

it.each(["document_copy", "selection_copy"] as const)(
  "round-trips %s through all three capabilities and stored results",
  async (kind) => {
    const material = original();
    const copied = createMaterialCopy(
      material,
      kind === "selection_copy" ? selectText(material, 5, 12) : undefined,
    );
    const repo = createRepository(`copies-${crypto.randomUUID()}`);
    for (const operation of ["understand", "check", "create"] as const) {
      const s = snapshot(copied);
      const result = answer(s, operation);
      expect(validateProcessing(result)).toBe(true);
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(result)));
      vi.stubGlobal("fetch", fetcher);
      const options =
        operation === "understand"
          ? { operation, summaryStyle: "brief" as const }
          : { operation };
      expect(await requestGemini(s, result.instruction, options)).toEqual(
        result,
      );
      expect(JSON.parse(fetcher.mock.calls[0][1].body).snapshot).toEqual(s);
      await repo.saveRecord(result);
      expect(await repo.listRecords()).toContainEqual(result);
      fetcher.mockResolvedValue(
        new Response(
          JSON.stringify({
            ...result,
            snapshot: {
              ...s,
              origin: {
                ...s.origin,
                copy: { ...s.origin!.copy, materialVersion: 999 },
              },
            },
          }),
        ),
      );
      await expect(
        requestGemini(s, result.instruction, options),
      ).rejects.toThrow("绑定");
    }
  },
);

it("rejects malformed copy source contracts while allowing edits after the original capture", () => {
  const material = createMaterialCopy(original());
  material.text = "副本后来独立修改。";
  const result = answer(snapshot(material), "check");
  expect(validateProcessing(result)).toBe(true);
  const base = result.snapshot.origin!.copy!;
  for (const copy of [
    undefined,
    null,
    {},
    { ...base, extra: true },
    { ...base, materialId: "" },
    { ...base, materialVersion: true },
    { ...base, materialVersion: 0 },
    { ...base, start: 1 },
    { ...base, end: 0 },
    { ...base, end: 60001 },
    { ...base, source: "unsupported" },
    { ...base, title: "x".repeat(1001) },
  ])
    expect(
      validateProcessing({
        ...result,
        snapshot: {
          ...result.snapshot,
          origin: { ...result.snapshot.origin, copy },
        },
      }),
    ).toBe(false);
  for (const change of [
    { origin: undefined },
    { source: "selection_copy" },
    { source: "pdf_file" },
    { origin: { ...result.snapshot.origin, kind: "pdf_file" } },
  ])
    expect(
      validateProcessing({
        ...result,
        snapshot: { ...result.snapshot, ...change },
      }),
    ).toBe(false);
});
