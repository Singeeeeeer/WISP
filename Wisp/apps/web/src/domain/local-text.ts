import type { MaterialSnapshot, Operation, ExcerptLimit } from "./model";
import {
  CHECK_LIMIT,
  runCheck,
  validateCheck,
  type CheckRecord,
  type Evidence,
} from "./check";
export interface TextRecord {
  excerptLimit?: ExcerptLimit;
  id: string;
  operation: "understand" | "create";
  status: "completed";
  execution: "local_extract" | "local_template";
  ruleVersion: "text-1";
  snapshot: MaterialSnapshot;
  instruction: string;
  createdAt: string;
  excerpts: Evidence[];
  omittedLines: number;
  draft: string;
}
export type LocalRecord = CheckRecord | TextRecord;
export const labels = {
  check: "Check",
  understand: "Understand",
  create: "Create",
};
export const limits = {
  check: CHECK_LIMIT,
  understand:
    "本地摘录整理：按原文顺序展示前 8 个非空行，不排序、不改写、不推断重点。超出部分明确计数，不代表完整摘要。",
  create:
    "活动介绍模板：仅识别独占一行的“主题：”“时间：”“地点：”“参与方式：”字段。字段缺失或重复会标注待补充或待确认；其他正文不会自动填入模板。没有生成新事实。",
};
export const actions = {
  check: "运行本地检查",
  understand: "整理原文摘录",
  create: "生成模板草稿",
};
export function runText(
  operation: TextRecord["operation"],
  snapshot: MaterialSnapshot,
  instruction: string,
  excerptLimit: ExcerptLimit = 8,
): TextRecord {
  if (excerptLimit !== 3 && excerptLimit !== 8) throw new Error("无效摘录行数");
  if (!snapshot.text.trim()) throw new Error("材料为空，请先补充文字。");
  if (snapshot.text.length > 60000)
    throw new Error("本地处理最多支持 60,000 个 UTF-16 单元，请缩小选区。");
  const lines: Evidence[] = [];
  for (const m of snapshot.text.matchAll(/[^\r\n]+/g)) {
    const quote = m[0].trim();
    if (!quote) continue;
    const start = m.index! + m[0].indexOf(quote);
    lines.push({ quote, start, end: start + quote.length });
  }
  const base = {
    id: snapshot.id,
    operation,
    status: "completed" as const,
    execution:
      operation === "understand"
        ? ("local_extract" as const)
        : ("local_template" as const),
    ruleVersion: "text-1" as const,
    snapshot: { ...snapshot },
    instruction,
    createdAt: new Date().toISOString(),
  };
  if (operation === "understand")
    return {
      ...base,
      excerptLimit,
      excerpts: lines.slice(0, excerptLimit),
      omittedLines: Math.max(0, lines.length - excerptLimit),
      draft: "",
    };
  const evidence: Evidence[] = [];
  const fields = ["主题", "时间", "地点", "参与方式"].map((label) => {
    const matches = lines.filter((e) =>
      new RegExp("^" + label + "[：:]").test(e.quote),
    );
    if (matches.length > 1) return `${label}：【待确认：存在多条${label}】`;
    if (!matches.length || !matches[0].quote.slice(label.length + 1).trim())
      return `${label}：【待补充】`;
    evidence.push(matches[0]);
    return `${label}：${matches[0].quote.slice(label.length + 1).trim()}`;
  });
  return {
    ...base,
    excerpts: evidence,
    omittedLines: 0,
    draft: [
      "【本地模板草稿 · 尚未确认】",
      "活动介绍",
      ...fields,
      "",
      "介绍正文：【待补充：请根据上述信息自行撰写】",
      "发布前请核实所有字段。模板结构不是原文事实。",
    ].join("\n"),
  };
}
export function validateText(r: TextRecord): boolean {
  return (
    r.id === r.snapshot.id &&
    (r.operation !== "understand" || validExtraction(r)) &&
    r.excerpts.every(
      (e) =>
        Number.isInteger(e.start) &&
        Number.isInteger(e.end) &&
        e.start >= 0 &&
        e.end > e.start &&
        e.end <= r.snapshot.text.length &&
        r.snapshot.text.slice(e.start, e.end) === e.quote,
    )
  );
}
export function runLocal(
  operation: Operation,
  snapshot: MaterialSnapshot,
  instruction: string,
  excerptLimit: ExcerptLimit = 8,
): LocalRecord {
  return operation === "check"
    ? runCheck(snapshot, instruction)
    : runText(operation, snapshot, instruction, excerptLimit);
}
export function validateLocal(r: LocalRecord) {
  return r.operation === "check" ? validateCheck(r) : validateText(r);
}
export function resultHeading(r: LocalRecord) {
  return r.operation === "check"
    ? r.outcome === "findings"
      ? "发现需要核对的安排"
      : r.outcome === "no_findings"
        ? "本地规则未发现可报告的疑点"
        : "当前材料不在本地规则支持范围"
    : r.operation === "understand"
      ? "原文摘录整理"
      : "活动介绍模板草稿";
}
export function resultBody(r: LocalRecord): string[] {
  return r.operation === "check"
    ? r.findings.flatMap((f) => [
        f.title,
        f.explanation,
        ...f.evidence.map((e) => `原文依据：${e.quote}`),
      ])
    : r.operation === "understand"
      ? [...r.excerpts.map((e) => e.quote), `未展示的非空行：${r.omittedLines}`]
      : [r.draft, ...r.excerpts.map((e) => `字段依据：${e.quote}`)];
}

function validExtraction(r: TextRecord) {
  const limit = r.excerptLimit ?? 8;
  if (limit !== 3 && limit !== 8) return false;
  const expected = runText("understand", r.snapshot, r.instruction, limit);
  return (
    JSON.stringify(r.excerpts) === JSON.stringify(expected.excerpts) &&
    r.omittedLines === expected.omittedLines
  );
}
export function limitDescription(
  operation: Operation,
  excerptLimit: ExcerptLimit = 8,
) {
  return operation === "understand"
    ? limits.understand.replace("前 8 个", "前 " + excerptLimit + " 个")
    : limits[operation];
}
