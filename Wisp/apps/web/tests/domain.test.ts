import { describe, it, expect } from "vitest";
import { snapshot, selectText, seeds } from "../src/domain/model";
describe("material boundaries", () => {
  it("captures UTF-16 selection and refuses stale ranges", () => {
    const m = { ...seeds()[0], text: "A😀BC" };
    const s = selectText(m, 1, 3);
    expect(s.selectedText).toBe("😀");
    expect(() => snapshot({ ...m, version: m.version + 1 }, s)).toThrow("选区");
  });
  it("rejects partial surrogate characters and empty selections", () => {
    const m = { ...seeds()[0], text: "A😀BC" };
    expect(() => selectText(m, 1, 2)).toThrow();
    expect(() => selectText(m, 2, 2)).toThrow();
  });
  it("freezes a copy independent of later edits", () => {
    const m = seeds()[0];
    const s = snapshot(m);
    const before = s.text;
    m.text = "changed";
    expect(s.text).toBe(before);
    expect(Object.isFrozen(s)).toBe(true);
  });
});
