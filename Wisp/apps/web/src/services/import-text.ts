import { decodeTxt, fileSource } from "../domain/cauldron";

type FileFormat = "txt" | "docx" | "pptx" | "xlsx" | "pdf";
export type ImportedText = { text: string; warnings: string[] };

const errors: Record<string, string> = {
  IMPORT_FORMAT_UNSUPPORTED: "仅支持 TXT、DOCX、PPTX、XLSX 和 PDF 文件。",
  IMPORT_FILE_TOO_LARGE: "单个文件不能超过 20 MB，请拆分文件后重试。",
  IMPORT_TEXT_TOO_LARGE:
    "提取文字超过 60,000 个 UTF-16 单元，请拆分文件后重试。",
  IMPORT_FILE_INVALID: "文件损坏或格式不匹配，请检查文件后重试。",
  IMPORT_ENCRYPTED: "暂不支持加密文件，请先解密并另存副本后重试。",
  IMPORT_NO_TEXT: "未找到可导入的文字；PDF 仅提取文字层，不含 OCR。",
  IMPORT_LIMIT_EXCEEDED: "文件内容超过读取上限，请拆分文件后重试。",
  IMPORT_TIMEOUT: "文件读取超时，请拆分文件后重试。",
  IMPORT_BUSY: "本机解析服务正忙，请稍后重试。",
  IMPORT_FAILED: "文件文字读取失败，请检查文件后重试。",
};
const invalidResponse = "本机解析服务返回无效响应，未加入材料。";

function validateResult(value: unknown, format: FileFormat): ImportedText {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(invalidResponse);
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).sort().join(",") !==
      "format,schemaVersion,text,warnings" ||
    result.schemaVersion !== "import-text-1" ||
    result.format !== format ||
    typeof result.text !== "string" ||
    !result.text.trim() ||
    result.text.length > 60_000 ||
    /[\r\0]/.test(result.text) ||
    !Array.isArray(result.warnings) ||
    result.warnings.length > 10 ||
    result.warnings.some(
      (warning: unknown) =>
        typeof warning !== "string" ||
        !warning.trim() ||
        warning.length > 200 ||
        /[\r\0]/.test(warning),
    ) ||
    result.warnings.join("\n").length > 2000
  )
    throw new Error(invalidResponse);
  return { text: result.text, warnings: result.warnings as string[] };
}

/** Only complex formats use the local parser; neither path calls a model. */
export async function readFileText(
  file: File,
  signal: AbortSignal,
): Promise<ImportedText> {
  signal.throwIfAborted();
  const format = fileSource(file.name).replace(/_file$/, "") as FileFormat;
  if (file.size > 20_000_000) throw new Error(errors.IMPORT_FILE_TOO_LARGE);
  if (format === "txt") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal.throwIfAborted();
    return { text: decodeTxt(file.name, bytes), warnings: [] };
  }

  let response: Response;
  let raw: string;
  try {
    response = await fetch(`/api/import-text?format=${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
      signal: AbortSignal.any([signal, AbortSignal.timeout(65_000)]),
    });
    raw = await response.text();
    signal.throwIfAborted();
  } catch {
    if (signal.aborted)
      throw new DOMException("已停止读取文件。", "AbortError");
    throw new Error("本机文件读取中断或超时，请重新选择文件后重试。");
  }
  let data: unknown;
  try {
    if (raw.length > 512_000) throw new Error();
    data = JSON.parse(raw);
  } catch {
    throw new Error(invalidResponse);
  }
  if (!response.ok) {
    const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
    throw new Error(
      (typeof code === "string" &&
        Object.hasOwn(errors, code) &&
        errors[code]) ||
        errors.IMPORT_FAILED,
    );
  }
  return validateResult(data, format);
}
