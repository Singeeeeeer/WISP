import type { BatchDraft, BatchRecord } from "../../domain/batch";
import { snapshot, type MaterialSnapshot } from "../../domain/model";
import { useDocuments, useInteraction } from "../../state/stores";

export function openBatchDraft(batchDraft: BatchDraft) {
  useInteraction.setState({
    batchDraft,
    draft: undefined,
    cauldron: false,
    menu: false,
    book: false,
    selection: undefined,
    selectionError: undefined,
  });
}

export function prepareBatch(ids: string[], entry: BatchDraft["entry"]) {
  if (ids.length < 2 || ids.length > 12 || new Set(ids).size !== ids.length)
    throw new Error("Select 2–12 different materials.");
  const materials = useDocuments.getState().materials;
  const snapshots = ids.map((id) => {
    const material = materials.find((m) => m.id === id);
    if (!material) throw new Error("Material unavailable. Refresh and select it again.");
    return snapshot(material);
  });
  // Oversized full texts may enter confirmation so the user can choose smaller ranges.
  openBatchDraft({
    id: crypto.randomUUID(),
    snapshots,
    entry,
    instruction: "",
    familiar:
      entry === "check"
        ? "scout_bat"
        : entry === "create"
          ? "alchemy_imp"
          : "page_sprite",
  });
}

export function prepareBatchAgain(
  source: {
    snapshots: MaterialSnapshot[];
    instruction: string;
    summaryStyle?: BatchDraft["summaryStyle"];
  },
  entry: BatchDraft["entry"],
  familiar: BatchDraft["familiar"],
) {
  const materials = useDocuments.getState().materials;
  const current = source.snapshots.map((s) =>
    materials.find((m) => m.id === s.materialId),
  );
  if (current.some((m) => !m)) return false;
  openBatchDraft({
    id: crypto.randomUUID(),
    snapshots: current.map((m) => snapshot(m!)),
    entry,
    instruction: source.instruction,
    familiar,
    summaryStyle: source.summaryStyle,
  });
  return true;
}

export function familiarForBatch(record: BatchRecord): BatchDraft["familiar"] {
  return record.operation === "check"
    ? "scout_bat"
    : record.operation === "create"
      ? "alchemy_imp"
      : "page_sprite";
}
