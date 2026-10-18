import { create } from "zustand";
import { newWatch, watchTask, type Watch } from "../domain/watch";
import type { MaterialSnapshot } from "../domain/model";
import { createRepository } from "./repository";
import { submitWatchTask, recoverTasks } from "./task-runtime";
import { setWatchedMaterials } from "./proposal-runtime";
const repository = createRepository();
export const useWatches = create<{
  watches: Watch[];
  ready: boolean;
  error: string;
}>(() => ({ watches: [], ready: false, error: "" }));
const owners = new Map<string, () => void>();
const lockName = (materialId: string) => "wisp-watch:" + materialId;
const channel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("wisp-watches");
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 500));
function report(e: unknown) {
  useWatches.setState({
    error: e instanceof Error ? e.message : "Watch records are unavailable. Please try again.",
  });
}
let generation = 0;
async function refresh() {
  const ticket = ++generation;
  const watches = await repository.listWatches();
  if (ticket !== generation) return;
  useWatches.setState({ watches, ready: true });
  setWatchedMaterials(
    watches.filter((w) => w.status === "active").map((w) => w.materialId),
  );
}
async function changed() {
  await refresh();
  channel?.postMessage("changed");
}
export function startWatching(s: MaterialSnapshot): Promise<void> {
  if (!navigator.locks || typeof Worker === "undefined")
    return Promise.reject(
      new Error("Continuous watching requires Web Locks and Workers. Use a browser that supports them."),
    );
  let watch: Watch;
  try {
    watch = newWatch(s);
  } catch (e) {
    return Promise.reject(e);
  }
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(
        lockName(watch.materialId),
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error("This text is already being watched in another tab. Stop the existing watch first.");
          await repository.startWatch(watch);
          let alive = true;
          owners.set(watch.id, () => {
            alive = false;
          });
          try {
            await changed();
            useWatches.setState({ error: "" });
            resolve();
            let pendingVersion = -1,
              since = 0;
            while (alive) {
              await delay();
              if (!alive) break;
              const currentWatch = (await repository.listWatches()).find(
                (w) => w.id === watch.id,
              );
              if (currentWatch?.status !== "active") break;
              const material = await repository.readMaterial(watch.materialId);
              if (!material) throw new Error("Watched material is unavailable.");
              if (material.version <= currentWatch.lastVersion) continue;
              if (pendingVersion !== material.version) {
                pendingVersion = material.version;
                since = Date.now();
                continue;
              }
              if (Date.now() - since < 750) continue;
              if (!material.text.trim() || material.text.length > 60000) {
                await repository.noteWatch(
                  watch.id,
                  material.version,
                  `Version ${material.version} is empty or exceeds the 60,000-character limit, so it was skipped. Waiting for the next valid version.`,
                );
              } else {
                await submitWatchTask(watchTask(currentWatch, material));
              }
              await changed();
            }
          } catch (e) {
            report(e);
            reject(e);
          } finally {
            owners.delete(watch.id);
            await repository.endWatch(watch.id, "interrupted");
            await changed();
          }
        },
      )
      .catch((e) => {
        report(e);
        reject(e);
      });
  });
}
export async function stopWatching(id: string) {
  await repository.endWatch(id, "stopped");
  owners.get(id)?.();
  await changed();
  void recoverTasks();
}
let recovery: Promise<void> | undefined;
export function recoverWatches() {
  return (recovery ??= (async () => {
    if (!navigator.locks) throw new Error("This browser cannot manage continuous watching.");
    for (const w of await repository.listWatches()) {
      if (w.status !== "active") continue;
      await navigator.locks.request(
        lockName(w.materialId),
        { ifAvailable: true },
        async (lock) => {
          if (lock) await repository.endWatch(w.id, "interrupted");
        },
      );
    }
    await refresh();
  })()
    .catch(report)
    .finally(() => {
      recovery = undefined;
    }));
}
export function observeWatches() {
  void recoverWatches();
  const update = () => {
    void recoverWatches();
  };
  const leaving = () => {
    for (const [id, stop] of owners) {
      stop();
      void repository.endWatch(id, "interrupted").catch(report);
    }
  };
  channel?.addEventListener("message", update);
  window.addEventListener("pagehide", leaving);
  window.addEventListener("focus", update);
  const timer = setInterval(update, 1000);
  return () => {
    leaving();
    clearInterval(timer);
    channel?.removeEventListener("message", update);
    window.removeEventListener("pagehide", leaving);
    window.removeEventListener("focus", update);
  };
}
