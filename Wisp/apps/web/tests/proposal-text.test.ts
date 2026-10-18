import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { seeds, snapshot } from "../src/domain/model";
import { runText, validateText, runLocal } from "../src/domain/local-text";
import { newTask, transition } from "../src/domain/task";
import { createRepository } from "../src/services/repository";
const input = () =>
  snapshot({ ...seeds()[0], text: " 😀一\n二\n三\n四\n五\n六\n七\n八\n九" });
it("freezes a short excerpt limit with exact source and omissions", () => {
  const r = runText("understand", input(), "", 3);
  expect(r.excerpts).toHaveLength(3);
  expect(r.omittedLines).toBe(6);
  expect(r.excerptLimit).toBe(3);
  expect(validateText(r)).toBe(true);
  expect(runText("understand", input(), "").excerpts).toHaveLength(8);
  expect(validateText({ ...r, excerptLimit: 8 })).toBe(false);
});
it("binds task and result to the confirmed excerpt limit", async () => {
  const draft = {
    entry: "summon" as const,
    familiar: "page_sprite" as const,
    snapshot: input(),
    instruction: "",
    excerptLimit: 3 as const,
  };
  const task = newTask(draft);
  expect(task.excerptLimit).toBe(3);
  const running = transition(task, { type: "start" });
  expect(() =>
    transition(running, {
      type: "complete",
      result: runLocal("understand", task.snapshot, "", 8),
    }),
  ).toThrow(/binding|bound/);
  expect(
    transition(running, {
      type: "complete",
      result: runLocal("understand", task.snapshot, "", 3),
    }).status,
  ).toBe("completed");
  const repo = createRepository("proposal-task-" + crypto.randomUUID());
  await repo.enqueueTask(task);
  await expect(
    repo.enqueueTask(newTask({ ...draft, excerptLimit: 8 })),
  ).rejects.toThrow("submission ID");
});
it("keeps legacy eight-line records valid and rejects invalid limits", () => {
  const r = runText("understand", input(), "");
  delete r.excerptLimit;
  expect(validateText(r)).toBe(true);
  expect(() => runText("understand", input(), "", 5 as 3)).toThrow();
});
