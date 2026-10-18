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
import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import { seeds, selectText, type Material } from "../domain/model";
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
              "存储升级被其他 Wisp 标签页阻塞。请先保存或复制那些页面中的草稿，再关闭其他 Wisp 标签页并重新载入。",
            ),
          );
        },
        blocking() {
          void opening.then((database) => database.close());
        },
      });
      void opening.then((database) => {
        if (wasBlocked) database.close();
        else resolve(database);
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
        throw new Error("材料标识已对应不同内容，未覆盖原材料。");
      if (!existing && !material) throw new Error("材料不存在。");
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
            throw new Error("副本来源或范围无效，请重新选择原文后重试。");
          const original = await materials.get(copy.materialId);
          if (
            !original ||
            original.version !== copy.materialVersion ||
            original.title !== copy.title ||
            original.source !== copy.source ||
            original.text.slice(copy.start, copy.end) !== material.text
          )
            throw new Error(
              "原文已变化或移除。请取消新增，备份未保存的正文后重新载入页面，再创建副本。",
            );
          selectText(original, copy.start, copy.end);
          if (
            material.source === "document_copy" &&
            (copy.start !== 0 || copy.end !== original.text.length)
          )
            throw new Error("全文副本范围无效，请重新选择原文后重试。");
        }
      }
      const entry = await entries.get(materialId);
      if (!entry && (await entries.count()) >= 12)
        throw new Error("灵感熔炉最多容纳 12 份材料，请先移出一份。");
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
        throw new Error("便笺内容或位置无效，未保存。");
      const tx = (await getDb()).transaction("canvasNotes", "readwrite");
      try {
        const previous = await tx.store.get(frozen.id);
        if (
          expectedRevision === null
            ? !!previous
            : !previous || previous.revision !== expectedRevision
        )
          throw new Error(
            "保存冲突：其他标签页已修改或移除此便笺。请复制草稿后重新载入白板。",
          );
        const changed =
          previous &&
          (previous.title !== frozen.title || previous.text !== frozen.text);
        if (
          frozen.revision !== (previous ? previous.revision + 1 : 1) ||
          frozen.version !==
            (previous ? previous.version + (changed ? 1 : 0) : 1)
        )
          throw new Error("便笺版本不匹配，未保存。请重新载入白板后重试。");
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
            "删除冲突：其他标签页已修改或移除此便笺。请重新载入白板后确认。",
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
        throw new Error("只有已确认的有效候选关系才能保留。");
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
          throw new Error("便笺已变化或移除，此候选已失效。请重新寻找联系。");
        const existing = await connections.get(result.id);
        if (existing) {
          const { savedAt: previousSavedAt, ...previous } = existing;
          if (!sameValue(previous, result))
            throw new Error("提交标识已用于其他关系，未覆盖已有关系。");
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
        (x) => x.materialId === w.materialId && x.status === "active",
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
            ? "这份文本已经在关注中"
            : "材料已变化或尚未保存，请更新范围后确认",
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
      if (w?.status === "active") {
        await tx.objectStore("watches").put({
          ...w,
          status,
          updatedAt: new Date().toISOString(),
          notice:
            status === "stopped"
              ? "已停止，不再创建检查"
              : "发起页面已结束，请重新确认后关注",
        });
        for (const task of await tx.objectStore("tasks").getAll()) {
          if (
            task.watchId === id &&
            (task.status === "queued" || task.status === "running")
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
            (t.status === "queued" || t.status === "running"),
        )
      ) {
        await tx.done;
        return undefined;
      }
      await tx.objectStore("tasks").add(task);
      await tx.objectStore("watches").put({
        ...w,
        lastVersion: task.snapshot.materialVersion,
        notice: "已委托版本 " + task.snapshot.materialVersion + "，请查看回信",
        updatedAt: new Date().toISOString(),
      });
      await tx.done;
      return task;
    },
    async enqueueTask(task: Task): Promise<Task> {
      task = structuredClone(task);
      if (isBatchTask(task) ? !validBatchTask(task) : task.execution === "gemini" && !validGeminiTask(task))
        throw new Error("Gemini 仅允许角色与参数匹配的一次性任务");
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
        throw new Error("提交标识已对应另一份委托，请关闭后重新确认材料。");
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
        throw new Error("任务不存在");
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
        throw new Error("结果引用校验失败，未保存。");
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
        throw new Error("提交标识已用于其他操作，请重新确认材料。");
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
    async initialize() {
      const database = await getDb();
      const tx = database.transaction(
        ["materials", "preferences"],
        "readwrite",
      );
      if (!(await tx.objectStore("preferences").get("initialized"))) {
        for (const m of seeds()) {
          if (!(await tx.objectStore("materials").get(m.id)))
            await tx.objectStore("materials").put(m);
        }
        await tx.objectStore("preferences").put(true, "initialized");
      }
      const result = await tx.objectStore("materials").getAll();
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
          "保存冲突：其他标签页已修改此文档。请复制当前内容后重新载入。",
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
