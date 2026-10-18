import "fake-indexeddb/auto";
import { openDB } from "idb";
import { expect, it } from "vitest";
import { seeds } from "../src/domain/model";
import {
  ENGLISH_SEED_MIGRATION_KEY,
  LEGACY_SEED_CONTENT,
} from "../src/domain/seed-migration";
import { createRepository } from "../src/services/repository";

async function clearMigrationMarker(name: string): Promise<void> {
  const db = await openDB(name);
  await db.delete("preferences", ENGLISH_SEED_MIGRATION_KEY);
  db.close();
}

async function replaceWithLegacy(
  name: string,
  id: "proposal" | "venue",
  patch: Record<string, unknown> = {},
): Promise<void> {
  const repository = createRepository(name);
  const current = (await repository.listMaterials()).find(
    (material) => material.id === id,
  );
  if (!current) throw new Error(`Missing ${id} seed in test fixture.`);
  await repository.saveMaterial(
    {
      ...current,
      ...LEGACY_SEED_CONTENT[id],
      version: 1,
      updatedAt: "2020-01-01T00:00:00.000Z",
      ...patch,
    },
    current.version,
  );
}

it("migrates untouched legacy seeds to English v2 exactly once", async () => {
  const name = "seed-migrate-" + crypto.randomUUID();
  const repository = createRepository(name);
  await repository.initialize();
  await replaceWithLegacy(name, "proposal");
  await replaceWithLegacy(name, "venue");
  await clearMigrationMarker(name);

  const migrated = await repository.initialize();
  for (const seed of seeds()) {
    const material = migrated.find((candidate) => candidate.id === seed.id);
    expect(material).toMatchObject({
      id: seed.id,
      title: seed.title,
      text: seed.text,
      version: 2,
      source: "virtual_document",
    });
    expect(material?.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    expect(Number.isNaN(Date.parse(material?.updatedAt ?? ""))).toBe(false);
  }
  expect(await repository.readPreference(ENGLISH_SEED_MIGRATION_KEY)).toBe(
    true,
  );

  const once = migrated.map((material) => ({ ...material }));
  expect(await repository.initialize()).toEqual(once);
});

it.each([
  ["edited title", { title: "My bookstore draft" }],
  ["edited text", { text: "A user edit" }],
  ["imported source", { source: "pasted_text" }],
  ["already revised", { version: 2 }],
  [
    "createdAt metadata",
    { createdAt: "2020-01-01T00:00:00.000Z" },
  ],
  [
    "origin metadata",
    { origin: { kind: "pasted_text", addedAt: "2020-01-01T00:00:00.000Z" } },
  ],
] as const)("skips %s without changing the material", async (_label, patch) => {
  const name = "seed-skip-" + crypto.randomUUID();
  const repository = createRepository(name);
  await repository.initialize();
  await replaceWithLegacy(name, "proposal", patch);
  await clearMigrationMarker(name);

  const before = await repository.readMaterial("proposal");
  await repository.initialize();
  expect(await repository.readMaterial("proposal")).toEqual(before);
});

it("does not recreate a deleted legacy seed", async () => {
  const name = "seed-delete-" + crypto.randomUUID();
  const repository = createRepository(name);
  await repository.initialize();
  const db = await openDB(name);
  await db.delete("materials", "proposal");
  db.close();
  await clearMigrationMarker(name);

  await repository.initialize();
  expect(await repository.readMaterial("proposal")).toBeUndefined();
});
