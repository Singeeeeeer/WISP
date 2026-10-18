import type { MaterialSnapshot } from "./model";
export interface Evidence {
  start: number;
  end: number;
  quote: string;
}
export interface CheckRecord {
  id: string;
  operation: "check";
  status: "completed";
  execution: "local_rules";
  ruleVersion: "schedule-1";
  snapshot: MaterialSnapshot;
  instruction: string;
  createdAt: string;
  outcome: "findings" | "no_findings" | "unsupported";
  findings: { title: string; explanation: string; evidence: Evidence[] }[];
}
export const CHECK_LIMIT =
  "仅识别同月、无年份的“活动于…开放”和“海报于…定稿，随后开放报名”句式（可含“计划”）。出现其他日期或已识别的取消等标记时不作判断；不理解跨月、年份、复杂上下文或任意补充要求。未发现疑点不代表材料没有问题。";
export function runCheck(
  snapshot: MaterialSnapshot,
  instruction: string,
): CheckRecord {
  if (!snapshot.text.trim()) throw new Error("材料为空，请先补充文字。");
  if (snapshot.text.length > 60000)
    throw new Error("本地检查最多支持 60,000 个 UTF-16 单元，请缩小选区。");
  const record: CheckRecord = {
    id: snapshot.id,
    operation: "check",
    status: "completed",
    execution: "local_rules",
    ruleVersion: "schedule-1",
    snapshot: { ...snapshot },
    instruction,
    createdAt: new Date().toISOString(),
    outcome: "unsupported",
    findings: [],
  };
  const date = "(\\d{1,2})\\s*月\\s*(\\d{1,2})\\s*日";
  const activity = new RegExp(
    "(?:^|[。！？\\n])\\s*(活动(?:计划)?于\\s*" +
      date +
      "开放)(?=[，,。！？\\n]|$)",
    "g",
  );
  const poster = new RegExp(
    "(?:^|[。！？\\n])\\s*(海报(?:计划)?于\\s*" +
      date +
      "定稿[，,]\\s*随后开放报名)(?=[。！？\\n]|$)",
    "g",
  );
  const a = [...snapshot.text.matchAll(activity)],
    p = [...snapshot.text.matchAll(poster)];
  if (a.length !== 1 || p.length !== 1) return record;
  // Conservative scope: do not bind a poster to an arbitrary event among other dates.
  const remainder = snapshot.text.replace(a[0][1], "").replace(p[0][1], "");
  if (
    /\d\s*月|\d\s*年|取消|作废|并非|不是[^。\n]*(?:安排|计划)|不再|另[一个场]|假设|如果/.test(
      remainder,
    )
  )
    return record;
  const valid = (m: RegExpMatchArray) =>
    Number(m[2]) >= 1 &&
    Number(m[2]) <= 12 &&
    Number(m[3]) >= 1 &&
    Number(m[3]) <=
      [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(m[2]) - 1];
  if (!valid(a[0]) || !valid(p[0]) || a[0][2] !== p[0][2]) return record;
  record.outcome = "no_findings";
  if (Number(p[0][3]) >= Number(a[0][3])) {
    const evidence = [a[0], p[0]].map((m) => {
      const start = m.index! + m[0].indexOf(m[1]);
      return { start, end: start + m[1].length, quote: m[1] };
    });
    record.outcome = "findings";
    record.findings = [
      {
        title: "报名与活动开放顺序需要核对",
        explanation:
          "材料写明海报定稿后才开放报名，而定稿日期不早于活动开放日期。请确认是否有意这样安排；同日先后时间及其他上下文未被本地规则判断。",
        evidence,
      },
    ];
  }
  return record;
}
export function validateCheck(record: CheckRecord): boolean {
  return (
    record.id === record.snapshot.id &&
    record.findings.every(
      (f) =>
        f.evidence.length > 0 &&
        f.evidence.every(
          (e) =>
            Number.isInteger(e.start) &&
            Number.isInteger(e.end) &&
            e.start >= 0 &&
            e.end > e.start &&
            e.end <= record.snapshot.text.length &&
            record.snapshot.text.slice(e.start, e.end) === e.quote,
        ),
    )
  );
}
