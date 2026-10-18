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
    "Local excerpt: show the first 8 non-empty lines in source order without sorting, rewriting, or inferring importance. Count omitted lines explicitly; this is not a complete summary.",
  create:
    "Event template: recognize only standalone lines beginning with “Topic:”, “Time:”, “Location:”, or “How to join:”. Missing or repeated fields are marked for completion or review; other text is not inserted automatically. No new facts are generated.",
};
export const actions = {
  check: "Run local check",
  understand: "Organize source excerpts",
  create: "Create template draft",
};
export function runText(
  operation: TextRecord["operation"],
  snapshot: MaterialSnapshot,
  instruction: string,
  excerptLimit: ExcerptLimit = 8,
): TextRecord {
  if (excerptLimit !== 3 && excerptLimit !== 8) throw new Error("Invalid excerpt line count");
  if (!snapshot.text.trim()) throw new Error("Material is empty. Add text first.");
  if (snapshot.text.length > 60000)
    throw new Error("Local processing is limited to 60,000 UTF-16 code units. Reduce the selection.");
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
  const legacyLabel = (...codes: number[]) => String.fromCodePoint(...codes);
  const fields = [
    ["Topic", legacyLabel(20027, 39064)], ["Time", legacyLabel(26102, 38388)],
    ["Location", legacyLabel(22320, 28857)], ["How to join", legacyLabel(21442, 19982, 26041, 24335)],
  ].map(([label, legacyField]) => {
    const prefix = new RegExp("^(?:" + label + "|" + legacyField + ")[" + legacyLabel(65306) + ":]");
    const matches = lines.filter((e) => prefix.test(e.quote));
    if (matches.length > 1) return `${label}: [Review: multiple ${label} entries]`;
    if (!matches.length || !matches[0].quote.replace(prefix, "").trim())
      return `${label}: [To be added]`;
    evidence.push(matches[0]);
    return `${label}: ${matches[0].quote.replace(prefix, "").trim()}`;
  });
  return {
    ...base,
    excerpts: evidence,
    omittedLines: 0,
    draft: [
      "[Local template draft · Not confirmed]",
      "Event introduction",
      ...fields,
      "",
      "Introduction: [To be added: write from the information above]",
      "Verify every field before publishing. The template structure is not source fact.",
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
      ? "An arrangement needs review"
      : r.outcome === "no_findings"
        ? "Local rules found no reportable issue"
        : "This material is outside the local rules' scope"
    : r.operation === "understand"
      ? "Source excerpt"
      : "Event template draft";
}
export function resultBody(r: LocalRecord): string[] {
  return r.operation === "check"
    ? r.findings.flatMap((f) => [
        f.title,
        f.explanation,
        ...f.evidence.map((e) => `Source evidence: ${e.quote}`),
      ])
    : r.operation === "understand"
      ? [...r.excerpts.map((e) => e.quote), `Omitted non-empty lines: ${r.omittedLines}`]
      : [r.draft, ...r.excerpts.map((e) => `Field evidence: ${e.quote}`)];
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
    ? limits.understand.replace("first 8", "first " + excerptLimit)
    : limits[operation];
}
