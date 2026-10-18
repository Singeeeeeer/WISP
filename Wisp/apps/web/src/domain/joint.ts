import type { ProcessingRecord } from "./processing";
import { runText, validateText, type TextRecord } from "./local-text";
import type { ExcerptLimit, MaterialSnapshot } from "./model";
export interface JointDraft {
  id: string;
  snapshots: [MaterialSnapshot, MaterialSnapshot];
  excerptLimit: ExcerptLimit;
}
export interface JointRecord {
  id: string;
  operation: "joint";
  status: "completed";
  execution: "local_joint_extract";
  ruleVersion: "joint-1";
  createdAt: string;
  excerptLimit: ExcerptLimit;
  sources: [TextRecord, TextRecord];
}
export type StoredRecord = ProcessingRecord | JointRecord;
export const jointLimit =
  "两份文本分别按原文顺序摘录，保留各自来源；不合并事实、不推断联系，不是综合摘要。每份独立采用所选行数。";
function validSources(s: MaterialSnapshot[]) {
  return (
    s.length === 2 &&
    s[0].materialId !== s[1].materialId &&
    s[0].id !== s[1].id &&
    s.every(
      (x) =>
        x.start === 0 &&
        x.end === x.text.length &&
        !!x.text.trim() &&
        x.text.length <= 60000,
    )
  );
}
export function runJoint(d: JointDraft): JointRecord {
  if (!validSources(d.snapshots))
    throw new Error(
      "需要两份不同的非空文本全文，每份不超过 60,000 个 UTF-16 单元。",
    );
  return {
    id: d.id,
    operation: "joint",
    status: "completed",
    execution: "local_joint_extract",
    ruleVersion: "joint-1",
    createdAt: new Date().toISOString(),
    excerptLimit: d.excerptLimit,
    sources: d.snapshots.map((s) =>
      runText("understand", s, "", d.excerptLimit),
    ) as [TextRecord, TextRecord],
  };
}
export function validateJoint(r: JointRecord): boolean {
  try {
    return (
      !!r.id &&
      r.operation === "joint" &&
      r.status === "completed" &&
      r.execution === "local_joint_extract" &&
      r.ruleVersion === "joint-1" &&
      (r.excerptLimit === 3 || r.excerptLimit === 8) &&
      validSources(r.sources.map((s) => s.snapshot)) &&
      r.sources.every(
        (s) =>
          s.operation === "understand" &&
          s.excerptLimit === r.excerptLimit &&
          s.instruction === "" &&
          validateText(s),
      )
    );
  } catch {
    return false;
  }
}
export function jointIdentity(r: JointRecord) {
  return JSON.stringify({
    excerptLimit: r.excerptLimit,
    snapshots: r.sources.map((s) => s.snapshot),
  });
}
