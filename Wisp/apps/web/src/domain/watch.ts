import { snapshot, type Material, type MaterialSnapshot } from "./model";
import { newTask, type SingleTask } from "./task";
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
    throw new Error("The watch range must be a non-empty full text of no more than 60,000 UTF-16 code units.");
  return {
    id: crypto.randomUUID(),
    materialId: s.materialId,
    title: s.title,
    baseline: { ...s },
    lastVersion: s.materialVersion,
    status: "active",
    confirmedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notice: "Waiting for a newly saved version",
  };
}
export function watchTask(w: Watch, material: Material): SingleTask {
  if (w.materialId !== material.id) throw new Error("The watched source does not match");
  const s = { ...snapshot(material), id: w.id + ":v" + material.version };
  return {
    ...newTask({
      entry: "summon",
      execution: "local",
      familiar: "scout_bat",
      snapshot: s,
      instruction: "Continuous watch: check newly saved versions of this text",
    }),
    watchId: w.id,
  };
}
