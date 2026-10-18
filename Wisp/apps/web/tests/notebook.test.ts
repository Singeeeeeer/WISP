import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { openDB, deleteDB } from "idb";
import { createRepository } from "../src/services/repository";
import { snapshot } from "../src/domain/model";
import { newTask } from "../src/domain/task";

it("exports one consistent notebook with material content, task snapshots and preference keys", async () => {
  const name = "notebook-export-" + crypto.randomUUID();
  const repository = createRepository(name);
  const materials = await repository.initialize();
  const material = { ...materials[0], text: "A draft\n\nwith 🦇 and quotation marks: \"yes\"", version: 2 };
  await repository.saveMaterial(material, 1);
  const task = newTask({ entry: "summon", familiar: "scout_bat", instruction: "Check", snapshot: snapshot(material) });
  await repository.enqueueTask(task);
  await repository.writePreference("settings", { idleAntics: false });
  const notebook = JSON.parse(JSON.stringify(await repository.exportNotebook()));
  expect(notebook.format).toBe("wisp-notebook");
  expect(notebook.stores.materials.find((entry: { key: string }) => entry.key === material.id).value).toEqual(material);
  expect(notebook.stores.tasks[0].value.snapshot.text).toBe(material.text);
  expect(notebook.stores.preferences.find((entry: { key: string }) => entry.key === "settings").value).toEqual({ idleAntics: false });
  expect(Object.keys(notebook.stores)).toHaveLength(8);
  // Close the repository using the same guarded reset, only in this isolated test DB.
  await repository.resetNotebook();
});

it("reset removes the test database and prevents every old repository instance from restoring stale content", async () => {
  const name = "notebook-reset-" + crypto.randomUUID();
  const first = createRepository(name);
  const second = createRepository(name);
  const materials = await first.initialize();
  await second.writePreference("draft", "old state");
  await first.resetNotebook();
  await expect(second.writePreference("draft", "late state")).rejects.toThrow("reset");
  await expect(first.saveMaterial({ ...materials[0], version: 2 }, 1)).rejects.toThrow("reset");
  const fresh = await openDB(name);
  expect(fresh.objectStoreNames.length).toBe(0);
  fresh.close();
  await deleteDB(name);
});
