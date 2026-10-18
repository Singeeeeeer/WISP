import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createRepository } from "../src/services/repository";

it("adds one processable desktop checklist without changing the two repository seeds", async () => {
  const repository = createRepository("desktop-demo-" + crypto.randomUUID());
  const before = await repository.initialize();
  expect(before.map((material) => material.id).sort()).toEqual([
    "proposal",
    "venue",
  ]);
  const [first, second] = await Promise.all([
    repository.ensureDesktopChecklist(),
    repository.ensureDesktopChecklist(),
  ]);
  expect(second).toEqual(first);
  expect(first).toMatchObject({
    id: "wisp-demo-checklist",
    kind: "text",
    source: "virtual_document",
    version: 1,
  });
  expect(first.text).toContain("Task\tOwner\tWhen\tStatus");
  expect(
    (await repository.listMaterials()).filter(
      (material) => material.id === first.id,
    ),
  ).toHaveLength(1);
  expect(await repository.listCauldronEntries()).toEqual([]);
  for (const original of before)
    expect(await repository.readMaterial(original.id)).toEqual(original);
});

it("does not overwrite an edited checklist when another UI session initializes", async () => {
  const repository = createRepository("desktop-edited-" + crypto.randomUUID());
  await repository.initialize();
  const first = await repository.ensureDesktopChecklist();
  const edited = {
    ...first,
    title: "My schedule",
    text: "My own\twords 😀",
    version: 2,
  };
  await repository.saveMaterial(edited, first.version);
  expect(await repository.ensureDesktopChecklist()).toEqual(edited);
  expect(
    (await repository.initialize()).find(
      (material) => material.id === first.id,
    ),
  ).toEqual(edited);
});

it("preserves an initialized older workspace's materials and saved layout", async () => {
  const repository = createRepository(
    "desktop-existing-" + crypto.randomUUID(),
  );
  const original = (await repository.initialize()).find(
    (material) => material.id === "proposal",
  )!;
  const edited = {
    ...original,
    title: "Existing user material",
    text: "Keep this exact content.",
    version: 2,
  };
  await repository.saveMaterial(edited, 1);
  const layout = [
    {
      id: "window-proposal",
      materialId: "proposal",
      x: 170,
      y: 90,
      width: 510,
      height: 490,
      z: 27,
      minimized: true,
    },
  ];
  await repository.writePreference("windows", layout);
  await repository.ensureDesktopChecklist();
  await repository.initialize();
  expect(await repository.readMaterial("proposal")).toEqual(edited);
  expect(await repository.readPreference("windows")).toEqual(layout);
});
