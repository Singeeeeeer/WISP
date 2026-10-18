import { create } from "zustand";
import {
  connectionIsCurrent,
  snapshotNote,
  validateConnectionResult,
  type CanvasNote,
  type ConnectionRequest,
  type ConnectionResult,
  type SavedConnection,
} from "../domain/canvas";
import { requestConnection } from "./gemini-connections";
import {
  claimSharedProposalSlot,
  sharedProposalDelay,
} from "./proposal-runtime";
import { createRepository } from "./repository";

type Phase =
  "idle" | "inviting" | "loading" | "candidate" | "none" | "error" | "saving";
export const useCanvas = create<{
  notes: CanvasNote[];
  connections: SavedConnection[];
  selected: string[];
  ready: boolean;
  phase: Phase;
  result?: ConnectionResult;
  error: string;
}>(() => ({
  notes: [],
  connections: [],
  selected: [],
  ready: false,
  phase: "idle",
  error: "",
}));

const repository = createRepository();
const channel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("wisp-canvas");
let context = { visible: false, blocked: false, enabled: false };
let invitationTimer: ReturnType<typeof setTimeout> | undefined;
let invitationPair: string | undefined;
let visibleInvitationPair: string | undefined;
const dismissedPairs = new Set<string>();
let operation = 0;
let refreshGeneration = 0;
let controller: AbortController | undefined;
let activeRequest: ConnectionRequest | undefined;

function selectedNotes() {
  const state = useCanvas.getState();
  return state.selected
    .map((id) => state.notes.find((note) => note.id === id))
    .filter((note): note is CanvasNote => !!note);
}
function pairKey(notes: CanvasNote[]) {
  return notes.length === 2
    ? JSON.stringify(notes.map((note) => [note.id, note.version]).sort())
    : undefined;
}
function clearInvitationTimer() {
  clearTimeout(invitationTimer);
  invitationTimer = undefined;
  invitationPair = undefined;
}
function clearOperation() {
  ++operation;
  controller?.abort();
  controller = undefined;
  activeRequest = undefined;
  visibleInvitationPair = undefined;
  clearInvitationTimer();
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "Canvas action failed. Please try again.";
}
function reconcileInvitation() {
  let state = useCanvas.getState();
  const notes = selectedNotes();
  const pair = pairKey(notes);
  if (state.phase === "inviting" && pair !== visibleInvitationPair) {
    visibleInvitationPair = undefined;
    useCanvas.setState({ phase: "idle" });
    state = useCanvas.getState();
  }
  const eligible =
    context.visible &&
    context.enabled &&
    !context.blocked &&
    state.ready &&
    !!pair &&
    !dismissedPairs.has(pair) &&
    notes.every((note) => !!note.text.trim()) &&
    (state.phase === "idle" || state.phase === "inviting");
  if (!eligible) {
    clearInvitationTimer();
    if (state.phase === "inviting") {
      visibleInvitationPair = undefined;
      useCanvas.setState({ phase: "idle" });
    }
    return;
  }
  if (state.phase === "inviting" || invitationPair === pair) return;
  clearInvitationTimer();
  invitationPair = pair;
  invitationTimer = setTimeout(
    () => {
      invitationTimer = undefined;
      invitationPair = undefined;
      if (pairKey(selectedNotes()) !== pair) return;
      const current = useCanvas.getState();
      if (
        !context.visible ||
        !context.enabled ||
        context.blocked ||
        current.phase !== "idle" ||
        dismissedPairs.has(pair!)
      )
        return;
      if (claimSharedProposalSlot()) {
        visibleInvitationPair = pair;
        useCanvas.setState({ phase: "inviting" });
      } else reconcileInvitation();
    },
    Math.max(1000, sharedProposalDelay()),
  );
}

function adoptCanvasData(
  notes: CanvasNote[],
  connections: SavedConnection[],
  ready = useCanvas.getState().ready,
) {
  const state = useCanvas.getState();
  const selected = state.selected.filter((id) =>
    notes.some((n) => n.id === id),
  );
  const pending = state.result ?? activeRequest;
  const stale = pending && !connectionIsCurrent(pending, notes);
  const selectionChanged = selected.length !== state.selected.length;
  if (stale || selectionChanged) clearOperation();
  useCanvas.setState({
    notes,
    connections,
    selected,
    ready,
    ...(stale || selectionChanged
      ? {
          phase: "idle" as const,
          result: undefined,
          error: "A note changed or was removed. Find the connection again.",
        }
      : {}),
  });
  reconcileInvitation();
}
export async function refreshCanvas() {
  const ticket = ++refreshGeneration;
  try {
    const [notes, connections] = await Promise.all([
      repository.listCanvasNotes(),
      repository.listCanvasConnections(),
    ]);
    if (ticket !== refreshGeneration) return false;
    adoptCanvasData(notes, connections, true);
    return true;
  } catch (error) {
    if (ticket === refreshGeneration)
      useCanvas.setState({ error: message(error) });
    return false;
  }
}
async function changed() {
  channel?.postMessage("changed");
  await refreshCanvas();
}

export function setCanvasContext(next: typeof context) {
  const wasVisible = context.visible;
  context = next;
  if (!next.visible && wasVisible) {
    clearOperation();
    useCanvas.setState({ phase: "idle", result: undefined, error: "" });
  }
  reconcileInvitation();
}
export function selectCanvasNote(id: string, additive = false) {
  const state = useCanvas.getState();
  if (state.phase === "saving" || !state.notes.some((note) => note.id === id))
    return;
  let selected: string[];
  if (!additive) selected = [id];
  else if (state.selected.includes(id))
    selected = state.selected.filter((value) => value !== id);
  else if (state.selected.length < 2) selected = [...state.selected, id];
  else {
    useCanvas.setState({ error: "Select exactly two notes. Deselect one note first." });
    return;
  }
  if (selected.join("\0") === state.selected.join("\0")) return;
  clearOperation();
  useCanvas.setState({ selected, phase: "idle", result: undefined, error: "" });
  reconcileInvitation();
}
export function clearCanvasSelection() {
  if (useCanvas.getState().phase === "saving") return;
  clearOperation();
  useCanvas.setState({
    selected: [],
    phase: "idle",
    result: undefined,
    error: "",
  });
}
export function dismissCanvasInvitation() {
  const pair = pairKey(selectedNotes());
  if (pair) dismissedPairs.add(pair);
  clearOperation();
  useCanvas.setState({ phase: "idle", result: undefined, error: "" });
}
export function cancelConnection() {
  if (useCanvas.getState().phase === "saving") return;
  dismissCanvasInvitation();
}

export async function beginConnection() {
  const state = useCanvas.getState();
  const notes = selectedNotes();
  if (
    !context.visible ||
    context.blocked ||
    !state.ready ||
    state.phase === "loading" ||
    state.phase === "saving"
  )
    return;
  if (notes.length !== 2 || notes.some((note) => !note.text.trim())) {
    useCanvas.setState({ error: "Select two notes that contain text." });
    return;
  }
  clearOperation();
  const ticket = operation;
  const request: ConnectionRequest = {
    id: crypto.randomUUID(),
    notes: [snapshotNote(notes[0]), snapshotNote(notes[1])],
  };
  activeRequest = request;
  const abort = new AbortController();
  controller = abort;
  dismissedPairs.add(pairKey(notes)!);
  useCanvas.setState({ phase: "loading", result: undefined, error: "" });
  try {
    // Check storage before sending, then again before exposing the model result.
    const readable = await refreshCanvas();
    if (ticket !== operation || abort.signal.aborted) return;
    if (!readable) throw new Error("Could not verify the current notes. Reload the canvas and try again.");
    const result = validateConnectionResult(
      await requestConnection(request, abort.signal),
      request,
    );
    if (ticket !== operation || abort.signal.aborted) return;
    const verified = await refreshCanvas();
    if (ticket !== operation || abort.signal.aborted) return;
    if (!verified)
      throw new Error("Could not verify the current notes. This result was not kept; please try again.");
    activeRequest = undefined;
    controller = undefined;
    useCanvas.setState({
      result,
      phase: result.connections.length ? "candidate" : "none",
      error: "",
    });
  } catch (error) {
    if (ticket !== operation || abort.signal.aborted) return;
    activeRequest = undefined;
    controller = undefined;
    useCanvas.setState({
      phase: "error",
      result: undefined,
      error: message(error),
    });
  }
}
export async function keepConnection() {
  const state = useCanvas.getState();
  const result = state.result;
  if (state.phase !== "candidate" || !result?.connections.length) return;
  const ticket = ++operation;
  useCanvas.setState({ phase: "saving", error: "" });
  try {
    const saved = await repository.saveCanvasConnection({
      ...result,
      savedAt: new Date().toISOString(),
    });
    useCanvas.setState((current) => ({
      connections: [
        ...current.connections.filter(
          (connection) => connection.id !== saved.id,
        ),
        saved,
      ],
      ...(ticket === operation
        ? { phase: "idle" as const, result: undefined }
        : {}),
    }));
    await changed();
  } catch (error) {
    if (ticket !== operation) return;
    useCanvas.setState({ phase: "candidate", error: message(error) });
    await refreshCanvas();
  }
}
export async function putCanvasNote(
  note: CanvasNote,
  expectedRevision: number | null,
) {
  ++refreshGeneration;
  try {
    const saved = await repository.saveCanvasNote(note, expectedRevision);
    const state = useCanvas.getState();
    adoptCanvasData(
      [...state.notes.filter((value) => value.id !== saved.id), saved],
      state.connections,
    );
    await changed();
  } catch (error) {
    await refreshCanvas();
    throw error;
  }
}
export async function moveCanvasNote(note: CanvasNote, x: number, y: number) {
  await putCanvasNote(
    {
      ...note,
      x,
      y,
      revision: note.revision + 1,
      updatedAt: new Date().toISOString(),
    },
    note.revision,
  );
}
export async function removeCanvasNote(note: CanvasNote) {
  ++refreshGeneration;
  try {
    await repository.deleteCanvasNote(note.id, note.revision);
    const state = useCanvas.getState();
    adoptCanvasData(
      state.notes.filter((value) => value.id !== note.id),
      state.connections.filter((record) =>
        record.notes.every((source) => source.id !== note.id),
      ),
    );
    await changed();
  } catch (error) {
    await refreshCanvas();
    throw error;
  }
}
export async function removeCanvasConnection(id: string) {
  ++refreshGeneration;
  await repository.deleteCanvasConnection(id);
  await changed();
}
export function observeCanvas() {
  const update = () => void refreshCanvas();
  update();
  channel?.addEventListener("message", update);
  window.addEventListener("focus", update);
  window.addEventListener("pagehide", cancelConnection);
  return () => {
    setCanvasContext({ ...context, visible: false });
    ++refreshGeneration;
    channel?.removeEventListener("message", update);
    window.removeEventListener("focus", update);
    window.removeEventListener("pagehide", cancelConnection);
  };
}
