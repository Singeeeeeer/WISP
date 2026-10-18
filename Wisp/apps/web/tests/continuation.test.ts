import { describe, it, expect } from "vitest";
import { summonFromResult } from "../src/domain/continuation";
import { seeds, snapshot, selectText } from "../src/domain/model";
import { runLocal } from "../src/domain/local-text";
describe("continue a saved result", () => {
  it("retains the historical eight-line default when an old result has no excerptLimit", () => {
    const record = runLocal("understand", snapshot(seeds()[0]), "", 8);
    if (record.operation !== "understand") throw Error("unexpected operation");
    delete record.excerptLimit;
    expect(summonFromResult(record).excerptLimit).toBe(8);
  });
  it("keeps frozen selected material and requirements but assigns a new submission identity", () => {
    const material = seeds()[0];
    const source = snapshot(material, selectText(material, 3, 12));
    const record = runLocal("understand", source, "保留这条要求", 3);
    const draft = summonFromResult(record);
    expect(draft.snapshot.id).not.toBe(source.id);
    expect({ ...draft.snapshot, id: source.id }).toEqual(source);
    expect(draft).toMatchObject({
      entry: "summon",
      familiar: "page_sprite",
      execution: "local",
      excerptLimit: 3,
      instruction: "保留这条要求",
      fromResult: true,
    });
    expect(record.snapshot.id).toBe(source.id);
  });
});
