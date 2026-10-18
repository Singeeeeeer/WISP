import { it, expect } from "vitest";
import {
  createTextMaterial,
  decodeTxt,
  normalizeText,
  sourceDescription,
} from "../src/domain/cauldron";
import { seeds, snapshot } from "../src/domain/model";
const encode = (s: string) => new TextEncoder().encode(s);
it("normalizes line endings without trimming and decodes strict UTF-8 with BOM", () => {
  expect(normalizeText(" a\r\nb\rc ")).toBe(" a\nb\nc ");
  expect(decodeTxt("材料.TXT", encode("\uFEFF 你好😀\r\n "))).toBe(
    " 你好😀\n ",
  );
  expect(() => decodeTxt("bad.txt", new Uint8Array([0xff]))).toThrow(/UTF-8/);
  expect(() => decodeTxt("bad.md", encode("x"))).toThrow(/txt/i);
  expect(() => decodeTxt("bad.txt", encode("x\0"))).toThrow();
  expect(() => decodeTxt("bad.txt", encode(" \n"))).toThrow();
});
it("enforces import byte and UTF-16 limits", () => {
  expect(decodeTxt("x.txt", encode("😀".repeat(30000)))).toHaveLength(60000);
  expect(() => decodeTxt("x.txt", encode("😀".repeat(30000) + "a"))).toThrow(
    /60,000/,
  );
  expect(() => decodeTxt("x.txt", new Uint8Array(20000001))).toThrow(/20/);
  expect(() => decodeTxt("x.txt", new Uint8Array(20000000).fill(97))).toThrow(
    /60,000/,
  );
});
it("creates source metadata and permits an empty new material", () => {
  const empty = createTextMaterial({ title: "", text: "", source: "new_text" });
  expect(empty.title).toBe("Untitled material");
  expect(empty.version).toBe(1);
  expect(empty.origin?.addedAt).toBe(empty.createdAt);
  expect(() =>
    createTextMaterial({ title: "", text: " ", source: "pasted_text" }),
  ).toThrow();
  const m = createTextMaterial({
    id: "fixed",
    title: "",
    text: " x\r\ny ",
    source: "txt_file",
    note: "出处",
    file: { name: "sample.txt", size: 8, lastModified: 123 },
  });
  expect(m).toMatchObject({
    id: "fixed",
    title: "sample.txt",
    text: " x\ny ",
    origin: {
      kind: "txt_file",
      note: "出处",
      fileName: "sample.txt",
      byteSize: 8,
      lastModified: 123,
      encoding: "UTF-8",
    },
  });
  expect(sourceDescription(m)).toContain("sample.txt");
  const long = createTextMaterial({
    title: "a".repeat(119) + "😀",
    text: "",
    source: "new_text",
  });
  expect(long.title).toBe("a".repeat(119));
});
it("freezes an independent origin in snapshots without inventing old provenance", () => {
  const m = createTextMaterial({
    title: "t",
    text: "正文",
    source: "pasted_text",
    note: "原始",
  });
  const s = snapshot(m);
  m.origin!.note = "changed";
  expect(s.origin?.note).toBe("原始");
  expect(Object.isFrozen(s.origin)).toBe(true);
  expect(s.source).toBe("pasted_text");
  expect(snapshot(seeds()[0]).origin).toBeUndefined();
  expect(sourceDescription({})).toBe("History does not include detailed source information");
  expect(sourceDescription({ source: "virtual_document" })).toBe("Local document");
});
