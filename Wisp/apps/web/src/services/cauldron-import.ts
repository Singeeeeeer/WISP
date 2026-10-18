import { create } from "zustand";
import type { Material } from "../domain/model";
import { createMaterialCopy } from "../domain/material-copy";
import { fileSource } from "../domain/cauldron";
import { useDocuments, useInteraction, useWorkspace } from "../state/stores";
import { useCauldron } from "./cauldron-runtime";

type ImportRequest = { file: File } | { files: File[] } | { copy: Material };
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
    error:
      error instanceof Error
        ? error.message
        : "Could not add the material. Please try again.",
  });
}

export function importBlockReason(): string {
  const state = useInteraction.getState();
  if (
    state.draft ||
    state.batchDraft ||
    state.jointDraft ||
    state.watchDraft ||
    state.canvas ||
    state.book ||
    document.querySelector('[role="dialog"]:not(:has(.cauldron))')
  )
    return "Finish or close the current panel before adding a material.";
  if (useCauldronImport.getState().occupied)
    return "A material preview is still open or processing is in progress. Confirm adding the material or cancel it first.";
  if (!useDocuments.getState().ready || !useCauldron.getState().ready)
    return "The material list is not ready yet. Please try again shortly.";
  if (useCauldron.getState().entries.length >= 12)
    return "The cauldron can hold up to 12 materials. Remove one before adding another.";
  return "";
}

export function copyFromDocument(id: string, selectionOnly = false): Material {
  const docs = useDocuments.getState();
  const material = docs.materials.find((m) => m.id === id);
  if (!material)
    throw new Error("The current document is unavailable. Reopen it.");
  if (docs.status[id] !== "saved" || docs.errors[id])
    throw new Error(
      "Save the original document and resolve any save conflicts before adding a copy.",
    );
  const selection = useInteraction.getState().selection;
  if (selectionOnly && (!selection || selection.materialId !== id))
    throw new Error(
      "Select valid text in the current document first. The selection will not be replaced with the full text automatically.",
    );
  return createMaterialCopy(material, selectionOnly ? selection : undefined);
}

export function currentDocumentId(): string | undefined {
  const workspace = useWorkspace.getState();
  return workspace.windows.find(
    (w) => w.id === workspace.active && !w.minimized,
  )?.materialId;
}

export function validateImportFiles(files: readonly File[]) {
  if (!files.length) throw new Error("Choose at least one file.");
  if (files.length > 12)
    throw new Error("Choose up to 12 files at a time. No files were added.");
  const room = 12 - useCauldron.getState().entries.length;
  if (files.length > room)
    throw new Error(
      `The cauldron has room for ${room} more materials. Choose fewer files or remove materials first. No files were added.`,
    );
  for (const file of files) {
    try {
      fileSource(file.name);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : "Unsupported file."} No files were added.`,
      );
    }
    if (file.size > 20_000_000)
      throw new Error(`File ${file.name} exceeds 20 MB. No files were added.`);
  }
}

export function queueImport(request: ImportRequest) {
  const reason = importBlockReason();
  if (reason) throw new Error(reason);
  if ("file" in request) {
    validateImportFiles([request.file]);
  }
  if ("files" in request) {
    validateImportFiles(request.files);
    request = { files: [...request.files] };
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
    if (!id) throw new Error("Open and select a document first.");
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
    throw new Error(
      "The dragged document is no longer available. Drag the separate Add to Cauldron handle again.",
    );
  return dragging.copy;
}
