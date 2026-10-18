import type { MaterialSnapshot } from "./model";
import type { Evidence } from "./check";
import { validSourceMetadata } from "./gemini-common";
export interface GeminiCheckRecord {
  id: string;
  operation: "check";
  status: "completed";
  execution: "gemini";
  schemaVersion: "gemini-check-1";
  snapshot: MaterialSnapshot;
  instruction: string;
  createdAt: string;
  outcome: "findings" | "needs_information" | "no_findings";
  findings: {
    title: string;
    explanation: string;
    suggestion: string;
    evidence: Evidence[];
  }[];
  missingInformation: string[];
  metadata: {
    modelId: string;
    promptVersion: string;
    validatorVersion: string;
    durationMs: number;
    usage?: Record<string, number>;
  };
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown, max: number) =>
  typeof x === "string" && !!x.trim() && x.length <= max;
const keys = (x: Record<string, unknown>, allowed: string[]) =>
  Object.keys(x).every((k) => allowed.includes(k));
function validSnapshot(s: Record<string, unknown>): boolean {
  if (
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
    ])
  )
    return false;
  return validSourceMetadata(s);
}
const integer = (x: unknown): x is number => Number.isSafeInteger(x);
export { sameValue } from "./gemini-common";
export function validateGemini(value: unknown): value is GeminiCheckRecord {
  try {
    if (
      !object(value) ||
      !keys(value, [
        "id",
        "operation",
        "status",
        "execution",
        "schemaVersion",
        "snapshot",
        "instruction",
        "createdAt",
        "outcome",
        "findings",
        "missingInformation",
        "metadata",
      ])
    )
      return false;
    const r = value,
      s = r.snapshot,
      m = r.metadata;
    if (
      !object(s) ||
      !validSnapshot(s) ||
      !object(m) ||
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
      r.operation !== "check" ||
      r.status !== "completed" ||
      r.execution !== "gemini" ||
      r.schemaVersion !== "gemini-check-1" ||
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
      s.end - s.start !== (s.text as string).length ||
      typeof s.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(s.capturedAt))
    )
      return false;
    if (
      typeof r.instruction !== "string" ||
      r.instruction.length > 4000 ||
      typeof r.createdAt !== "string" ||
      !Number.isFinite(Date.parse(r.createdAt))
    )
      return false;
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
    if (
      !Array.isArray(r.findings) ||
      r.findings.length > 20 ||
      !Array.isArray(r.missingInformation) ||
      r.missingInformation.length > 20 ||
      !r.missingInformation.every((x) => text(x, 4000))
    )
      return false;
    const expected = r.findings.length
      ? "findings"
      : r.missingInformation.length
        ? "needs_information"
        : "no_findings";
    if (r.outcome !== expected) return false;
    return r.findings.every(
      (f) =>
        object(f) &&
        keys(f, ["title", "explanation", "suggestion", "evidence"]) &&
        text(f.title, 300) &&
        text(f.explanation, 4000) &&
        text(f.suggestion, 4000) &&
        Array.isArray(f.evidence) &&
        f.evidence.length > 0 &&
        f.evidence.length <= 8 &&
        f.evidence.every(
          (e) =>
            object(e) &&
            keys(e, ["start", "end", "quote"]) &&
            integer(e.start) &&
            integer(e.end) &&
            e.start >= 0 &&
            e.end > e.start &&
            e.end <= (s.text as string).length &&
            text(e.quote, 2000) &&
            (s.text as string).slice(e.start, e.end) === e.quote,
        ),
    );
  } catch {
    return false;
  }
}

export const geminiHeading = (r: GeminiCheckRecord) =>
  r.outcome === "findings"
    ? "Gemini：发现待核对的疑点"
    : r.outcome === "needs_information"
      ? "Gemini：需要补充信息"
      : "Gemini：未发现明显问题";
export const GEMINI_LIMIT =
  "仅依据本次材料提出疑点和建议，不是外部事实核查或完整证明。未发现明显问题不代表材料正确；结果需由你确认，不自动修改原文。";
