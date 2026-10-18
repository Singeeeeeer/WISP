import { expect, it } from "vitest";
import { snapshot, seeds } from "../src/domain/model";
import { runCheck, validateCheck } from "../src/domain/check";
function source(text: string) {
  return snapshot({ ...seeds()[0], text });
}
it("reports a limited schedule concern with exact evidence, including emoji offsets", () => {
  const s = source(
    "😀前言. The event is scheduled to open on November 8. The poster is scheduled to be finalized on November 10, followed by registration opening.",
  );
  const r = runCheck(s, "关注日期");
  expect(r.outcome).toBe("findings");
  expect(r.findings).toHaveLength(1);
  for (const e of r.findings[0].evidence)
    expect(s.text.slice(e.start, e.end)).toBe(e.quote);
  expect(validateCheck(r)).toBe(true);
  expect(r.instruction).toBe("关注日期");
});
it("recomputes changed dates and does not claim universal correctness", () => {
  expect(
    runCheck(
      source(
        "Event to open on November 8. Poster to be finalized on November 5, followed by registration opening.",
      ),
      "",
    ).outcome,
  ).toBe("no_findings");
});
it("does not treat cancellation fragments inside ordinary words as negation", () => {
  const r = runCheck(
    source(
      "Event to open on November 8. Poster to be finalized on November 10, followed by registration opening. Use a serif typeface. Avoid bright colors. Use a knot motif.",
    ),
    "",
  );
  expect(r.outcome).toBe("findings");
  expect(validateCheck(r)).toBe(true);
});
it("keeps Chinese user schedules supported with English findings and exact evidence", () => {
  const s = source(
    "😀前言。活动计划于 11 月 8 日开放。海报计划于 11 月 10 日定稿，随后开放报名。",
  );
  const r = runCheck(s, "");
  expect(r.outcome).toBe("findings");
  expect(r.findings[0].title).toBe("Review the event and registration order");
  expect(r.findings[0].evidence.map((e) => e.quote)).toEqual([
    "活动计划于 11 月 8 日开放",
    "海报计划于 11 月 10 日定稿，随后开放报名",
  ]);
  expect(validateCheck(r)).toBe(true);
});
it.each([
  "Event to open on November 8. Poster to be finalized on November 10.",
  "Event is not to open on November 8. Poster to be finalized on November 10, followed by registration opening.",
  "Event to open on December 8. Poster to be finalized on January 10, followed by registration opening.",
  "Event to open on November 31. Poster to be finalized on November 30, followed by registration opening.",
  "Event to open on November 8. Event to open on November 9. Poster to be finalized on November 10, followed by registration opening.",
  "Event to open on November 8, 2026. Poster to be finalized on November 10, 2027, followed by registration opening.",
  "Material without dates",
  "Event to open on November 8. Another event to open on November 20. Poster to be finalized on November 10, followed by registration opening.",
  "The following plan is cancelled. Event to open on November 8. Poster to be finalized on November 10, followed by registration opening.",
])("does not infer unsupported text: %s", (text) => {
  expect(runCheck(source(text), "").outcome).toBe("unsupported");
});
it("rejects empty or oversized material and invalid evidence", () => {
  expect(() => runCheck(source("  "), "")).toThrow();
  expect(() => runCheck(source("字".repeat(60001)), "")).toThrow();
  const r = runCheck(snapshot(seeds()[0]), "");
  r.findings[0].evidence[0].quote = "不存在";
  expect(validateCheck(r)).toBe(false);
});
