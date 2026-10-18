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
  if (!format) throw new Error("仅支持 TXT、DOCX、PPTX、XLSX 和 PDF 文件。");
  return `${format}_file` as FileSource;
}
export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
function validateText(text: string, allowEmpty: boolean) {
  if (text.includes("\0")) throw new Error("文本包含 NUL 字符，无法导入。");
  if (text.length > MAX_TEXT)
    throw new Error("文本最多 60,000 个 UTF-16 单元。");
  if (!allowEmpty && !text.trim()) throw new Error("请提供非空文本。");
}
export function decodeTxt(fileName: string, bytes: Uint8Array): string {
  if (!/\.txt$/i.test(fileName)) throw new Error("仅支持 .txt 文件。");
  if (bytes.byteLength > MAX_BYTES) throw new Error("单个文件不能超过 20 MB。");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("文件不是有效的 UTF-8，请转换编码后重试。");
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
    throw new Error("来源说明过长，未保存。");
  if (input.note?.trim()) origin.note = input.note.trim();
  if (input.source.endsWith("_file")) {
    const file = input.file;
    if (
      !file ||
      file.name.length > 1000 ||
      fileSource(file.name) !== input.source
    )
      throw new Error("文件来源与格式不匹配。");
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > MAX_BYTES
    )
      throw new Error("单个文件不能超过 20 MB。");
    if (!Number.isSafeInteger(file.lastModified) || file.lastModified < 0)
      throw new Error("文件修改时间无效。");
    Object.assign(origin, {
      fileName: file.name,
      byteSize: file.size,
      lastModified: file.lastModified,
      ...(input.source === "txt_file" ? { encoding: "UTF-8" } : {}),
    });
  }
  let title = (input.title.trim() || input.file?.name || "未命名材料").slice(
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
  const label = kind?.endsWith("_file")
    ? kind.replace("_file", "").toUpperCase() +
      " 文件" +
      (origin?.fileName ? " · " + origin.fileName : "")
    : kind === "new_text"
      ? "新建文本"
      : kind === "pasted_text"
        ? "粘贴文本"
        : kind === "virtual_document"
          ? "本地文档"
          : "历史记录未保存详细来源";
  return label + (origin?.note ? " · " + origin.note : "");
}
