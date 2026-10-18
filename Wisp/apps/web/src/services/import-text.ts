import { decodeTxt, fileSource } from "../domain/cauldron";

type FileFormat = "txt" | "docx" | "pptx" | "xlsx" | "pdf";
export type ImportedText = { text: string; warnings: string[] };

const errors: Record<string, string> = {
  IMPORT_FORMAT_UNSUPPORTED: "Only TXT, DOCX, PPTX, XLSX, and PDF files are supported.",
  IMPORT_FILE_TOO_LARGE: "A single file must not exceed 20 MB. Split the file and try again.",
  IMPORT_TEXT_TOO_LARGE:
    "Extracted text exceeds 60,000 UTF-16 units. Split the file and try again.",
  IMPORT_FILE_INVALID: "The file is corrupted or its format does not match the extension. Export it again and try again.",
  IMPORT_ENCRYPTED: "Encrypted files are not supported yet. Use a decrypted copy.",
  IMPORT_NO_TEXT: "No extractable text found. Scanned or image-only files require OCR first.",
  IMPORT_LIMIT_EXCEEDED: "File contents or page count exceed the parsing limit. Split the file and try again.",
  IMPORT_TIMEOUT: "Reading timed out and was stopped. Split the file and try again.",
  IMPORT_BUSY: "A file is already being read. Try again later.",
  IMPORT_FAILED: "Failed to read the file. Export it again and try again.",
};
const invalidResponse = "The local parser returned an invalid response; the material was not added.";

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
      throw new DOMException("File reading was stopped.", "AbortError");
    throw new Error("Local file reading was interrupted or timed out. Choose the file again and try again.");
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
