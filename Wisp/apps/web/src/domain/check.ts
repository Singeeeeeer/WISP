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
  "Recognizes only same-month, yearless sentences stating that an event opens and that a poster is finalized followed by registration opening. Other dates or cancellation markers are unsupported; cross-month dates, years, complex context, and arbitrary instructions are not interpreted. No finding does not mean the material is correct.";
export function runCheck(
  snapshot: MaterialSnapshot,
  instruction: string,
): CheckRecord {
  if (!snapshot.text.trim()) throw new Error("Material is empty. Add text first.");
  if (snapshot.text.length > 60000)
    throw new Error("Local checks are limited to 60,000 UTF-16 code units. Reduce the selection.");
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
  const date = "(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2})";
  const activity = new RegExp(
    "(?:^|[.!?\\n])\\s*((?:the )?event(?: is)?(?: scheduled)? to open on\\s*" +
      date +
      ")(?=[,\\.!?\\n]|$)",
    "gi",
  );
  const poster = new RegExp(
    "(?:^|[.!?\\n])\\s*((?:the )?poster(?: is)?(?: scheduled)? to be finalized on\\s*" +
      date +
      ",\\s*followed by registration opening)(?=[.!?\\n]|$)",
    "gi",
  );
  // Retain the previously supported source syntax; generated explanations use English.
  const legacyChar = (...codes: number[]) => String.fromCodePoint(...codes);
  const monthChar = legacyChar(26376), dayChar = legacyChar(26085);
  const sentencePunctuation = legacyChar(12290, 65281, 65311);
  const commaChar = legacyChar(65292);
  const legacyDate = "(\\d{1,2})\\s*" + monthChar + "\\s*(\\d{1,2})\\s*" + dayChar;
  const legacyActivity = new RegExp(
    "(?:^|[" + sentencePunctuation + "\\n])\\s*(" + legacyChar(27963, 21160) +
      "(?:" + legacyChar(35745, 21010) + ")?" + legacyChar(20110) + "\\s*" +
      legacyDate + legacyChar(24320, 25918) + ")(?=[" + commaChar + "," + sentencePunctuation + "\\n]|$)", "g",
  );
  const legacyPoster = new RegExp(
    "(?:^|[" + sentencePunctuation + "\\n])\\s*(" + legacyChar(28023, 25253) +
      "(?:" + legacyChar(35745, 21010) + ")?" + legacyChar(20110) + "\\s*" + legacyDate +
      legacyChar(23450, 31295) + "[" + commaChar + ",]\\s*" +
      legacyChar(38543, 21518, 24320, 25918, 25253, 21517) + ")(?=[" + sentencePunctuation + "\\n]|$)", "g",
  );
  const a = [...snapshot.text.matchAll(activity), ...snapshot.text.matchAll(legacyActivity)],
    p = [...snapshot.text.matchAll(poster), ...snapshot.text.matchAll(legacyPoster)];
  if (a.length !== 1 || p.length !== 1) return record;
  // Conservative scope: do not bind a poster to an arbitrary event among other dates.
  const remainder = snapshot.text.replace(a[0][1], "").replace(p[0][1], "");
  if (
    new RegExp("\\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d+\\b|\\b(?:19|20)\\d{2}\\b|\\b(?:cancel(?:led|ed)?|void|not|no longer|another|assume|if)\\b|\\d\\s*" + monthChar + "|\\d\\s*" + legacyChar(24180) + "|" + legacyChar(21462, 28040) + "|" + legacyChar(20316, 24223) + "|" + legacyChar(24182, 38750) + "|" + legacyChar(19981, 26159) + "[^" + legacyChar(12290) + "\\n]*(?:" + legacyChar(23433, 25490) + "|" + legacyChar(35745, 21010) + ")|" + legacyChar(19981, 20877) + "|" + legacyChar(21478) + "[" + legacyChar(19968, 20010, 22330) + "]|" + legacyChar(20551, 35774) + "|" + legacyChar(22914, 26524), "i").test(
      remainder,
    )
  )
    return record;
  const month = (m: RegExpMatchArray) => Number(m[2]) ||
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(m[2].toLowerCase()) + 1;
  const valid = (m: RegExpMatchArray) =>
    month(m) >= 1 && month(m) <= 12 &&
    Number(m[3]) >= 1 &&
    Number(m[3]) <=
      [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
        month(m) - 1
      ];
  if (!valid(a[0]) || !valid(p[0]) || month(a[0]) !== month(p[0])) return record;
  record.outcome = "no_findings";
  if (Number(p[0][3]) >= Number(a[0][3])) {
    const evidence = [a[0], p[0]].map((m) => {
      const start = m.index! + m[0].indexOf(m[1]);
      return { start, end: start + m[1].length, quote: m[1] };
    });
    record.outcome = "findings";
    record.findings = [
      {
        title: "Review the event and registration order",
        explanation:
          "The material says registration opens after the poster is finalized, but the finalization date is not earlier than the event opening date. Confirm that this order is intentional; the local rule does not evaluate same-day times or other context.",
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
