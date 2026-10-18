import type { CauldronEntry } from "../domain/cauldron";
import { isBatchRecord, validateBatch } from "../domain/batch";
import {
  connectionIsCurrent,
  validateCanvasNote,
  validateConnectionResult,
  type CanvasNote,
  type SavedConnection,
} from "../domain/canvas";
import type { Watch } from "../domain/watch";
import {
  validateJoint,
  jointIdentity,
  type StoredRecord,
} from "../domain/joint";
import {
  transition,
  isBatchTask,
  validBatchTask,
  validGeminiTask,
  type Task,
  type SingleTask,
  type TaskAction,
} from "../domain/task";
import { openDB, deleteDB, type IDBPDatabase, type DBSchema } from "idb";
import { seeds, selectText, type Material } from "../domain/model";
import {
  DEEP_SPACE_SEED_MIGRATION_KEY,
  ENGLISH_SEED_MIGRATION_KEY,
  migrateEnglishDemoSeed,
  migrateLegacySeed,
} from "../domain/seed-migration";
import { type CheckRecord } from "../domain/check";
import { validateProcessing, sameValue } from "../domain/processing";
interface WispDB extends DBSchema {
  materials: { key: string; value: Material };
  cauldronEntries: { key: string; value: CauldronEntry };
  preferences: { key: string; value: unknown };
  checks: { key: string; value: StoredRecord };
  tasks: { key: string; value: Task };
  watches: { key: string; value: Watch };
  canvasNotes: { key: string; value: CanvasNote };
  canvasConnections: { key: string; value: SavedConnection };
}
const connections = new Map<string, Set<IDBPDatabase<WispDB>>>();
const resetting = new Set<string>();
const resetChannel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("wisp-workspace-reset") : undefined;
const taskChannel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("wisp-local-tasks") : undefined;
function haltStorage(name: string, remote: boolean) {
  resetting.add(name);
  for (const database of connections.get(name) ?? []) database.close();
  connections.delete(name);
  if (typeof window !== "undefined" && name === "wisp-module-one")
    document.documentElement.dataset.workspaceReset = "true";
  if (typeof window !== "undefined" && name === "wisp-module-one")
    window.dispatchEvent(new CustomEvent("wisp:workspace-reset", { detail: { remote } }));
}
if (resetChannel) resetChannel.onmessage = (event) => {
  if (event.data?.kind === "reset" && event.data.name === "wisp-module-one")
    haltStorage(event.data.name, true);
};
const notebookStores = ["materials", "cauldronEntries", "preferences", "checks", "tasks", "watches", "canvasNotes", "canvasConnections"] as const;
export interface Notebook {
  format: "wisp-notebook";
  version: 1;
  exportedAt: string;
  stores: Record<string, { key: IDBValidKey; value: unknown }[]>;
}
function materialIdentity(m: Material): string {
  const o = m.origin;
  return JSON.stringify([
    m.id,
    m.kind,
    m.title,
    m.text,
    m.version,
    m.source,
    m.createdAt,
    m.updatedAt,
    o
      ? [
          o.kind,
          o.addedAt,
          o.note,
          o.fileName,
          o.byteSize,
          o.lastModified,
          o.encoding,
          o.copy
            ? [
                o.copy.materialId,
                o.copy.materialVersion,
                o.copy.title,
                o.copy.start,
                o.copy.end,
                o.copy.source,
              ]
            : null,
        ]
      : null,
  ]);
}
export function createRepository(name = "wisp-module-one") {
  let pending: Promise<IDBPDatabase<WispDB>> | undefined;
  function getDb() {
    if (resetting.has(name)) return Promise.reject<IDBPDatabase<WispDB>>(new Error("The workspace is being reset. Reload after the reset finishes."));
    return (pending ??= new Promise<IDBPDatabase<WispDB>>((resolve, reject) => {
      let wasBlocked = false;
      const opening = openDB<WispDB>(name, 9, {
        upgrade(database) {
          if (!database.objectStoreNames.contains("canvasNotes"))
            database.createObjectStore("canvasNotes", { keyPath: "id" });
          if (!database.objectStoreNames.contains("canvasConnections"))
            database.createObjectStore("canvasConnections", { keyPath: "id" });
          if (!database.objectStoreNames.contains("cauldronEntries"))
            database.createObjectStore("cauldronEntries", {
              keyPath: "materialId",
            });
          if (!database.objectStoreNames.contains("watches"))
            database.createObjectStore("watches", { keyPath: "id" });
          if (!database.objectStoreNames.contains("tasks"))
            database.createObjectStore("tasks", { keyPath: "id" });
          if (!database.objectStoreNames.contains("materials"))
            database.createObjectStore("materials", { keyPath: "id" });
          if (!database.objectStoreNames.contains("preferences"))
            database.createObjectStore("preferences");
          if (!database.objectStoreNames.contains("checks"))
            database.createObjectStore("checks", { keyPath: "id" });
        },
        blocked() {
          wasBlocked = true;
          reject(
            new Error(
              "A storage upgrade is blocked by another Wisp tab. Save or copy drafts in the other tabs, close them, then reload this page.",
            ),
          );
        },
        blocking() {
          void opening.then((database) => database.close());
        },
      });
      void opening.then((database) => {
        if (wasBlocked || resetting.has(name)) {
          database.close();
          reject(new Error("The workspace is being reset. Reload after the reset finishes."));
        } else {
          const opened = connections.get(name) ?? new Set<IDBPDatabase<WispDB>>();
          opened.add(database);
          connections.set(name, opened);
          resolve(database);
        }
      }, reject);
    }));
  }
  async function addEntry(
    materialId: string,
    material?: Material,
  ): Promise<Material | undefined> {
    const tx = (await getDb()).transaction(
      ["materials", "cauldronEntries"],
      "readwrite",
    );
    try {
      const materials = tx.objectStore("materials");
      const entries = tx.objectStore("cauldronEntries");
      const existing = await materials.get(materialId);
      if (
        existing &&
        material &&
        materialIdentity(existing) !== materialIdentity(material)
      )
        throw new Error("This material ID is already associated with different content. The original material was not overwritten.");
      if (!existing && !material) throw new Error("Material not found.");
      if (!existing && material) {
        const origin = material.origin;
        if (
          material.source === "document_copy" ||
          material.source === "selection_copy" ||
          origin?.kind === "document_copy" ||
          origin?.kind === "selection_copy" ||
          origin?.copy
        ) {
          const copy = origin?.copy;
          if (
            !copy ||
            (material.source !== "document_copy" &&
              material.source !== "selection_copy") ||
            origin?.kind !== material.source
          )
            throw new Error("The copy source or range is invalid. Select the source text again and retry.");
          const original = await materials.get(copy.materialId);
          if (
            !original ||
            original.version !== copy.materialVersion ||
            original.title !== copy.title ||
            original.source !== copy.source ||
            original.text.slice(copy.start, copy.end) !== material.text
          )
            throw new Error(
              "The source text changed or was removed. Cancel the addition, back up any unsaved text, reload the page, then create the copy again.",
            );
          selectText(original, copy.start, copy.end);
          if (
            material.source === "document_copy" &&
            (copy.start !== 0 || copy.end !== original.text.length)
          )
            throw new Error("The full-text copy range is invalid. Select the source text again and retry.");
        }
      }
      const entry = await entries.get(materialId);
      if (!entry && (await entries.count()) >= 12)
        throw new Error("The Inspiration Cauldron can hold up to 12 materials. Remove one first.");
      if (!existing && material) await materials.add(material);
      if (!entry)
        await entries.add({ materialId, addedAt: new Date().toISOString() });
      await tx.done;
      return existing ?? material;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  return {
    async exportNotebook(): Promise<Notebook> {
      const tx = (await getDb()).transaction([...notebookStores], "readonly");
      const stores: Notebook["stores"] = {};
      await Promise.all(notebookStores.map(async (name) => {
        const store = tx.objectStore(name);
        const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
        stores[name] = keys.map((key, i) => ({ key, value: values[i] }));
      }));
      await tx.done;
      return { format: "wisp-notebook", version: 1, exportedAt: new Date().toISOString(), stores };
    },
    async resetNotebook(onBlocked?: () => void): Promise<void> {
      if (resetting.has(name)) throw new Error("A reset is already in progress. Reload after it finishes.");
      haltStorage(name, false);
      resetChannel?.postMessage({ kind: "reset", name });
      // Deletion waits for all existing transactions/connections. Old instances stay
      // read-only until reload, so late task replies cannot recreate removed data.
      await deleteDB(name, { blocked: onBlocked });
    },
    async listCanvasNotes(): Promise<CanvasNote[]> {
      return (await (await getDb()).getAll("canvasNotes")).sort((a, b) =>
        a.id.localeCompare(b.id),
      );
    },
    async listCanvasConnections(): Promise<SavedConnection[]> {
      return (await (await getDb()).getAll("canvasConnections")).sort(
        (a, b) =>
          b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id),
      );
    },
    async saveCanvasNote(
      note: CanvasNote,
      expectedRevision: number | null,
    ): Promise<CanvasNote> {
      const frozen = structuredClone(note);
      if (!validateCanvasNote(frozen))
        throw new Error("The note content or position is invalid. It was not saved.");
      const tx = (await getDb()).transaction("canvasNotes", "readwrite");
      try {
        const previous = await tx.store.get(frozen.id);
        if (
          expectedRevision === null
            ? !!previous
            : !previous || previous.revision !== expectedRevision
        )
          throw new Error(
            "Save conflict: another tab changed or removed this note. Copy your draft, then reload the canvas.",
          );
        const changed =
          previous &&
          (previous.title !== frozen.title || previous.text !== frozen.text);
        if (
          frozen.revision !== (previous ? previous.revision + 1 : 1) ||
          frozen.version !==
            (previous ? previous.version + (changed ? 1 : 0) : 1)
        )
          throw new Error("Note version mismatch. It was not saved. Reload the canvas and try again.");
        await tx.store.put(frozen);
        await tx.done;
        return frozen;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* The transaction may already have aborted. */
        }
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async deleteCanvasNote(
      id: string,
      expectedRevision: number,
    ): Promise<void> {
      const tx = (await getDb()).transaction(
        ["canvasNotes", "canvasConnections"],
        "readwrite",
      );
      try {
        const notes = tx.objectStore("canvasNotes"),
          connections = tx.objectStore("canvasConnections");
        const previous = await notes.get(id);
        if (!previous || previous.revision !== expectedRevision)
          throw new Error(
            "Delete conflict: another tab changed or removed this note. Reload the canvas and confirm again.",
          );
        for (const record of await connections.getAll())
          if (record.notes.some((note) => note.id === id))
            await connections.delete(record.id);
        await notes.delete(id);
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* The transaction may already have aborted. */
        }
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async saveCanvasConnection(
      record: SavedConnection,
    ): Promise<SavedConnection> {
      const frozen = structuredClone(record);
      const { savedAt, ...result } = frozen;
      validateConnectionResult(result, { id: result.id, notes: result.notes });
      if (
        !result.connections.length ||
        typeof savedAt !== "string" ||
        !Number.isFinite(Date.parse(savedAt))
      )
        throw new Error("Only a confirmed, valid connection candidate can be kept.");
      const tx = (await getDb()).transaction(
        ["canvasNotes", "canvasConnections"],
        "readwrite",
      );
      try {
        const notes = tx.objectStore("canvasNotes"),
          connections = tx.objectStore("canvasConnections");
        const current = await Promise.all(
          result.notes.map((note) => notes.get(note.id)),
        );
        if (
          !connectionIsCurrent(
            result,
            current.filter((note): note is CanvasNote => !!note),
          )
        )
          throw new Error("A note changed or was removed, so this candidate is no longer valid. Find the connection again.");
        const existing = await connections.get(result.id);
        if (existing) {
          const { savedAt: previousSavedAt, ...previous } = existing;
          if (!sameValue(previous, result))
            throw new Error("This submission ID has already been used for another connection. The existing connection was not overwritten.");
          await tx.done;
          return existing;
        }
        const duplicate = (await connections.getAll()).find((saved) =>
          result.notes.every((note) =>
            saved.notes.some((other) => sameValue(other, note)),
          ),
        );
        if (!duplicate) await connections.add(frozen);
        await tx.done;
        return duplicate ?? frozen;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* The transaction may already have aborted. */
        }
        await tx.done.catch(() => {});
        throw error;
      }
    },
    async deleteCanvasConnection(id: string): Promise<void> {
      await (await getDb()).delete("canvasConnections", id);
    },
    async listMaterials(): Promise<Material[]> {
      return (await getDb()).getAll("materials");
    },
    async listCauldronEntries(): Promise<CauldronEntry[]> {
      return (await (await getDb()).getAll("cauldronEntries")).sort(
        (a, b) =>
          a.addedAt.localeCompare(b.addedAt) ||
          a.materialId.localeCompare(b.materialId),
      );
    },
    async createCauldronMaterial(material: Material): Promise<Material> {
      const frozen = structuredClone(material);
      return (await addEntry(frozen.id, frozen))!;
    },
    async addCauldronEntry(materialId: string): Promise<void> {
      await addEntry(materialId);
    },
    async removeCauldronEntry(materialId: string): Promise<void> {
      await (await getDb()).delete("cauldronEntries", materialId);
    },
    async startWatch(w: Watch) {
      const tx = (await getDb()).transaction(
        ["watches", "materials"],
        "readwrite",
      );
      const m = await tx.objectStore("materials").get(w.materialId);
      const active = (await tx.objectStore("watches").getAll()).some(
        (x) => x.materialId === w.materialId && (x.status === "active" || x.status === "paused"),
      );
      if (
        active ||
        !m ||
        m.version !== w.baseline.materialVersion ||
        m.text !== w.baseline.text ||
        m.title !== w.baseline.title
      ) {
        await tx.done;
        throw new Error(
          active
            ? "This text is already being watched."
            : "The material changed or has not been saved. Update the scope and confirm again.",
        );
      }
      await tx.objectStore("watches").add(w);
      await tx.done;
      return w;
    },
    async listWatches() {
      return (await (await getDb()).getAll("watches")).sort((a, b) =>
        b.confirmedAt.localeCompare(a.confirmedAt),
      );
    },
    async pauseWatch(id: string): Promise<Watch> {
      const tx = (await getDb()).transaction(["watches", "tasks"], "readwrite");
      const previous = await tx.objectStore("watches").get(id);
      if (!previous || !["active", "paused"].includes(previous.status)) {
        await tx.done;
        throw new Error("This watch can no longer be paused.");
      }
      const paused: Watch = { ...previous, status: "paused", updatedAt: new Date().toISOString(), notice: "Paused. No new checks will start until you continue." };
      await tx.objectStore("watches").put(paused);
      for (const task of await tx.objectStore("tasks").getAll())
        if (task.watchId === id && (task.status === "queued" || task.status === "running"))
          await tx.objectStore("tasks").put(transition(task, { type: "pause" }));
      await tx.done;
      taskChannel?.postMessage("changed");
      return paused;
    },
    async resumeWatch(id: string): Promise<Watch> {
      const tx = (await getDb()).transaction(["watches", "materials"], "readwrite");
      const previous = await tx.objectStore("watches").get(id);
      if (!previous || previous.status !== "paused" ||
          !(await tx.objectStore("materials").get(previous.materialId)) ||
          (await tx.objectStore("watches").getAll()).some((w) => w.id !== id && w.materialId === previous.materialId && (w.status === "active" || w.status === "paused"))) {
        await tx.done;
        throw new Error("The watch cannot continue: its source is missing or another watch owns this material.");
      }
      const active: Watch = { ...previous, status: "active", updatedAt: new Date().toISOString(), notice: "Watching again. Checking for a newly saved version." };
      await tx.objectStore("watches").put(active);
      await tx.done;
      return active;
    },
    async readMaterial(id: string) {
      return (await getDb()).get("materials", id);
    },
    async noteWatch(id: string, version: number, notice: string) {
      const tx = (await getDb()).transaction("watches", "readwrite");
      const w = await tx.store.get(id);
      if (w?.status === "active")
        await tx.store.put({
          ...w,
          lastVersion: Math.max(version, w.lastVersion),
          notice,
          updatedAt: new Date().toISOString(),
        });
      await tx.done;
    },
    async endWatch(id: string, status: "stopped" | "interrupted") {
      const tx = (await getDb()).transaction(["watches", "tasks"], "readwrite");
      const w = await tx.objectStore("watches").get(id);
      if (w?.status === "active" || (status === "stopped" && w?.status === "paused")) {
        await tx.objectStore("watches").put({
          ...w,
          status,
          updatedAt: new Date().toISOString(),
          notice:
            status === "stopped"
              ? "Stopped. No further checks will be created."
              : "The initiating page has closed. Confirm again to start watching.",
        });
        for (const task of await tx.objectStore("tasks").getAll()) {
          if (
            task.watchId === id &&
            (task.status === "queued" || task.status === "running" || task.status === "paused")
          )
            await tx.objectStore("tasks").put(
              transition(task, {
                type: status === "stopped" ? "cancel" : "interrupt",
              }),
            );
        }
      }
      await tx.done;
    },
    async enqueueWatchTask(task: SingleTask): Promise<SingleTask | undefined> {
      if (isBatchTask(task)) return undefined;
      const tx = (await getDb()).transaction(
        ["watches", "tasks", "materials"],
        "readwrite",
      );
      const w = task.watchId
        ? await tx.objectStore("watches").get(task.watchId)
        : undefined;
      const m = await tx.objectStore("materials").get(task.snapshot.materialId);
      if (
        !w ||
        w.status !== "active" ||
        w.materialId !== task.snapshot.materialId ||
        w.lastVersion >= task.snapshot.materialVersion ||
        task.execution === "gemini" ||
        task.operation !== "check" ||
        task.familiar !== "scout_bat" ||
        !m ||
        m.version !== task.snapshot.materialVersion ||
        m.text !== task.snapshot.text ||
        m.title !== task.snapshot.title ||
        (await tx.objectStore("tasks").getAll()).some(
          (t) =>
            t.watchId === w.id &&
            (t.status === "queued" || t.status === "running" || t.status === "paused"),
        )
      ) {
        await tx.done;
        return undefined;
      }
      await tx.objectStore("tasks").add(task);
      await tx.objectStore("watches").put({
        ...w,
        lastVersion: task.snapshot.materialVersion,
        notice: "Delegated version " + task.snapshot.materialVersion + "; check the reply.",
        updatedAt: new Date().toISOString(),
      });
      await tx.done;
      return task;
    },
    async enqueueTask(task: Task): Promise<Task> {
      task = structuredClone(task);
      if (isBatchTask(task) ? !validBatchTask(task) : task.execution === "gemini" && !validGeminiTask(task))
        throw new Error("Gemini supports only one-time tasks with matching roles and parameters.");
      const tx = (await getDb()).transaction("tasks", "readwrite");
      const existing = await tx.store.get(task.id);
      if (
        existing &&
        (isBatchTask(existing) !== isBatchTask(task) ||
          (existing.execution ?? "local") !== (task.execution ?? "local") ||
          existing.familiar !== task.familiar ||
          existing.operation !== task.operation ||
          existing.summaryStyle !== task.summaryStyle ||
          existing.watchId !== task.watchId ||
          (task.execution !== "gemini" &&
            (existing.excerptLimit ?? 8) !== (task.excerptLimit ?? 8)) ||
          existing.instruction !== task.instruction ||
          !sameValue(isBatchTask(existing) ? existing.snapshots : existing.snapshot,
            isBatchTask(task) ? task.snapshots : task.snapshot))
      ) {
        await tx.done;
        throw new Error("This submission ID is already associated with another task. Close and confirm the materials again.");
      }
      if (!existing) await tx.store.add(task);
      await tx.done;
      return existing ?? task;
    },
    async listTasks() {
      return (await (await getDb()).getAll("tasks")).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },
    async changeTask(id: string, action: TaskAction): Promise<Task> {
      const tx = (await getDb()).transaction("tasks", "readwrite");
      const previous = await tx.store.get(id);
      if (!previous) {
        await tx.done;
        throw new Error("Task not found.");
      }
      let next: Task;
      try {
        next = transition(previous, action);
      } catch (error) {
        await tx.done;
        throw error;
      }
      if (next !== previous) await tx.store.put(next);
      await tx.done;
      return next;
    },
    async saveRecord<T extends StoredRecord>(record: T): Promise<T> {
      record = structuredClone(record);
      if (
        !(isBatchRecord(record) ? validateBatch(record) : record.operation === "joint"
          ? validateJoint(record)
          : validateProcessing(record))
      )
        throw new Error("Result citation validation failed. The result was not saved.");
      const tx = (await getDb()).transaction("checks", "readwrite");
      const existing = await tx.store.get(record.id);
      if (
        existing &&
        (isBatchRecord(existing) !== isBatchRecord(record) ||
          existing.execution !== record.execution ||
          (existing.execution === "gemini" &&
            record.execution === "gemini" &&
            (existing.instruction !== record.instruction ||
              !sameValue(isBatchRecord(existing) ? existing.snapshots : existing.snapshot,
                isBatchRecord(record) ? record.snapshots : record.snapshot))) ||
          existing.operation !== record.operation ||
          (existing.operation === "joint" &&
            record.operation === "joint" &&
            jointIdentity(existing) !== jointIdentity(record)) ||
          (existing.operation === "understand" &&
            record.operation === "understand" &&
            (existing.execution === "gemini" && record.execution === "gemini"
              ? existing.summaryStyle !== record.summaryStyle
              : existing.execution !== "gemini" &&
                record.execution !== "gemini" &&
                (existing.excerptLimit ?? 8) !== (record.excerptLimit ?? 8))))
      ) {
        await tx.done;
        throw new Error("This submission ID has already been used for another operation. Confirm the materials again.");
      }
      if (!existing) await tx.store.add(record);
      await tx.done;
      return (existing ?? record) as T;
    },
    async saveCheck(record: CheckRecord): Promise<CheckRecord> {
      return (await this.saveRecord(record)) as CheckRecord;
    },
    async listChecks() {
      return (await this.listRecords()).filter(
        (r): r is CheckRecord => !isBatchRecord(r) && r.operation === "check",
      );
    },
    async listRecords() {
      return (await (await getDb()).getAll("checks")).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },
    async ensureDesktopChecklist(): Promise<Material> {
      const tx = (await getDb()).transaction("materials", "readwrite");
      const id = "wisp-demo-checklist";
      const existing = await tx.store.get(id);
      if (existing) {
        const previousText =
          "Task\tOwner\tWhen\tStatus\nVenue confirmation\tLin\tNov 6\tTo confirm\nPoster deadline\tYao\tNov 10\tIn progress\nDoors open\tTeam\tNov 8\tNot started\nPrint materials\tUnassigned\tNov 7\tTo confirm";
        if (
          existing.kind === "text" &&
          existing.source === "virtual_document" &&
          existing.version === 1 &&
          !Object.prototype.hasOwnProperty.call(existing, "origin") &&
          !Object.prototype.hasOwnProperty.call(existing, "createdAt") &&
          existing.title === "Event checklist" &&
          existing.text === previousText
        ) {
          const migrated: Material = {
            ...existing,
            title: "Gameplay beats",
            text: "Beat\tOwner\tPlayer action\tNarrative effect\tStatus\nSignal calibration\tMara\tTune the receiver\tIntroduces signal-reading controls\tDraft\nFirst reply\tPlayer\tAnswer or stay silent\tSets the crew's first interpretation\tDraft\nFalse echo\tIvo\tCompare the echo with ship logs\tBuilds doubt about the signal\tOpen\nCrew trust\tPlayer\tShare or hide a fragment\tChanges an alliance and available help\tOpen\nFinal transmission\tPlayer\tChoose what to send\tResolves the chapter's immediate crisis\tOpen",
            version: 3,
            updatedAt: new Date().toISOString(),
          };
          await tx.store.put(migrated);
          await tx.done;
          return migrated;
        }
        await tx.done;
        return existing;
      }
      const material: Material = {
        id,
        kind: "text",
        source: "virtual_document",
        title: "Gameplay beats",
        text: "Beat\tOwner\tPlayer action\tNarrative effect\tStatus\nSignal calibration\tMara\tTune the receiver\tIntroduces signal-reading controls\tDraft\nFirst reply\tPlayer\tAnswer or stay silent\tSets the crew's first interpretation\tDraft\nFalse echo\tIvo\tCompare the echo with ship logs\tBuilds doubt about the signal\tOpen\nCrew trust\tPlayer\tShare or hide a fragment\tChanges an alliance and available help\tOpen\nFinal transmission\tPlayer\tChoose what to send\tResolves the chapter's immediate crisis\tOpen",
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      await tx.store.add(material);
      await tx.done;
      return material;
    },
    async initialize() {
      const database = await getDb();
      const tx = database.transaction(
        ["materials", "preferences"],
        "readwrite",
      );
      const materials = tx.objectStore("materials");
      const preferences = tx.objectStore("preferences");
      if (!(await preferences.get("initialized"))) {
        for (const m of seeds()) {
          if (!(await materials.get(m.id))) await materials.put(m);
        }
        await preferences.put(true, "initialized");
      }
      if (!(await preferences.get(ENGLISH_SEED_MIGRATION_KEY))) {
        const currentSeeds = seeds();
        const updatedAt = new Date().toISOString();
        for (const englishSeed of currentSeeds) {
          const migrated = migrateLegacySeed(
            await materials.get(englishSeed.id),
            englishSeed,
            updatedAt,
          );
          if (migrated) await materials.put(migrated);
        }
        await preferences.put(true, ENGLISH_SEED_MIGRATION_KEY);
      }
      if (!(await preferences.get(DEEP_SPACE_SEED_MIGRATION_KEY))) {
        const currentSeeds = seeds();
        const updatedAt = new Date().toISOString();
        for (const gameSeed of currentSeeds) {
          const migrated = migrateEnglishDemoSeed(
            await materials.get(gameSeed.id),
            gameSeed,
            updatedAt,
          );
          if (migrated) await materials.put(migrated);
        }
        await preferences.put(true, DEEP_SPACE_SEED_MIGRATION_KEY);
      }
      const result = await materials.getAll();
      await tx.done;
      return result;
    },
    async saveMaterial(material: Material, expectedVersion: number) {
      const database = await getDb();
      const tx = database.transaction("materials", "readwrite");
      const previous = await tx.store.get(material.id);
      if (!previous || previous.version !== expectedVersion) {
        await tx.done;
        throw new Error(
          "Save conflict: another tab changed this document. Copy the current content, then reload the page.",
        );
      }
      await tx.store.put(material);
      await tx.done;
    },
    async readPreference<T>(key: string): Promise<T | undefined> {
      return (await (await getDb()).get("preferences", key)) as T | undefined;
    },
    async writePreference(key: string, value: unknown) {
      await (await getDb()).put("preferences", value, key);
    },
  };
}
