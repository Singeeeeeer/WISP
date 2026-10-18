import { create } from "zustand";
import type { Material } from "../domain/model";
import { createMaterialCopy } from "../domain/material-copy";
import { fileSource } from "../domain/cauldron";
import { useDocuments, useInteraction, useWorkspace } from "../state/stores";
import { useCauldron } from "./cauldron-runtime";

type ImportRequest = { file: File } | { copy: Material };
export const useCauldronImport = create<{
  request?: ImportRequest;
  occupied: boolean;
  owner?: string;
  error: string;
}>(() => ({ occupied: false, error: "" }));

export function claimImport(request?: ImportRequest): string {
  const owner = crypto.randomUUID();
  useCauldronImport.setState({ owner, request, occupied: true, error: "" });
  return owner;
}
export function releaseImport(owner: string | undefined) {
  if (owner && useCauldronImport.getState().owner === owner)
    useCauldronImport.setState({
      occupied: false,
      request: undefined,
      owner: undefined,
    });
}
export function reportImportError(error: unknown) {
  useCauldronImport.setState({
    error: error instanceof Error ? error.message : "无法放入材料，请重试。",
  });
}

export function importBlockReason(): string {
  const state = useInteraction.getState();
  if (
    state.draft ||
    state.jointDraft ||
    state.watchDraft ||
    state.canvas ||
    state.book ||
    document.querySelector('[role="dialog"]:not(:has(.cauldron))')
  )
    return "请先完成或关闭当前面板，再放入材料。";
  if (useCauldronImport.getState().occupied)
    return "已有未完成的材料预览或正在处理，请先确认加入或取消新增。";
  if (!useDocuments.getState().ready || !useCauldron.getState().ready)
    return "材料列表尚未就绪，请稍后重试。";
  if (useCauldron.getState().entries.length >= 12)
    return "熔炉最多容纳 12 份材料，请先移出一份再加入。";
  return "";
}

export function copyFromDocument(id: string, selectionOnly = false): Material {
  const docs = useDocuments.getState();
  const material = docs.materials.find((m) => m.id === id);
  if (!material) throw new Error("当前文档不可用，请重新打开。");
  if (docs.status[id] !== "已保存" || docs.errors[id])
    throw new Error("请先保存原文档并解决保存冲突，再加入副本。");
  const selection = useInteraction.getState().selection;
  if (selectionOnly && (!selection || selection.materialId !== id))
    throw new Error("请先在当前文档选择有效文字，不会自动改为全文。");
  return createMaterialCopy(material, selectionOnly ? selection : undefined);
}

export function currentDocumentId(): string | undefined {
  const workspace = useWorkspace.getState();
  return workspace.windows.find(
    (w) => w.id === workspace.active && !w.minimized,
  )?.materialId;
}

export function queueImport(request: ImportRequest) {
  const reason = importBlockReason();
  if (reason) throw new Error(reason);
  if ("file" in request) {
    fileSource(request.file.name);
    if (request.file.size > 20_000_000)
      throw new Error("单个文件不能超过 20 MB。");
  }
  // Claim the slot synchronously: a second drop cannot replace this draft.
  claimImport(request);
  useInteraction.setState({ cauldron: true, menu: false, message: "" });
}

export function requestDocumentCopy(
  id: string | undefined,
  selectionOnly = false,
) {
  try {
    if (!id) throw new Error("请先打开并选择一份文档。");
    const reason = importBlockReason();
    if (reason) throw new Error(reason);
    queueImport({ copy: copyFromDocument(id, selectionOnly) });
  } catch (error) {
    reportImportError(error);
  }
}

export const DOCUMENT_DRAG_TYPE = "application/x-wisp-document-copy";
let dragging: { token: string; copy: Material } | undefined;
export function startDocumentDrag(id: string, transfer: DataTransfer) {
  const reason = importBlockReason();
  if (reason) throw new Error(reason);
  dragging = { token: crypto.randomUUID(), copy: copyFromDocument(id) };
  transfer.setData(DOCUMENT_DRAG_TYPE, dragging.token);
  transfer.effectAllowed = "copy";
}
export function endDocumentDrag() {
  dragging = undefined;
}
export function draggedDocument(transfer: DataTransfer): Material {
  if (!dragging || transfer.getData(DOCUMENT_DRAG_TYPE) !== dragging.token)
    throw new Error("拖入文档已失效，请重新拖动独立的入炉把手。");
  return dragging.copy;
}
