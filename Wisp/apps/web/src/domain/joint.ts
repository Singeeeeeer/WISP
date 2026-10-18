import type { ProcessingRecord } from "./processing";
import type { BatchRecord } from "./batch";
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
export type StoredRecord = ProcessingRecord | JointRecord | BatchRecord;
export const jointLimit =
  "The two texts are excerpted separately in source order, preserving each source. Facts are not merged or linked by inference; this is not a combined summary. Each text uses its selected line count independently.";
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
      "Provide two different non-empty full texts, each no longer than 60,000 UTF-16 code units.",
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
