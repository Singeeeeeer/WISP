import { snapshot, type Material, type MaterialSnapshot } from "./model";
import { newTask, type Task } from "./task";
export interface Watch {
  id: string;
  materialId: string;
  title: string;
  baseline: MaterialSnapshot;
  lastVersion: number;
  status: "active" | "stopped" | "interrupted";
  confirmedAt: string;
  updatedAt: string;
  notice: string;
}
export function newWatch(s: MaterialSnapshot): Watch {
  if (
    s.start !== 0 ||
    s.end !== s.text.length ||
    !s.text.trim() ||
    s.text.length > 60000
  )
    throw new Error("关注范围必须是非空全文，最多 60,000 个 UTF-16 单元。");
  return {
    id: crypto.randomUUID(),
    materialId: s.materialId,
    title: s.title,
    baseline: { ...s },
    lastVersion: s.materialVersion,
    status: "active",
    confirmedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notice: "等待已保存的新版本",
  };
}
export function watchTask(w: Watch, material: Material): Task {
  if (w.materialId !== material.id) throw new Error("关注来源不匹配");
  const s = { ...snapshot(material), id: w.id + ":v" + material.version };
  return {
    ...newTask({
      entry: "summon",
      execution: "local",
      familiar: "scout_bat",
      snapshot: s,
      instruction: "持续关注：检查此文本已保存的新版本",
    }),
    watchId: w.id,
  };
}
