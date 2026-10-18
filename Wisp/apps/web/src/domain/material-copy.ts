import { snapshot, type Material, type SelectionContext } from "./model";

export function createMaterialCopy(
  material: Material,
  selection?: SelectionContext,
  id: string = crypto.randomUUID(),
): Material {
  const frozen = snapshot(material, selection);
  if (!frozen.text.trim()) throw new Error("Select or save non-empty text first.");
  if (frozen.text.includes("\0"))
    throw new Error("The text contains a NUL character and cannot be added as a copy.");
  if (frozen.text.length > 60000)
    throw new Error("Text is limited to 60,000 UTF-16 code units. Reduce the selection.");
  if (!id.trim() || id === material.id)
    throw new Error("A copy must use its own identifier.");
  const source = selection ? "selection_copy" : "document_copy";
  const suffix = selection ? " · selection copy" : " · full-text copy";
  let title = material.title.slice(0, 120 - suffix.length);
  if (/[\uD800-\uDBFF]$/.test(title)) title = title.slice(0, -1);
  return {
    id,
    kind: "text",
    title: title + suffix,
    text: frozen.text,
    version: 1,
    source,
    createdAt: frozen.capturedAt,
    updatedAt: frozen.capturedAt,
    origin: {
      ...material.origin,
      kind: source,
      addedAt: frozen.capturedAt,
      copy: Object.freeze({
        materialId: frozen.materialId,
        materialVersion: frozen.materialVersion,
        title: frozen.title,
        start: frozen.start,
        end: frozen.end,
        source: material.source,
      }),
    },
  };
}
