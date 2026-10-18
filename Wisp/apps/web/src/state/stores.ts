import type { JointDraft } from "../domain/joint";
import { create } from "zustand";
import {
  loadExcerptPreference,
  visitedForProposal,
  reconcile,
  setProposalsEnabled,
} from "../services/proposal-runtime";
import {
  defaultSettings,
  initialWindows,
  snapshot,
  type ActionDraft,
  type Material,
  type MaterialSnapshot,
  type SelectionContext,
  type Settings,
  type WindowState,
} from "../domain/model";
import { createRepository } from "../services/repository";
const repository = createRepository();
const materialChannel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("wisp-materials");
type SaveStatus = "已保存" | "待保存" | "保存中" | "保存失败";
interface Documents {
  materials: Material[];
  ready: boolean;
  fatal: string;
  status: Record<string, SaveStatus>;
  errors: Record<string, string>;
  edit: (id: string, field: "text" | "title", value: string) => void;
}
const savedVersions: Record<string, number> = {};
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
const saving = new Set<string>();
export const useDocuments = create<Documents>((set, get) => ({
  materials: [],
  ready: false,
  fatal: "",
  status: {},
  errors: {},
  edit(id, field, value) {
    const m = get().materials.find((m) => m.id === id);
    if (!m || m[field] === value) return;
    set({
      materials: get().materials.map((m) =>
        m.id === id
          ? {
              ...m,
              [field]: value,
              version: m.version + 1,
              updatedAt: new Date().toISOString(),
            }
          : m,
      ),
      status: { ...get().status, [id]: "待保存" },
    });
    useInteraction.setState({
      selection: undefined,
      selectionError: undefined,
    });
    reconcile(true, get().materials);
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => {
      void saveDocument(id);
    }, 350);
  },
}));
export async function saveDocument(id: string) {
  if (saving.has(id) || useDocuments.getState().errors[id]) return;
  saving.add(id);
  try {
    while (true) {
      const m = useDocuments.getState().materials.find((x) => x.id === id);
      if (!m || m.version === savedVersions[id]) break;
      useDocuments.setState((s) => ({
        status: { ...s.status, [id]: "保存中" },
      }));
      await repository.saveMaterial(m, savedVersions[id]);
      savedVersions[id] = m.version;
      materialChannel?.postMessage("changed");
    }
    useDocuments.setState((s) => ({ status: { ...s.status, [id]: "已保存" } }));
  } catch (e) {
    useDocuments.setState((s) => ({
      errors: {
        ...s.errors,
        [id]:
          e instanceof Error
            ? e.message
            : "本机保存失败，请复制正文备份后重试。",
      },
      status: { ...s.status, [id]: "保存失败" },
    }));
  } finally {
    saving.delete(id);
  }
}
export function retrySave(id: string) {
  useDocuments.setState((s) => ({ errors: { ...s.errors, [id]: "" } }));
  void saveDocument(id);
}
// Existing editors and pending/failed drafts retain their local version and conflict protection.
export function adoptMaterials(incoming: Material[]) {
  const current = useDocuments.getState();
  const openIds = new Set(
    useWorkspace.getState().windows.map((w) => w.materialId),
  );
  const incomingById = new Map(incoming.map((m) => [m.id, m]));
  let changed = false;
  const materials = current.materials.map((m) => {
    const next = incomingById.get(m.id);
    if (
      !next ||
      openIds.has(m.id) ||
      current.status[m.id] !== "已保存" ||
      current.errors[m.id] ||
      next.version <= m.version
    )
      return m;
    savedVersions[m.id] = next.version;
    changed = true;
    return next;
  });
  const added = incoming.filter(
    (m) => !current.materials.some((x) => x.id === m.id),
  );
  if (!changed && !added.length) return;
  for (const m of added) savedVersions[m.id] = m.version;
  useDocuments.setState({
    materials: [...materials, ...added],
    status: {
      ...current.status,
      ...Object.fromEntries(added.map((m) => [m.id, "已保存" as const])),
    },
  });
  reconcile(true, useDocuments.getState().materials);
}
export function openMaterial(id: string) {
  const m = useDocuments.getState().materials.find((m) => m.id === id);
  if (!m) return;
  const state = useWorkspace.getState();
  if (!state.windows.some((w) => w.materialId === id)) {
    const fallback = initialWindows([m])[0];
    const offset = (state.windows.length % 6) * 28;
    useWorkspace.setState({
      windows: [
        ...state.windows,
        { ...fallback, x: 44 + offset, y: 48 + offset },
      ],
    });
  }
  useWorkspace.getState().activate("window-" + id);
  useInteraction.setState({ selection: undefined, selectionError: undefined });
}
export function prepareMaterial(id: string, entry: ActionDraft["entry"]) {
  const m = useDocuments.getState().materials.find((m) => m.id === id);
  if (!m) throw new Error("材料不可用，请刷新材料列表");
  useInteraction.setState({
    cauldron: false,
    menu: false,
    book: false,
    selection: undefined,
    selectionError: undefined,
    draft: {
      entry,
      ...(entry !== "summon" ? { presentation: "brewing" as const } : {}),
      snapshot: snapshot(m),
      instruction: "",
      familiar: "page_sprite",
    },
  });
}
interface Workspace {
  windows: WindowState[];
  active: string;
  error: string;
  activate: (id: string) => void;
  move: (id: string, patch: Partial<WindowState>) => void;
}
let layoutTimer: ReturnType<typeof setTimeout>;
function persistLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    void repository
      .writePreference("windows", useWorkspace.getState().windows)
      .catch(() => useWorkspace.setState({ error: "窗口布局保存失败" }));
  }, 150);
}
export const useWorkspace = create<Workspace>((set, get) => ({
  windows: [],
  active: "window-proposal",
  error: "",
  activate(id) {
    const previous = get().active;
    const z = Math.max(0, ...get().windows.map((w) => w.z)) + 1;
    set({
      active: id,
      windows: get().windows.map((w) =>
        w.id === id ? { ...w, minimized: false, z } : w,
      ),
    });
    persistLayout();
    if (previous !== id) {
      const materialId = get().windows.find((w) => w.id === id)?.materialId;
      if (materialId)
        visitedForProposal(materialId, useDocuments.getState().materials);
    }
  },
  move(id, patch) {
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    });
    persistLayout();
  },
}));
interface Interaction {
  batchDraft?: import("../domain/batch").BatchDraft;
  canvas: boolean;
  selection?: SelectionContext;
  selectionError?: { materialId: string; message: string };
  cauldron: boolean;
  menu: boolean;
  book: boolean;
  bookTab: string;
  draft?: ActionDraft;
  jointDraft?: JointDraft;
  watchDraft?: MaterialSnapshot;
  settings: Settings;
  settingsStatus: string;
  message: string;
  open: (entry: ActionDraft["entry"]) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}
let settingsQueue = Promise.resolve();
export const useInteraction = create<Interaction>((set, get) => ({
  canvas: false,
  cauldron: false,
  menu: false,
  book: false,
  bookTab: "Getting started",
  settings: defaultSettings,
  settingsStatus: "",
  message: "",
  open(entry) {
    const w = useWorkspace
      .getState()
      .windows.find(
        (w) => w.id === useWorkspace.getState().active && !w.minimized,
      );
    const m = useDocuments
      .getState()
      .materials.find((m) => m.id === w?.materialId);
    if (!m) {
      set({ message: "请先打开并选择一份文档", menu: false });
      return;
    }
    if (get().selectionError?.materialId === m.id) {
      set({ message: get().selectionError!.message, menu: false });
      return;
    }
    try {
      const selection =
        get().selection?.materialId === m.id ? get().selection : undefined;
      set({
        menu: false,
        message: "",
        draft: {
          entry,
          snapshot: snapshot(m, selection),
          instruction: "",
          familiar: "page_sprite",
        },
      });
    } catch (e) {
      set({ menu: false, message: String(e) });
    }
  },
  updateSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next, settingsStatus: "设置保存中" });
    setProposalsEnabled(next.helpfulProposals);
    settingsQueue = settingsQueue
      .then(() => repository.writePreference("settings", next))
      .then(() => set({ settingsStatus: "设置已保存" }))
      .catch(() => set({ settingsStatus: "设置保存失败" }));
  },
}));
let boot: Promise<void> | undefined;
export function initialize() {
  return (boot ??= (async () => {
    try {
      const materials = await repository.initialize();
      for (const m of materials) savedVersions[m.id] = m.version;
      const persisted =
        await repository.readPreference<WindowState[]>("windows");
      const windowMaterials = materials.filter(
        (m) =>
          !m.createdAt ||
          (Array.isArray(persisted) &&
            persisted.some((w) => w.materialId === m.id)),
      );
      const windows = initialWindows(windowMaterials).map((fallback) => {
        const saved = Array.isArray(persisted)
          ? persisted.find((w) => w.materialId === fallback.materialId)
          : undefined;
        return saved &&
          [saved.x, saved.y, saved.width, saved.height, saved.z].every(
            Number.isFinite,
          )
          ? {
              ...fallback,
              ...saved,
              id: fallback.id,
              materialId: fallback.materialId,
              width: Math.max(340, saved.width),
              height: Math.max(300, saved.height),
            }
          : fallback;
      });
      useWorkspace.setState({
        windows,
        active:
          windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]
            ?.id ?? "",
      });
      const settings = await repository.readPreference<Settings>("settings");
      if (
        settings &&
        typeof settings.characterVisible === "boolean" &&
        typeof settings.reducedMotion === "boolean" &&
        typeof settings.helpfulProposals === "boolean" &&
        Number.isFinite(settings.characterSize)
      )
        useInteraction.setState({
          settings: {
            ...settings,
            idleRhythm: settings.idleRhythm === "lively" ? "lively" : "default",
            characterSize: Math.max(32, Math.min(72, settings.characterSize)),
          },
        });
      await loadExcerptPreference();
      setProposalsEnabled(useInteraction.getState().settings.helpfulProposals);
      useDocuments.setState({
        materials,
        ready: true,
        status: Object.fromEntries(materials.map((m) => [m.id, "已保存"])),
      });
    } catch (error) {
      useDocuments.setState({
        fatal:
          error instanceof Error
            ? error.message
            : "无法打开本机存储。请检查浏览器存储权限后重新载入；为避免丢失内容，当前不进入编辑。",
      });
    }
  })());
}
