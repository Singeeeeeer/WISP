import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import {
  createTextMaterial,
  fileSource,
  sourceDescription,
} from "../src/domain/cauldron";
import {
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
const formats = ["docx", "pptx", "xlsx", "pdf"] as const;
function imported(format: (typeof formats)[number]) {
  return createTextMaterial({
    title: "已编辑标题",
    text: "[第 1 页]\n😀活动时间待定。",
    source: fileSource(`原始资料.${format.toUpperCase()}`),
    file: {
      name: `原始资料.${format.toUpperCase()}`,
      size: 456,
      lastModified: 1700000000000,
    },
    note: "仅提取文字。\n请核对阅读顺序。",
  });
}
function result(s: MaterialSnapshot, operation: Operation): GeminiRecord {
  const quote = "活动时间待定";
  const start = s.text.indexOf(quote);
  const evidence = [{ start, end: start + quote.length, quote }];
  const base = {
    id: s.id,
    snapshot: s,
    instruction: "处理当前全文",
    status: "completed" as const,
    execution: "gemini" as const,
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "mock",
      promptVersion: "mock",
      validatorVersion: "mock",
      durationMs: 1,
    },
  };
  if (operation === "check")
    return {
      ...base,
      operation,
      schemaVersion: "gemini-check-1",
      outcome: "findings",
      findings: [
        {
          title: "时间待确认",
          explanation: "活动日期尚未明确。",
          suggestion: "补充日期。",
          evidence,
        },
      ],
      missingInformation: [],
    };
  if (operation === "understand")
    return {
      ...base,
      operation,
      schemaVersion: "gemini-understand-1",
      summaryStyle: "brief",
      outcome: "ready",
      summary: "活动时间尚未确定。",
      summaryEvidence: evidence,
      keyPoints: [],
      missingInformation: ["活动日期"],
    };
  return {
    ...base,
    operation,
    schemaVersion: "gemini-create-1",
    outcome: "draft",
    draft: "欢迎参加活动，日期【待确认】。",
    alternatives: [],
    sourceFacts: [{ statement: "活动时间未定。", evidence }],
    assumptions: [],
    missingInformation: ["活动日期"],
  };
}

it.each(formats)(
  "persists %s text and immutable filename/parse notes, freezing each source snapshot",
  async (format) => {
    const material = imported(format);
    expect(material.source).toBe(`${format}_file`);
    expect(material.origin).toMatchObject({
      kind: `${format}_file`,
      fileName: `原始资料.${format.toUpperCase()}`,
      byteSize: 456,
      lastModified: 1700000000000,
      note: "仅提取文字。\n请核对阅读顺序。",
    });
    expect(material.origin).not.toHaveProperty("encoding");
    expect(sourceDescription(material)).toContain(
      `${format.toUpperCase()} file`,
    );
    const frozen = snapshot(material);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.origin)).toBe(true);
    expect(frozen.origin).not.toBe(material.origin);

    const name = `import-${format}-${crypto.randomUUID()}`;
    const repo = createRepository(name);
    await repo.initialize();
    await expect(repo.createCauldronMaterial(material)).resolves.toEqual(
      material,
    );
    const edited = {
      ...material,
      title: "重命名",
      text: material.text + "\n补充说明。",
      version: 2,
    };
    await repo.saveMaterial(edited, 1);
    const reloaded = createRepository(name);
    expect(await reloaded.readMaterial(material.id)).toEqual(edited);
    expect(await reloaded.listCauldronEntries()).toHaveLength(1);
    expect(frozen).toMatchObject({
      title: "已编辑标题",
      text: "[第 1 页]\n😀活动时间待定。",
      materialVersion: 1,
    });
    expect(frozen.origin?.fileName).toBe(`原始资料.${format.toUpperCase()}`);
  },
);

it.each(
  formats.flatMap((format) =>
    (["understand", "check", "create"] as const).map((operation) => ({
      format,
      operation,
    })),
  ),
)(
  "$format supports $operation with bound source, exact UTF-16 evidence and stored result",
  async ({ format, operation }) => {
    const source = snapshot(imported(format));
    const answer = result(source, operation);
    expect(validateProcessing(answer)).toBe(true);
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(answer))),
      );
    vi.stubGlobal("fetch", fetcher);
    const options =
      operation === "understand"
        ? { operation, summaryStyle: "brief" as const }
        : { operation };
    expect(await requestGemini(source, answer.instruction, options)).toEqual(
      answer,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/${operation}`);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).snapshot).toEqual(source);
    const repo = createRepository(`import-result-${crypto.randomUUID()}`);
    await expect(repo.saveRecord(answer)).resolves.toEqual(answer);
    expect(await repo.listRecords()).toEqual([answer]);

    fetcher.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ...answer,
            snapshot: {
              ...source,
              origin: { ...source.origin, fileName: "替换的文件.pdf" },
            },
          }),
        ),
      ),
    );
    await expect(
      requestGemini(source, answer.instruction, options),
    ).rejects.toThrow(/binding|bound/);
  },
);

it("rejects mismatched extensions and malformed file metadata before creating imported materials", () => {
  const base = {
    title: "",
    text: "正文",
    source: "pdf_file" as const,
    file: { name: "notes.pdf", size: 10, lastModified: 1 },
  };
  for (const file of [
    { ...base.file, name: "notes.docx" },
    { ...base.file, size: 20_000_001 },
    { ...base.file, size: -1 },
    { ...base.file, lastModified: NaN },
    { ...base.file, lastModified: -1 },
  ])
    expect(() => createTextMaterial({ ...base, file })).toThrow();
  expect(() =>
    createTextMaterial({ ...base, text: "😀".repeat(30_001) }),
  ).toThrow("60,000");
  expect(() => createTextMaterial({ ...base, note: "x".repeat(2001) })).toThrow(
    "source note",
  );
  expect(
    createTextMaterial({
      ...base,
      text: "😀".repeat(30_000),
      note: "x".repeat(2000),
    }).text.length,
  ).toBe(60_000);
});
