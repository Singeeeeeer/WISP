import type { ActionDraft, Familiar, Operation } from "./model";
import type { ProcessingRecord } from "./processing";
const familiarFor: Record<Operation, Familiar> = {
  check: "scout_bat",
  understand: "page_sprite",
  create: "alchemy_imp",
};
export function summonFromResult(record: ProcessingRecord): ActionDraft {
  return {
    entry: "summon",
    familiar: familiarFor[record.operation],
    execution: record.execution === "gemini" ? "gemini" : "local",
    instruction: record.instruction,
    snapshot: Object.freeze({ ...record.snapshot, id: crypto.randomUUID() }),
    ...(record.operation === "understand"
      ? record.execution === "gemini"
        ? { summaryStyle: record.summaryStyle }
        : { excerptLimit: record.excerptLimit ?? 8 }
      : {}),
    fromResult: true,
  };
}
