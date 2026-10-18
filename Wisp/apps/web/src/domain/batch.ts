import type {
  Familiar,
  MaterialSnapshot,
  Operation,
  SummaryStyle,
} from "./model";
import type { Evidence } from "./check";
import {
  integer,
  keys,
  object,
  text,
  validEnvelope,
  validEvidence,
  type GeminiMetadata,
} from "./gemini-common";

export const BATCH_MAX_MATERIALS = 12;
export const BATCH_MAX_UNITS = 60000;
export interface BatchDraft {
  id: string;
  snapshots: MaterialSnapshot[];
  entry: Operation | "summon";
  instruction: string;
  familiar: Familiar;
  summaryStyle?: SummaryStyle;
  fromResult?: boolean;
}
export interface BatchEvidence extends Evidence {
  sourceIndex: number;
}
interface BatchBase {
  id: string;
  scope: "batch";
  status: "completed";
  execution: "gemini";
  snapshots: MaterialSnapshot[];
  instruction: string;
  createdAt: string;
  metadata: GeminiMetadata;
  missingInformation: string[];
}
export interface BatchUnderstandRecord extends BatchBase {
  operation: "understand";
  schemaVersion: "gemini-batch-understand-1";
  summaryStyle: SummaryStyle;
  outcome: "ready" | "needs_information";
  summary: string;
  summaryEvidence: BatchEvidence[];
  keyPoints: {
    title: string;
    explanation: string;
    evidence: BatchEvidence[];
  }[];
}
export interface BatchCheckRecord extends BatchBase {
  operation: "check";
  schemaVersion: "gemini-batch-check-1";
  outcome: "findings" | "needs_information" | "no_findings";
  findings: {
    title: string;
    explanation: string;
    suggestion: string;
    evidence: BatchEvidence[];
  }[];
}
export interface BatchCreateRecord extends BatchBase {
  operation: "create";
  schemaVersion: "gemini-batch-create-1";
  outcome: "draft" | "needs_information";
  draft: string;
  alternatives: { title: string; description: string }[];
  sourceFacts: { statement: string; evidence: BatchEvidence[] }[];
  assumptions: string[];
}
export type BatchRecord =
  BatchUnderstandRecord | BatchCheckRecord | BatchCreateRecord;
export const isBatchRecord = (r: unknown): r is BatchRecord =>
  object(r) && r.scope === "batch";
export function sliceBatchSnapshot(
  source: MaterialSnapshot,
  start: number,
  end: number,
): MaterialSnapshot {
  const boundary = (p: number) =>
    !(
      p > 0 &&
      p < source.text.length &&
      /[\uD800-\uDBFF]/.test(source.text[p - 1]) &&
      /[\uDC00-\uDFFF]/.test(source.text[p])
    );
  if (
    !integer(start) ||
    !integer(end) ||
    start < 0 ||
    end <= start ||
    end > source.text.length ||
    !boundary(start) ||
    !boundary(end) ||
    !source.text.slice(start, end).trim()
  )
    throw new Error("Invalid selection: choose a non-empty range of complete characters.");
  return {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    text: source.text.slice(start, end),
    start: source.start + start,
    end: source.start + end,
  };
}

// Keep every source independent and use the same source/provenance validation
// as single-material Gemini envelopes. No synthetic combined document is made.
export function validBatchSnapshots(
  value: unknown,
): value is MaterialSnapshot[] {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > BATCH_MAX_MATERIALS
  )
    return false;
  const envelope = {
    status: "completed",
    execution: "gemini",
    instruction: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: {
      modelId: "validation",
      promptVersion: "1",
      validatorVersion: "1",
      durationMs: 0,
    },
  };
  return (
    value.every(
      (s) => object(s) && validEnvelope({ ...envelope, id: s.id, snapshot: s }),
    ) &&
    new Set(value.map((s) => s.id)).size === value.length &&
    new Set(value.map((s) => s.materialId)).size === value.length &&
    value.reduce((total, s) => total + s.text.length, 0) <= BATCH_MAX_UNITS
  );
}
export function validBatchEvidence(
  value: unknown,
  sources: MaterialSnapshot[],
  min: number,
  max: number,
): value is BatchEvidence[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((e) => {
      if (
        !object(e) ||
        !keys(e, ["sourceIndex", "start", "end", "quote"]) ||
        !integer(e.sourceIndex) ||
        e.sourceIndex < 1 ||
        e.sourceIndex > sources.length
      )
        return false;
      const { sourceIndex, ...range } = e;
      return validEvidence([range], sources[sourceIndex - 1].text, 1, 1);
    })
  );
}
const baseKeys = [
  "id",
  "scope",
  "operation",
  "status",
  "execution",
  "schemaVersion",
  "snapshots",
  "instruction",
  "createdAt",
  "outcome",
  "metadata",
  "missingInformation",
];
const strings = (v: unknown, count: number, length: number): v is string[] =>
  Array.isArray(v) && v.length <= count && v.every((x) => text(x, length));
function textSize(v: unknown): number {
  if (typeof v === "string") return v.length;
  if (Array.isArray(v)) return v.reduce((n, x) => n + textSize(x), 0);
  if (object(v))
    return Object.values(v).reduce<number>((n, x) => n + textSize(x), 0);
  return 0;
}
export function validateBatch(value: unknown): value is BatchRecord {
  try {
    if (
      !object(value) ||
      value.scope !== "batch" ||
      !text(value.id, 200) ||
      !validBatchSnapshots(value.snapshots)
    )
      return false;
    const r = value,
      sources = value.snapshots;
    if (!sources.every((s) => validEnvelope({ ...r, id: s.id, snapshot: s })))
      return false;
    const evidence = (v: unknown, min: number, max: number) =>
      validBatchEvidence(v, sources, min, max);
    if (r.operation === "check") {
      if (
        !keys(r, [...baseKeys, "findings"]) ||
        r.schemaVersion !== "gemini-batch-check-1" ||
        !Array.isArray(r.findings) ||
        r.findings.length > 20 ||
        !strings(r.missingInformation, 20, 4000)
      )
        return false;
      const outcome = r.findings.length
        ? "findings"
        : r.missingInformation.length
          ? "needs_information"
          : "no_findings";
      return (
        r.outcome === outcome &&
        r.findings.every(
          (f) =>
            object(f) &&
            keys(f, ["title", "explanation", "suggestion", "evidence"]) &&
            text(f.title, 300) &&
            text(f.explanation, 4000) &&
            text(f.suggestion, 4000) &&
            evidence(f.evidence, 1, 8),
        ) &&
        textSize([r.findings, r.missingInformation]) <= BATCH_MAX_UNITS
      );
    }
    if (!strings(r.missingInformation, 10, 2000)) return false;
    if (r.operation === "understand") {
      if (
        !keys(r, [
          ...baseKeys,
          "summaryStyle",
          "summary",
          "summaryEvidence",
          "keyPoints",
        ]) ||
        r.schemaVersion !== "gemini-batch-understand-1" ||
        !["brief", "standard"].includes(r.summaryStyle as string) ||
        typeof r.summary !== "string" ||
        !Array.isArray(r.keyPoints) ||
        r.keyPoints.length > (r.summaryStyle === "brief" ? 3 : 8)
      )
        return false;
      if (r.summary === "") {
        if (
          r.outcome !== "needs_information" ||
          !evidence(r.summaryEvidence, 0, 0) ||
          r.keyPoints.length ||
          !r.missingInformation.length
        )
          return false;
      } else if (
        r.outcome !== "ready" ||
        !text(r.summary, r.summaryStyle === "brief" ? 1200 : 4000) ||
        !evidence(r.summaryEvidence, 1, 8)
      )
        return false;
      return (
        r.keyPoints.every(
          (p) =>
            object(p) &&
            keys(p, ["title", "explanation", "evidence"]) &&
            text(p.title, 200) &&
            text(p.explanation, 2000) &&
            evidence(p.evidence, 1, 4),
        ) &&
        textSize([
          r.summary,
          r.summaryEvidence,
          r.keyPoints,
          r.missingInformation,
        ]) <= BATCH_MAX_UNITS
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
        r.schemaVersion !== "gemini-batch-create-1" ||
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
          !r.missingInformation.length
        )
          return false;
      } else if (r.outcome !== "draft" || !text(r.draft, 12000)) return false;
      return (
        r.alternatives.every(
          (a) =>
            object(a) &&
            keys(a, ["title", "description"]) &&
            text(a.title, 200) &&
            text(a.description, 4000),
        ) &&
        r.sourceFacts.every(
          (f) =>
            object(f) &&
            keys(f, ["statement", "evidence"]) &&
            text(f.statement, 1000) &&
            evidence(f.evidence, 1, 4),
        ) &&
        textSize([
          r.draft,
          r.alternatives,
          r.sourceFacts,
          r.assumptions,
          r.missingInformation,
        ]) <= BATCH_MAX_UNITS
      );
    }
    return false;
  } catch {
    return false;
  }
}
export function batchContinuationDraft(r: BatchRecord): BatchDraft {
  if (!validateBatch(r)) throw new Error("The multi-material result is invalid and cannot be delegated.");
  return {
    id: crypto.randomUUID(),
    entry: "summon",
    snapshots: structuredClone(r.snapshots).map((s) => ({
      ...s,
      id: crypto.randomUUID(),
    })),
    instruction: r.instruction,
    familiar:
      r.operation === "check"
        ? "scout_bat"
        : r.operation === "create"
          ? "alchemy_imp"
          : "page_sprite",
    ...(r.operation === "understand" ? { summaryStyle: r.summaryStyle } : {}),
    fromResult: true,
  };
}
