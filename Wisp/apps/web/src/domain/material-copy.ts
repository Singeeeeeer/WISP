import { snapshot, type Material, type SelectionContext } from "./model";

export function createMaterialCopy(
  material: Material,
  selection?: SelectionContext,
  id: string = crypto.randomUUID(),
): Material {
  const frozen = snapshot(material, selection);
  if (!frozen.text.trim()) throw new Error("请先选择或保存非空文本。");
  if (frozen.text.includes("\0"))
    throw new Error("文本包含 NUL 字符，无法加入副本。");
  if (frozen.text.length > 60000)
    throw new Error("文本最多 60,000 个 UTF-16 单元，请缩小选区。");
  if (!id.trim() || id === material.id)
    throw new Error("副本必须使用独立标识。");
  const source = selection ? "selection_copy" : "document_copy";
  const suffix = selection ? " · 选区副本" : " · 全文副本";
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
