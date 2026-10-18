import type { Evidence } from "./check";
import {
  object,
  text,
  keys,
  validEnvelope,
  validEvidence,
  type GeminiBase,
} from "./gemini-common";
export type SummaryStyle = "brief" | "standard";
export interface GeminiUnderstandRecord extends GeminiBase {
  operation: "understand";
  schemaVersion: "gemini-understand-1";
  summaryStyle: SummaryStyle;
  outcome: "ready" | "needs_information";
  summary: string;
  summaryEvidence: Evidence[];
  keyPoints: { title: string; explanation: string; evidence: Evidence[] }[];
  missingInformation: string[];
}
export interface GeminiCreateRecord extends GeminiBase {
  operation: "create";
  schemaVersion: "gemini-create-1";
  outcome: "draft" | "needs_information";
  draft: string;
  alternatives: { title: string; description: string }[];
  sourceFacts: { statement: string; evidence: Evidence[] }[];
  assumptions: string[];
  missingInformation: string[];
}
export type GeminiTextRecord = GeminiUnderstandRecord | GeminiCreateRecord;
const baseKeys = [
  "id",
  "operation",
  "status",
  "execution",
  "schemaVersion",
  "snapshot",
  "instruction",
  "createdAt",
  "outcome",
  "metadata",
  "missingInformation",
];
const strings = (
  v: unknown,
  maxItems: number,
  maxLength: number,
): v is string[] =>
  Array.isArray(v) &&
  v.length <= maxItems &&
  v.every((x) => text(x, maxLength));
function textSize(v: unknown): number {
  if (typeof v === "string") return v.length;
  if (Array.isArray(v)) return v.reduce((n, x) => n + textSize(x), 0);
  if (object(v))
    return Object.values(v).reduce<number>((n, x) => n + textSize(x), 0);
  return 0;
}
export function validateGeminiText(value: unknown): value is GeminiTextRecord {
  try {
    if (
      !object(value) ||
      !validEnvelope(value) ||
      !strings(value.missingInformation, 10, 2000)
    )
      return false;
    const r = value,
      source = (r.snapshot as { text: string }).text;
    if (r.operation === "understand") {
      if (
        !keys(r, [
          ...baseKeys,
          "summaryStyle",
          "summary",
          "summaryEvidence",
          "keyPoints",
        ]) ||
        r.schemaVersion !== "gemini-understand-1" ||
        !["brief", "standard"].includes(r.summaryStyle as string) ||
        typeof r.summary !== "string" ||
        !Array.isArray(r.keyPoints) ||
        r.keyPoints.length > (r.summaryStyle === "brief" ? 3 : 8)
      )
        return false;
      if (r.summary === "") {
        if (
          r.outcome !== "needs_information" ||
          !validEvidence(r.summaryEvidence, source, 0, 0) ||
          r.keyPoints.length ||
          !value.missingInformation.length
        )
          return false;
      } else if (
        r.outcome !== "ready" ||
        !text(r.summary, r.summaryStyle === "brief" ? 1200 : 4000) ||
        !validEvidence(r.summaryEvidence, source, 1, 8)
      )
        return false;
      if (
        !r.keyPoints.every(
          (p) =>
            object(p) &&
            keys(p, ["title", "explanation", "evidence"]) &&
            text(p.title, 200) &&
            text(p.explanation, 2000) &&
            validEvidence(p.evidence, source, 1, 4),
        )
      )
        return false;
      return (
        textSize([
          r.summary,
          r.summaryEvidence,
          r.keyPoints,
          r.missingInformation,
        ]) <= 60000
      );
    }
    if (r.operation === "create") {
      if (
        !keys(r, [
          ...baseKeys,
          "draft",
          "alternatives",
          "sourceFacts",
          "assumptions",
        ]) ||
        r.schemaVersion !== "gemini-create-1" ||
        typeof r.draft !== "string" ||
        !Array.isArray(r.alternatives) ||
        r.alternatives.length > 2 ||
        !Array.isArray(r.sourceFacts) ||
        r.sourceFacts.length > 12 ||
        !strings(r.assumptions, 10, 2000)
      )
        return false;
      if (r.draft === "") {
        if (
          r.outcome !== "needs_information" ||
          r.alternatives.length ||
          !value.missingInformation.length
        )
          return false;
      } else if (r.outcome !== "draft" || !text(r.draft, 12000)) return false;
      if (
        !r.alternatives.every(
          (a) =>
            object(a) &&
            keys(a, ["title", "description"]) &&
            text(a.title, 200) &&
            text(a.description, 4000),
        ) ||
        !r.sourceFacts.every(
          (f) =>
            object(f) &&
            keys(f, ["statement", "evidence"]) &&
            text(f.statement, 1000) &&
            validEvidence(f.evidence, source, 1, 4),
        )
      )
        return false;
      return (
        textSize([
          r.draft,
          r.alternatives,
          r.sourceFacts,
          r.assumptions,
          r.missingInformation,
        ]) <= 60000
      );
    }
    return false;
  } catch {
    return false;
  }
}
export const geminiTextHeading = (r: GeminiTextRecord) =>
  r.outcome === "needs_information"
    ? "Gemini：需要补充信息"
    : r.operation === "understand"
      ? "Gemini：材料摘要"
      : "Gemini：创作草稿";
export const GEMINI_TEXT_LIMIT =
  "仅依据本次材料生成，引用只证明文字来自原文，不保证概括或草稿正确。请核对依据、假设和待补充信息；不自动修改原文。";
