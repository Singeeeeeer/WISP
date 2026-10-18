import { LocalPanel } from "../check/CheckPanel";
import { SummonPanel } from "../delegation/SummonPanel";
import { useInteraction } from "../../state/stores";
import { BatchPanel } from "../batch/BatchPanel";
export function CapabilityPanel() {
  const draft = useInteraction((s) => s.draft);
  const batchDraft = useInteraction((s) => s.batchDraft);
  if (batchDraft) return <BatchPanel key={batchDraft.id} draft={batchDraft} />;
  if (!draft) return null;
  // Prototype policy applies to fresh drafts and continuations, never stored results.
  const geminiDraft = { ...draft, execution: "gemini" as const };
  return draft.entry === "summon" ? (
    <SummonPanel draft={geminiDraft} />
  ) : (
    <LocalPanel draft={geminiDraft} />
  );
}
