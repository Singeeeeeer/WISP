import { expect, it } from "vitest";
import { snapshot, seeds } from "../src/domain/model";
import { runCheck, validateCheck } from "../src/domain/check";
function source(text: string) {
  return snapshot({ ...seeds()[0], text });
}
it("reports a limited schedule concern with exact evidence, including emoji offsets", () => {
  const s = source(
    "😀前言。活动计划于 11 月 8 日开放。海报计划于 11 月 10 日定稿，随后开放报名。",
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
    runCheck(source("活动于11月8日开放。海报于11月5日定稿，随后开放报名。"), "")
      .outcome,
  ).toBe("no_findings");
});
it.each([
  "活动于11月8日开放。海报于11月10日定稿。",
  "活动并非于11月8日开放。海报于11月10日定稿，随后开放报名。",
  "活动于12月8日开放。海报于1月10日定稿，随后开放报名。",
  "活动于11月31日开放。海报于11月30日定稿，随后开放报名。",
  "活动于11月8日开放。活动于11月9日开放。海报于11月10日定稿，随后开放报名。",
  "活动于2026年11月8日开放。海报于2027年11月10日定稿，随后开放报名。",
  "没有日期的材料",
  "活动于11月8日开放。另一场活动于11月20日开放。海报于11月10日定稿，随后开放报名。",
  "以下安排已取消。活动于11月8日开放。海报于11月10日定稿，随后开放报名。",
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
