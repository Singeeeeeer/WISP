import type { CanvasNote } from "../domain/canvas";
import { sameValue } from "../domain/gemini-common";
import type { Material, Settings, WindowState } from "../domain/model";
import type { Notebook } from "./repository";

export type CanvasNoteDraft = {
  original?: CanvasNote;
  title: string;
  text: string;
  x: number;
  y: number;
};
export const canvasDraftChanged = (draft: CanvasNoteDraft | undefined) =>
  !!draft &&
  (draft.original
    ? draft.title !== draft.original.title ||
      draft.text !== draft.original.text ||
      draft.x !== draft.original.x ||
      draft.y !== draft.original.y
    : !!draft.title || !!draft.text);

let canvasDraft: CanvasNoteDraft | undefined;
export function setCanvasExportDraft(draft: CanvasNoteDraft | undefined) {
  canvasDraft = canvasDraftChanged(draft) ? structuredClone(draft) : undefined;
}

export function readTourSeen(): boolean | null {
  try {
    return localStorage.getItem("wisp-tour-seen") === "true";
  } catch {
    return null;
  }
}

export function withNotebookSession(
  notebook: Notebook,
  session: {
    materials: Material[];
    status: Record<string, string>;
    settings: Settings;
    windows: WindowState[];
  },
) {
  return {
    ...notebook,
    // These are session copies, not replacements for the saved database snapshot.
    sessionDrafts: {
      materials: session.materials
        .filter((material) =>
          session.status[material.id] !== "saved" ||
          !sameValue(notebook.stores.materials.find((item) => item.key === material.id)?.value, material),
        )
        .map((material) => ({
          material: structuredClone(material),
          saveStatus: session.status[material.id] ?? "unknown",
        })),
      ...(canvasDraft ? { canvasNote: structuredClone(canvasDraft) } : {}),
    },
    sessionPreferences: {
      settings: structuredClone(session.settings),
      windows: structuredClone(session.windows),
      tourSeen: readTourSeen(),
    },
  };
}
