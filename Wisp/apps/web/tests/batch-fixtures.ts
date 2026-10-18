import { snapshot, seeds, type Operation } from "../src/domain/model";
import type {
  BatchRecord,
  BatchUnderstandRecord,
  BatchDraft,
} from "../src/domain/batch";
export function batchResult(operation: "understand"): BatchUnderstandRecord;
export function batchResult(operation?: Operation): BatchRecord;
export function batchResult(operation: Operation = "understand"): BatchRecord {
  const snapshots = seeds().map((m, i) =>
    snapshot({ ...m, text: i ? "容量40人，时间待定。" : "😀日期为11月8日。" }),
  );
  const evidence = [
    { sourceIndex: 1, start: 2, end: 10, quote: "日期为11月8日" },
    { sourceIndex: 2, start: 0, end: 5, quote: "容量40人" },
  ];
  const common = {
    id: crypto.randomUUID(),
    scope: "batch" as const,
    snapshots,
    status: "completed" as const,
    execution: "gemini" as const,
    instruction: "综合材料",
    createdAt: new Date().toISOString(),
    metadata: {
      modelId: "mock",
      promptVersion: "batch-1",
      validatorVersion: "batch-1",
      durationMs: 1,
    },
    missingInformation: ["请确认时间"],
  };
  if (operation === "check")
    return {
      ...common,
      operation,
      schemaVersion: "gemini-batch-check-1",
      outcome: "findings",
      findings: [
        {
          title: "需确认",
          explanation: "两份材料应一起核对",
          suggestion: "确认日期与人数",
          evidence,
        },
      ],
    };
  if (operation === "create")
    return {
      ...common,
      operation,
      schemaVersion: "gemini-batch-create-1",
      outcome: "draft",
      draft: "欢迎参加11月8日的40人活动。",
      alternatives: [],
      sourceFacts: [{ statement: "日期与人数来自两份材料", evidence }],
      assumptions: [],
    };
  return {
    ...common,
    operation,
    schemaVersion: "gemini-batch-understand-1",
    summaryStyle: "standard",
    outcome: "ready",
    summary: "活动日期已给出，最多40人。",
    summaryEvidence: evidence,
    keyPoints: [],
  };
}
export function batchDraft(r = batchResult()): BatchDraft {
  return {
    id: r.id,
    entry: "summon",
    snapshots: r.snapshots,
    instruction: r.instruction,
    familiar:
      r.operation === "check"
        ? "scout_bat"
        : r.operation === "create"
          ? "alchemy_imp"
          : "page_sprite",
    ...(r.operation === "understand" ? { summaryStyle: r.summaryStyle } : {}),
  };
}
