import type { MaterialSnapshot } from "./model";
import type { Evidence } from "./check";
export interface GeminiMetadata {
  modelId: string;
  promptVersion: string;
  validatorVersion: string;
  durationMs: number;
  usage?: Record<string, number>;
}
export interface GeminiBase {
  id: string;
  status: "completed";
  execution: "gemini";
  snapshot: MaterialSnapshot;
  instruction: string;
  createdAt: string;
  metadata: GeminiMetadata;
}
export const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
export const text = (x: unknown, max: number): x is string =>
  typeof x === "string" && !!x.trim() && x.length <= max;
export const keys = (x: Record<string, unknown>, allowed: string[]) =>
  Object.keys(x).every((k) => allowed.includes(k));
export const integer = (x: unknown): x is number => Number.isSafeInteger(x);
const optionalString = (x: unknown, max: number) =>
  x === undefined || (typeof x === "string" && x.length <= max);
const materialSources = [
  "virtual_document",
  "new_text",
  "pasted_text",
  "txt_file",
  "docx_file",
  "pptx_file",
  "xlsx_file",
  "pdf_file",
  "document_copy",
  "selection_copy",
];
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined),
    kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return (
    ka.length === kb.length &&
    ka.every((k) => kb.includes(k) && sameValue(a[k], b[k]))
  );
}
export function validSourceMetadata(s: Record<string, unknown>): boolean {
  if (s.source !== undefined && !materialSources.includes(s.source as string))
    return false;
  if (s.origin !== undefined) {
    const o = s.origin;
    if (
      !object(o) ||
      !keys(o, [
        "kind",
        "addedAt",
        "note",
        "fileName",
        "byteSize",
        "lastModified",
        "encoding",
        "copy",
      ]) ||
      o.kind === "virtual_document" ||
      !materialSources.includes(o.kind as string) ||
      typeof o.addedAt !== "string" ||
      !Number.isFinite(Date.parse(o.addedAt)) ||
      !optionalString(o.note, 2000) ||
      !optionalString(o.fileName, 1000) ||
      (o.encoding !== undefined && o.encoding !== "UTF-8") ||
      ["byteSize", "lastModified"].some(
        (k) => o[k] !== undefined && (!integer(o[k]) || (o[k] as number) < 0),
      )
    )
      return false;
    const isCopy = o.kind === "document_copy" || o.kind === "selection_copy";
    const c = o.copy;
    if (isCopy) {
      if (
        !object(c) ||
        !keys(c, [
          "materialId",
          "materialVersion",
          "title",
          "start",
          "end",
          "source",
        ]) ||
        !text(c.materialId, 200) ||
        !integer(c.materialVersion) ||
        c.materialVersion < 1 ||
        typeof c.title !== "string" ||
        c.title.length > 1000 ||
        !integer(c.start) ||
        !integer(c.end) ||
        c.start < 0 ||
        c.end <= c.start ||
        c.end - c.start > 60000 ||
        (o.kind === "document_copy" && c.start !== 0) ||
        !materialSources.includes(c.source as string) ||
        (s.source !== undefined && s.source !== o.kind)
      )
        return false;
    } else if (c !== undefined) return false;
  }
  if (
    (s.source === "document_copy" || s.source === "selection_copy") &&
    (!object(s.origin) || s.origin.kind !== s.source)
  )
    return false;
  return true;
}
export function validEnvelope(r: Record<string, unknown>): boolean {
  const s = r.snapshot,
    m = r.metadata;
  if (
    !object(s) ||
    !object(m) ||
    !keys(s, [
      "id",
      "materialId",
      "materialVersion",
      "title",
      "text",
      "start",
      "end",
      "capturedAt",
      "source",
      "origin",
    ]) ||
    !keys(m, [
      "modelId",
      "promptVersion",
      "validatorVersion",
      "durationMs",
      "usage",
    ])
  )
    return false;
  if (
    r.status !== "completed" ||
    r.execution !== "gemini" ||
    r.id !== s.id ||
    !text(s.id, 200) ||
    !text(s.materialId, 200) ||
    typeof s.title !== "string" ||
    s.title.length > 1000 ||
    !integer(s.materialVersion) ||
    s.materialVersion < 1 ||
    !text(s.text, 60000) ||
    !integer(s.start) ||
    !integer(s.end) ||
    s.start < 0 ||
    s.end - s.start !== s.text.length ||
    typeof s.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(s.capturedAt)) ||
    typeof r.instruction !== "string" ||
    r.instruction.length > 4000 ||
    typeof r.createdAt !== "string" ||
    !Number.isFinite(Date.parse(r.createdAt))
  )
    return false;
  if (!validSourceMetadata(s)) return false;
  if (
    !text(m.modelId, 200) ||
    !text(m.promptVersion, 100) ||
    !text(m.validatorVersion, 100) ||
    typeof m.durationMs !== "number" ||
    !Number.isFinite(m.durationMs) ||
    m.durationMs < 0
  )
    return false;
  if (
    m.usage !== undefined &&
    (!object(m.usage) ||
      !keys(m.usage, [
        "total_input_tokens",
        "total_output_tokens",
        "total_thought_tokens",
        "total_cached_tokens",
        "total_tool_use_tokens",
        "total_tokens",
      ]) ||
      !Object.values(m.usage).every((n) => integer(n) && n >= 0))
  )
    return false;
  return true;
}
export function validEvidence(
  value: unknown,
  source: string,
  min: number,
  max: number,
): value is Evidence[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every(
      (e) =>
        object(e) &&
        keys(e, ["start", "end", "quote"]) &&
        integer(e.start) &&
        integer(e.end) &&
        e.start >= 0 &&
        e.end > e.start &&
        e.end <= source.length &&
        text(e.quote, 2000) &&
        source.slice(e.start, e.end) === e.quote &&
        !(
          e.start > 0 &&
          /[\uD800-\uDBFF]/.test(source[e.start - 1]) &&
          /[\uDC00-\uDFFF]/.test(source[e.start])
        ) &&
        !(
          e.end < source.length &&
          /[\uD800-\uDBFF]/.test(source[e.end - 1]) &&
          /[\uDC00-\uDFFF]/.test(source[e.end])
        ),
    )
  );
}
