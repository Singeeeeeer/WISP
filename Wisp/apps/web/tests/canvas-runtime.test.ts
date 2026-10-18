import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  CanvasNote,
  ConnectionRequest,
  ConnectionResult,
} from "../src/domain/canvas";
import { initialProposalState } from "../src/domain/proposal";
import { initialJointState } from "../src/domain/joint-proposal";
import { initialWatchProposal } from "../src/domain/watch-proposal";

const faults = vi.hoisted(() => ({
  saveFailure: false,
  readFailure: false,
  saveGate: undefined as Promise<void> | undefined,
}));
vi.mock("../src/services/gemini-connections", () => ({
  requestConnection: vi.fn(),
}));
vi.mock("../src/services/repository", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/services/repository")>();
  return {
    ...original,
    createRepository(...args: Parameters<typeof original.createRepository>) {
      const repository = original.createRepository(...args);
      return {
        ...repository,
        async listCanvasNotes() {
          if (faults.readFailure) throw new Error("模拟白板读取失败");
          return repository.listCanvasNotes();
        },
        async saveCanvasConnection(
          ...params: Parameters<typeof repository.saveCanvasConnection>
        ) {
          await faults.saveGate;
          if (faults.saveFailure) throw new Error("模拟存储失败，可重试");
          return repository.saveCanvasConnection(...params);
        },
      };
    },
  };
});
import { createRepository } from "../src/services/repository";
import { requestConnection } from "../src/services/gemini-connections";
import {
  sharedProposalDelay,
  useProposals,
} from "../src/services/proposal-runtime";
import {
  beginConnection,
  cancelConnection,
  clearCanvasSelection,
  dismissCanvasInvitation,
  keepConnection,
  moveCanvasNote,
  observeCanvas,
  putCanvasNote,
  refreshCanvas,
  removeCanvasNote,
  selectCanvasNote,
  setCanvasContext,
  useCanvas,
} from "../src/services/canvas-runtime";

const repository = createRepository();
let notes: [CanvasNote, CanvasNote, CanvasNote];
let stopObserving: (() => void) | undefined;
function note(title: string): CanvasNote {
  return {
    id: crypto.randomUUID(),
    title,
    text: `${title} 记录中有共同主题。`,
    version: 1,
    revision: 1,
    x: 20,
    y: 30,
    updatedAt: new Date().toISOString(),
  };
}
function response(request: ConnectionRequest): ConnectionResult {
  return {
    ...structuredClone(request),
    operation: "connect",
    schemaVersion: "gemini-connection-1",
    execution: "gemini",
    status: "completed",
    createdAt: new Date().toISOString(),
    reason: "",
    connections: [
      {
        title: "共同主题",
        explanation: "两张便笺都明确记载共同主题。",
        evidence: request.notes.map((entry) => ({
          noteId: entry.id,
          quote: entry.text,
          start: 0,
          end: entry.text.length,
        })),
      },
    ],
    metadata: {
      modelId: "offline-test",
      promptVersion: "test-1",
      validatorVersion: "test-1",
      durationMs: 1,
    },
  };
}
function open(enabled = false) {
  setCanvasContext({ visible: true, blocked: false, enabled });
  selectCanvasNote(notes[0].id);
  selectCanvasNote(notes[1].id, true);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.useRealTimers();
  vi.stubGlobal("window", new EventTarget());
  faults.saveFailure = false;
  faults.readFailure = false;
  faults.saveGate = undefined;
  setCanvasContext({ visible: false, blocked: false, enabled: false });
  clearCanvasSelection();
  for (const existing of await repository.listCanvasNotes())
    await repository.deleteCanvasNote(existing.id, existing.revision);
  notes = [note("便笺甲"), note("便笺乙"), note("便笺丙")];
  for (const entry of notes) await repository.saveCanvasNote(entry, null);
  useCanvas.setState({
    notes: [],
    connections: [],
    selected: [],
    ready: false,
    phase: "idle",
    result: undefined,
    error: "",
  });
  useProposals.setState({
    session: initialProposalState(),
    joint: initialJointState(),
    watch: initialWatchProposal(),
    lastShownAt: undefined,
  });
  vi.mocked(requestConnection)
    .mockReset()
    .mockImplementation(async (request) => response(request));
  await refreshCanvas();
});
afterEach(() => {
  stopObserving?.();
  stopObserving = undefined;
  setCanvasContext({ visible: false, blocked: false, enabled: false });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("offers only after one second, shares cooldown, and Not now never calls Gemini", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(100000);
  open(true);
  await vi.advanceTimersByTimeAsync(999);
  expect(useCanvas.getState().phase).toBe("idle");
  await vi.advanceTimersByTimeAsync(1);
  expect(useCanvas.getState().phase).toBe("inviting");
  expect(sharedProposalDelay()).toBe(60000);
  dismissCanvasInvitation();
  clearCanvasSelection();
  selectCanvasNote(notes[1].id);
  selectCanvasNote(notes[0].id, true);
  await vi.advanceTimersByTimeAsync(61000);
  expect(useCanvas.getState().phase).toBe("idle");
  expect(requestConnection).not.toHaveBeenCalled();
});
it("does not invite while disabled or blocked and respects a prior shared cooldown", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(100000);
  open();
  await vi.advanceTimersByTimeAsync(2000);
  expect(useCanvas.getState().phase).toBe("idle");
  setCanvasContext({ visible: true, blocked: true, enabled: true });
  await vi.advanceTimersByTimeAsync(2000);
  expect(useCanvas.getState().phase).toBe("idle");
  useProposals.setState({ lastShownAt: Date.now() });
  setCanvasContext({ visible: true, blocked: false, enabled: true });
  await vi.advanceTimersByTimeAsync(59999);
  expect(useCanvas.getState().phase).toBe("idle");
  await vi.advanceTimersByTimeAsync(1);
  expect(useCanvas.getState().phase).toBe("inviting");
  expect(requestConnection).not.toHaveBeenCalled();
});
it("limits additive selection to two and only explicit analysis sends frozen selected notes", async () => {
  open();
  selectCanvasNote(notes[2].id, true);
  expect(useCanvas.getState().selected).toEqual([notes[0].id, notes[1].id]);
  expect(useCanvas.getState().error).toContain("two");
  expect(requestConnection).not.toHaveBeenCalled();
  await beginConnection();
  expect(requestConnection).toHaveBeenCalledTimes(1);
  expect(
    vi
      .mocked(requestConnection)
      .mock.calls[0][0].notes.map((entry) => entry.id),
  ).toEqual([notes[0].id, notes[1].id]);
  expect(
    vi.mocked(requestConnection).mock.calls[0][0].notes[0],
  ).not.toHaveProperty("x");
  expect(useCanvas.getState().phase).toBe("candidate");
  expect(await repository.listCanvasConnections()).toEqual([]);
});
it("aborts on cancel and ignores a late successful model response", async () => {
  const pending = deferred<ConnectionResult>();
  vi.mocked(requestConnection).mockReturnValueOnce(pending.promise);
  open();
  const running = beginConnection();
  await vi.waitFor(() => expect(requestConnection).toHaveBeenCalledTimes(1));
  expect(useCanvas.getState().phase).toBe("loading");
  await beginConnection();
  expect(requestConnection).toHaveBeenCalledTimes(1);
  const [request, signal] = vi.mocked(requestConnection).mock.calls[0];
  cancelConnection();
  expect(signal.aborted).toBe(true);
  pending.resolve(response(request));
  await running;
  expect(useCanvas.getState().phase).toBe("idle");
  expect(useCanvas.getState().result).toBeUndefined();
  expect(await repository.listCanvasConnections()).toEqual([]);
});
it("closing cancels the old request and its late result cannot replace a new candidate", async () => {
  const pending = deferred<ConnectionResult>();
  vi.mocked(requestConnection).mockReturnValueOnce(pending.promise);
  open();
  const first = beginConnection();
  await vi.waitFor(() => expect(requestConnection).toHaveBeenCalledTimes(1));
  const [request, signal] = vi.mocked(requestConnection).mock.calls[0];
  setCanvasContext({ visible: false, blocked: false, enabled: false });
  expect(signal.aborted).toBe(true);
  setCanvasContext({ visible: true, blocked: false, enabled: false });
  await beginConnection();
  const currentId = useCanvas.getState().result?.id;
  pending.resolve(response(request));
  await first;
  expect(useCanvas.getState().result?.id).toBe(currentId);
  expect(currentId).not.toBe(request.id);
});
it("keeps candidates when only position changes, but invalidates them after text edits", async () => {
  open();
  await beginConnection();
  const id = useCanvas.getState().result?.id;
  await moveCanvasNote(notes[0], 200, 120);
  expect(useCanvas.getState().result?.id).toBe(id);
  expect(useCanvas.getState().phase).toBe("candidate");
  const moved = useCanvas
    .getState()
    .notes.find((entry) => entry.id === notes[0].id)!;
  await putCanvasNote(
    {
      ...moved,
      text: "内容已经改写",
      version: 2,
      revision: moved.revision + 1,
    },
    moved.revision,
  );
  expect(useCanvas.getState().result).toBeUndefined();
  expect(useCanvas.getState().phase).toBe("idle");
  expect(useCanvas.getState().error).toContain("changed");
});
it("invalidates a running request when another tab changes its source", async () => {
  const pending = deferred<ConnectionResult>();
  vi.mocked(requestConnection).mockReturnValueOnce(pending.promise);
  open();
  const running = beginConnection();
  await vi.waitFor(() => expect(requestConnection).toHaveBeenCalledTimes(1));
  const [request, signal] = vi.mocked(requestConnection).mock.calls[0];
  await repository.saveCanvasNote(
    { ...notes[0], title: "其他标签改名", version: 2, revision: 2 },
    1,
  );
  await refreshCanvas();
  expect(signal.aborted).toBe(true);
  pending.resolve(response(request));
  await running;
  expect(useCanvas.getState().result).toBeUndefined();
});
it("keeps a failed save as a candidate and retries persistence without another model request", async () => {
  open();
  await beginConnection();
  faults.saveFailure = true;
  await keepConnection();
  expect(useCanvas.getState().phase).toBe("candidate");
  expect(useCanvas.getState().error).toContain("模拟存储失败");
  expect(useCanvas.getState().result).toBeDefined();
  expect(useCanvas.getState().connections).toEqual([]);
  faults.saveFailure = false;
  await keepConnection();
  expect(useCanvas.getState().phase).toBe("idle");
  expect(useCanvas.getState().connections).toHaveLength(1);
  expect(await repository.listCanvasConnections()).toHaveLength(1);
  expect(requestConnection).toHaveBeenCalledTimes(1);
});
it("does not show a saved line before the transaction and safely finishes a save after closing", async () => {
  open();
  await beginConnection();
  const gate = deferred<void>();
  faults.saveGate = gate.promise;
  const saving = keepConnection();
  expect(useCanvas.getState().phase).toBe("saving");
  expect(useCanvas.getState().connections).toEqual([]);
  setCanvasContext({ visible: false, blocked: false, enabled: false });
  gate.resolve();
  await saving;
  expect(useCanvas.getState().phase).toBe("idle");
  expect(useCanvas.getState().result).toBeUndefined();
  expect(await repository.listCanvasConnections()).toHaveLength(1);
});
it("exposes no-connection and error states without saving or auto retrying", async () => {
  vi.mocked(requestConnection).mockImplementationOnce(async (request) => ({
    ...response(request),
    connections: [],
    reason: "材料没有足够依据。",
  }));
  open();
  await beginConnection();
  expect(useCanvas.getState().phase).toBe("none");
  expect(useCanvas.getState().result?.reason).toContain("没有足够依据");
  await keepConnection();
  expect(await repository.listCanvasConnections()).toEqual([]);
  vi.mocked(requestConnection).mockRejectedValueOnce(new Error("模型请求失败"));
  await beginConnection();
  expect(useCanvas.getState().phase).toBe("error");
  expect(useCanvas.getState().error).toBe("模型请求失败");
  expect(requestConnection).toHaveBeenCalledTimes(2);
});
it("reloads on focus and rejects stale edits without overwriting another tab's version", async () => {
  open();
  stopObserving = observeCanvas();
  await refreshCanvas();
  await repository.saveCanvasNote(
    { ...notes[0], text: "其他标签的内容", version: 2, revision: 2 },
    1,
  );
  window.dispatchEvent(new Event("focus"));
  await vi.waitFor(() =>
    expect(
      useCanvas.getState().notes.find((entry) => entry.id === notes[0].id)
        ?.version,
    ).toBe(2),
  );
  const draft = {
    ...notes[0],
    text: "仍在编辑的草稿",
    version: 2,
    revision: 2,
  };
  await expect(putCanvasNote(draft, 1)).rejects.toThrow("conflict");
  expect(draft.text).toBe("仍在编辑的草稿");
  expect(
    useCanvas.getState().notes.find((entry) => entry.id === notes[0].id)?.text,
  ).toBe("其他标签的内容");
});
it("deleting a note clears its selection and persisted connections", async () => {
  open();
  await beginConnection();
  await keepConnection();
  await removeCanvasNote(notes[0]);
  expect(useCanvas.getState().connections).toEqual([]);
  expect(useCanvas.getState().selected).toEqual([notes[1].id]);
  expect(await repository.listCanvasConnections()).toEqual([]);
});
it("invalidates a candidate immediately after a content save even when reload fails", async () => {
  open();
  await beginConnection();
  const candidateId = useCanvas.getState().result?.id;
  faults.readFailure = true;
  await moveCanvasNote(notes[0], 300, 200);
  expect(useCanvas.getState().result?.id).toBe(candidateId);
  const moved = useCanvas
    .getState()
    .notes.find((entry) => entry.id === notes[0].id)!;
  await putCanvasNote(
    {
      ...moved,
      text: "已经保存的新正文",
      version: 2,
      revision: moved.revision + 1,
    },
    moved.revision,
  );
  expect(useCanvas.getState().phase).toBe("idle");
  expect(useCanvas.getState().result).toBeUndefined();
  expect(useCanvas.getState().error).toBe("模拟白板读取失败");
  faults.readFailure = false;
  expect(
    (await repository.listCanvasNotes()).find(
      (entry) => entry.id === notes[0].id,
    )?.text,
  ).toBe("已经保存的新正文");
});
it("aborts an active request after a content save even when reload fails", async () => {
  const pending = deferred<ConnectionResult>();
  vi.mocked(requestConnection).mockReturnValueOnce(pending.promise);
  open();
  const running = beginConnection();
  await vi.waitFor(() => expect(requestConnection).toHaveBeenCalledTimes(1));
  const [request, signal] = vi.mocked(requestConnection).mock.calls[0];
  faults.readFailure = true;
  await putCanvasNote(
    { ...notes[0], text: "已更新的任务原文", version: 2, revision: 2 },
    1,
  );
  const aborted = signal.aborted;
  pending.resolve(response(request));
  await running;
  expect(aborted).toBe(true);
  expect(useCanvas.getState().phase).toBe("idle");
  expect(useCanvas.getState().result).toBeUndefined();
});
it("removes a deleted note, saved lines and its candidate locally even when reload fails", async () => {
  open();
  await beginConnection();
  await keepConnection();
  await beginConnection();
  expect(useCanvas.getState().phase).toBe("candidate");
  expect(useCanvas.getState().connections).toHaveLength(1);
  faults.readFailure = true;
  await removeCanvasNote(notes[0]);
  expect(
    useCanvas.getState().notes.some((entry) => entry.id === notes[0].id),
  ).toBe(false);
  expect(useCanvas.getState().selected).toEqual([notes[1].id]);
  expect(useCanvas.getState().connections).toEqual([]);
  expect(useCanvas.getState().phase).toBe("idle");
  expect(useCanvas.getState().result).toBeUndefined();
  expect(useCanvas.getState().error).toBe("模拟白板读取失败");
  expect(await repository.listCanvasConnections()).toEqual([]);
});
