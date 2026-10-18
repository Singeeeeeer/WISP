import { afterEach, beforeEach, expect, it, vi } from "vitest";

const persisted = vi.hoisted(() => ({ settings: undefined as unknown }));
const writePreference = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../src/services/repository", () => ({
  createRepository: () => ({
    initialize: async () => [],
    readPreference: async (key: string) =>
      key === "settings" ? persisted.settings : undefined,
    writePreference,
  }),
}));
vi.mock("../src/services/proposal-runtime", () => ({
  loadExcerptPreference: async () => undefined,
  visitedForProposal: vi.fn(),
  reconcile: vi.fn(),
  setProposalsEnabled: vi.fn(),
}));

const olderSettings = {
  characterVisible: false,
  reducedMotion: true,
  characterSize: 60,
  helpfulProposals: false,
};

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("BroadcastChannel", undefined);
  writePreference.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["missing", undefined, "default"],
  ["invalid", "fast", "default"],
  ["default", "default", "default"],
  ["lively", "lively", "lively"],
])(
  "loads %s idle rhythm while retaining older settings",
  async (_, rhythm, expected) => {
    persisted.settings = {
      ...olderSettings,
      ...(rhythm === undefined ? {} : { idleRhythm: rhythm }),
    };
    const { initialize, useInteraction, useDocuments } =
      await import("../src/state/stores");
    await initialize();
    expect(useDocuments.getState().fatal).toBe("");
    expect(useInteraction.getState().settings).toEqual({
      ...olderSettings,
      idleRhythm: expected,
    });
  },
);

it("persists a rhythm change through the existing settings save queue", async () => {
  persisted.settings = olderSettings;
  const { initialize, useInteraction } = await import("../src/state/stores");
  await initialize();
  useInteraction.getState().updateSettings({ idleRhythm: "lively" });
  await vi.waitFor(() =>
    expect(writePreference).toHaveBeenCalledWith("settings", {
      ...olderSettings,
      idleRhythm: "lively",
    }),
  );
  expect(useInteraction.getState().settingsStatus).toBe("设置已保存");
});
