import { LocalPanel } from "../check/CheckPanel";
import { SummonPanel } from "../delegation/SummonPanel";
import { useInteraction } from "../../state/stores";
export function CapabilityPanel() {
  const draft = useInteraction((s) => s.draft);
  if (!draft) return null;
  return draft.entry === "summon" ? (
    <SummonPanel draft={draft} />
  ) : (
    <LocalPanel draft={draft} />
  );
}
