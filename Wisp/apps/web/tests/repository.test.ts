import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { createRepository } from "../src/services/repository";
it("does not overwrite saved documents during initialization", async () => {
  const r = createRepository("init-" + crypto.randomUUID());
  const docs = await r.initialize();
  const next = { ...docs[0], text: "我的草稿", version: 2 };
  await r.saveMaterial(next, 1);
  expect((await r.initialize()).find((x) => x.id === next.id)?.text).toBe(
    "我的草稿",
  );
});
it("rejects another tab writing from an old revision", async () => {
  const r = createRepository("conflict-" + crypto.randomUUID());
  const docs = await r.initialize();
  await r.saveMaterial({ ...docs[0], text: "first writer", version: 2 }, 1);
  await expect(
    r.saveMaterial({ ...docs[0], text: "stale writer", version: 2 }, 1),
  ).rejects.toThrow("conflict");
  expect((await r.initialize())[0].text).toBe("first writer");
});
