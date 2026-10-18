import type { FileSource, Material, MaterialOrigin } from "./model";
export interface CauldronEntry {
  materialId: string;
  addedAt: string;
}
const MAX_BYTES = 20_000_000;
const MAX_TEXT = 60_000;
export function fileSource(fileName: string): FileSource {
  const format = /\.(txt|docx|pptx|xlsx|pdf)$/i
    .exec(fileName)?.[1]
    .toLowerCase();
  if (!format) throw new Error("Only TXT, DOCX, PPTX, XLSX, and PDF files are supported.");
  return `${format}_file` as FileSource;
}
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
function validateText(text: string, allowEmpty: boolean) {
  if (text.includes("\0")) throw new Error("The text contains a NUL character and cannot be imported.");
  if (text.length > MAX_TEXT)
    throw new Error("Text is limited to 60,000 UTF-16 code units.");
  if (!allowEmpty && !text.trim()) throw new Error("Provide non-empty text.");
}
export function decodeTxt(fileName: string, bytes: Uint8Array): string {
  if (!/\.txt$/i.test(fileName)) throw new Error("Only .txt files are supported.");
  if (bytes.byteLength > MAX_BYTES) throw new Error("A single file cannot exceed 20 MB.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The file is not valid UTF-8. Convert its encoding and try again.");
  }
  text = normalizeText(text);
  validateText(text, false);
  return text;
}
export function createTextMaterial(input: {
  id?: string;
  title: string;
  text: string;
  source: "new_text" | "pasted_text" | FileSource;
  note?: string;
  file?: { name: string; size: number; lastModified: number };
}): Material {
  const text = normalizeText(input.text);
  validateText(text, input.source === "new_text");
  const now = new Date().toISOString();
  const origin: MaterialOrigin = { kind: input.source, addedAt: now };
  if ((input.note?.length ?? 0) > 2000)
    throw new Error("The source note is too long and was not saved.");
  if (input.note?.trim()) origin.note = input.note.trim();
  if (input.source.endsWith("_file")) {
    const file = input.file;
    if (
      !file ||
      file.name.length > 1000 ||
      fileSource(file.name) !== input.source
    )
      throw new Error("The file source and format do not match.");
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > MAX_BYTES
    )
      throw new Error("A single file cannot exceed 20 MB.");
    if (!Number.isSafeInteger(file.lastModified) || file.lastModified < 0)
      throw new Error("The file modification time is invalid.");
    Object.assign(origin, {
      fileName: file.name,
      byteSize: file.size,
      lastModified: file.lastModified,
      ...(input.source === "txt_file" ? { encoding: "UTF-8" } : {}),
    });
  }
  let title = (input.title.trim() || input.file?.name || "Untitled material").slice(
    0,
    120,
  );
  if (/[\uD800-\uDBFF]$/.test(title)) title = title.slice(0, -1);
  return {
    id: input.id ?? crypto.randomUUID(),
    kind: "text",
    title,
    text,
    version: 1,
    source: input.source,
    createdAt: now,
    updatedAt: now,
    origin,
  };
}
export function sourceDescription(value: {
  source?: Material["source"];
  origin?: Material["origin"];
}): string {
  const origin = value.origin;
  const kind = origin?.kind ?? value.source;
  if (kind === "document_copy" || kind === "selection_copy") {
    const copy = origin?.copy;
    return (
      (kind === "document_copy" ? "Full-text copy" : "Selection copy") +
      (copy ? ` · ${copy.title} · v${copy.materialVersion}` : "") +
      (origin?.fileName ? " · Original file: " + origin.fileName : "") +
      (origin?.note ? " · " + origin.note : "")
    );
  }
  const label = kind?.endsWith("_file")
    ? kind.replace("_file", "").toUpperCase() +
      " file" +
      (origin?.fileName ? " · " + origin.fileName : "")
    : kind === "new_text"
      ? "New text"
      : kind === "pasted_text"
        ? "Pasted text"
        : kind === "virtual_document"
          ? "Local document"
          : "History does not include detailed source information";
  return label + (origin?.note ? " · " + origin.note : "");
}
