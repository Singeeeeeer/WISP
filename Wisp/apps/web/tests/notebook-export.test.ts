import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import type { CanvasNote } from "../src/domain/canvas";
import { defaultSettings, seeds } from "../src/domain/model";
import { createRepository, type Notebook } from "../src/services/repository";
import {
  readTourSeen,
  setCanvasExportDraft,
  withNotebookSession,
} from "../src/services/notebook-export";

afterEach(() => {
  setCanvasExportDraft(undefined);
  vi.unstubAllGlobals();
});

const emptyNotebook = (): Notebook => ({
  format: "wisp-notebook",
  version: 1,
  exportedAt: new Date().toISOString(),
  stores: { materials: [], canvasNotes: [], preferences: [] },
});
const emptySession = () => ({
  materials: [],
  status: {},
  settings: { ...defaultSettings },
  windows: [],
});

it("keeps saved snapshots intact while exporting failed document and Canvas edits separately", async () => {
  const repository = createRepository("notebook-session-" + crypto.randomUUID());
  const materials = await repository.initialize();
  const original: CanvasNote = {
    id: "saved-note", title: "Saved note", text: "Saved Canvas text", x: 20, y: 30,
    version: 1, revision: 1, updatedAt: new Date().toISOString(),
  };
  await repository.saveCanvasNote(original, null);
  await repository.writePreference("settings", defaultSettings);
  await repository.writePreference("windows", []);
  const saved = await repository.exportNotebook();
  const savedCopy = structuredClone(saved);
  const currentMaterial = { ...materials[0], text: "Unsaved document 🦇", version: 2 };
  const draft = { original, title: "Unsaved title", text: "Unsaved Canvas text", x: 35, y: 40 };
  const settings = { ...defaultSettings, characterVisible: false };
  setCanvasExportDraft(draft);
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === "wisp-tour-seen" ? "true" : null });

  const exported = withNotebookSession(saved, {
    materials: [currentMaterial, materials[1]],
    status: { [currentMaterial.id]: "failed", [materials[1].id]: "saved" },
    settings,
    windows: [],
  });
  expect(exported.stores).toEqual(savedCopy.stores);
  expect(saved).toEqual(savedCopy);
  expect(exported.sessionDrafts.materials).toEqual([{ material: currentMaterial, saveStatus: "failed" }]);
  expect(exported.sessionDrafts.canvasNote).toEqual(draft);
  expect(exported.sessionPreferences).toEqual({ settings, windows: [], tourSeen: true });

  currentMaterial.text = "A later edit";
  draft.text = "A later Canvas edit";
  original.text = "A mutated component reference";
  settings.characterVisible = true;
  const downloaded = JSON.parse(JSON.stringify(exported));
  expect(downloaded.sessionDrafts.materials[0].material.text).toBe("Unsaved document 🦇");
  expect(downloaded.sessionDrafts.canvasNote.text).toBe("Unsaved Canvas text");
  expect(downloaded.sessionDrafts.canvasNote.original.text).toBe("Saved Canvas text");
  expect(downloaded.sessionPreferences.settings.characterVisible).toBe(false);
  expect((await repository.exportNotebook()).stores).toEqual(savedCopy.stores);
  await repository.resetNotebook();
});

it("exports a new Canvas draft without inventing a saved ID or revision and clears it when editing ends", () => {
  const draft = { title: "New idea", text: "Not saved yet", x: 28, y: 28 };
  setCanvasExportDraft(draft);
  const exported = withNotebookSession(emptyNotebook(), emptySession());
  expect(exported.sessionDrafts.canvasNote).toEqual(draft);
  expect(exported.sessionDrafts.canvasNote).not.toHaveProperty("id");
  expect(exported.sessionDrafts.canvasNote).not.toHaveProperty("version");
  expect(exported.sessionDrafts.canvasNote).not.toHaveProperty("revision");
  expect(exported.stores.canvasNotes).toEqual([]);
  setCanvasExportDraft(undefined);
  expect(withNotebookSession(emptyNotebook(), emptySession()).sessionDrafts).not.toHaveProperty("canvasNote");
  // Clearing the active editor must not change the backup already prepared.
  expect(exported.sessionDrafts.canvasNote).toEqual(draft);
});

it("omits an unchanged Canvas editor and includes pending, saving and differing session documents", () => {
  const original: CanvasNote = {
    id: "unchanged", title: "Saved", text: "Same text", x: 20, y: 30,
    version: 1, revision: 1, updatedAt: new Date().toISOString(),
  };
  setCanvasExportDraft({ original, title: original.title, text: original.text, x: original.x, y: original.y });
  const [seed] = seeds();
  const materials = ["pending", "saving", "saved"].map((status) => ({ ...seed, id: status }));
  const notebook = emptyNotebook();
  notebook.stores.materials = materials.map((material) => ({
    key: material.id,
    value: { ...material, text: "Different persisted text" },
  }));
  const exported = withNotebookSession(notebook, {
    ...emptySession(), materials, status: { pending: "pending", saving: "saving", saved: "saved" },
  });
  expect(exported.sessionDrafts.materials.map((entry) => entry.saveStatus)).toEqual(["pending", "saving", "saved"]);
  expect(exported.sessionDrafts).not.toHaveProperty("canvasNote");
});

it.each([["true", true], [null, false]])("exports the stored tour preference %s as %s", (stored, expected) => {
  vi.stubGlobal("localStorage", { getItem: () => stored });
  expect(readTourSeen()).toBe(expected);
  expect(withNotebookSession(emptyNotebook(), emptySession()).sessionPreferences.tourSeen).toBe(expected);
});

it("keeps the export usable and marks tour state unknown when browser preferences cannot be read", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("Storage blocked"); } });
  setCanvasExportDraft({ title: "Backup", text: "Keep this text", x: 0, y: 0 });
  const exported = withNotebookSession(emptyNotebook(), emptySession());
  expect(exported.sessionPreferences.tourSeen).toBeNull();
  expect(exported.sessionDrafts.canvasNote?.text).toBe("Keep this text");
});
