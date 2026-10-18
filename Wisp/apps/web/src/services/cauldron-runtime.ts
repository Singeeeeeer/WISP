import { create } from "zustand";
import type { Material } from "../domain/model";
import type { CauldronEntry } from "../domain/cauldron";
import { createRepository } from "./repository";
import { adoptMaterials } from "../state/stores";
const repository = createRepository();
export const useCauldron = create<{
  entries: CauldronEntry[];
  ready: boolean;
  error: string;
  selected?: string;
}>(() => ({ entries: [], ready: false, error: "" }));
const channel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("wisp-materials");
let generation = 0;
export async function refreshCauldron() {
  const ticket = ++generation;
  try {
    const [materials, entries] = await Promise.all([
      repository.listMaterials(),
      repository.listCauldronEntries(),
    ]);
    if (ticket !== generation) return;
    adoptMaterials(materials);
    useCauldron.setState({ entries, ready: true, error: "" });
  } catch (e) {
    if (ticket === generation)
      useCauldron.setState({
        error: e instanceof Error ? e.message : "材料列表读取失败，请重试",
      });
  }
}
async function changed() {
  channel?.postMessage("changed");
  await refreshCauldron();
}
export async function createMaterial(material: Material) {
  const saved = await repository.createCauldronMaterial(material);
  adoptMaterials([saved]);
  useCauldron.setState({ selected: saved.id });
  await changed();
}
export async function changeMembership(id: string, member: boolean) {
  if (member) await repository.addCauldronEntry(id);
  else await repository.removeCauldronEntry(id);
  await changed();
}
export function observeCauldron() {
  const update = () => {
    void refreshCauldron();
  };
  update();
  channel?.addEventListener("message", update);
  window.addEventListener("focus", update);
  return () => {
    channel?.removeEventListener("message", update);
    window.removeEventListener("focus", update);
  };
}
