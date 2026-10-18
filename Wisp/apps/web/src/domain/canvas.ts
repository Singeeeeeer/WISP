import {
  integer,
  keys,
  object,
  sameValue,
  text,
  validEvidence,
  type GeminiMetadata,
} from "./gemini-common";

export interface NoteSnapshot {
  id: string;
  version: number;
  title: string;
  text: string;
}
export interface CanvasNote extends NoteSnapshot {
  revision: number;
  x: number;
  y: number;
  updatedAt: string;
}
export interface ConnectionRequest {
  id: string;
  notes: [NoteSnapshot, NoteSnapshot];
}
export interface ConnectionResult extends ConnectionRequest {
  operation: "connect";
  schemaVersion: "gemini-connection-1";
  execution: "gemini";
  status: "completed";
  createdAt: string;
  connections: {
    title: string;
    explanation: string;
    evidence: { noteId: string; quote: string; start: number; end: number }[];
  }[];
  reason: string;
  metadata: GeminiMetadata;
}
export type SavedConnection = ConnectionResult & { savedAt: string };

const date = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
function validNote(value: unknown): value is NoteSnapshot {
  return (
    object(value) &&
    text(value.id, 200) &&
    integer(value.version) &&
    value.version >= 1 &&
    typeof value.title === "string" &&
    value.title.length <= 1000 &&
    typeof value.text === "string" &&
    value.text.length <= 60000
  );
}
export function validateCanvasNote(value: unknown): value is CanvasNote {
  return (
    object(value) &&
    validNote(value) &&
    keys(value, [
      "id",
      "version",
      "title",
      "text",
      "revision",
      "x",
      "y",
      "updatedAt",
    ]) &&
    integer(value.revision) &&
    value.revision >= value.version &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    value.x >= 0 &&
    value.x <= 1340 &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    value.y >= 0 &&
    value.y <= 1010 &&
    date(value.updatedAt)
  );
}
export function snapshotNote(note: NoteSnapshot): NoteSnapshot {
  return {
    id: note.id,
    version: note.version,
    title: note.title,
    text: note.text,
  };
}
export function connectionIsCurrent(
  record: Pick<ConnectionResult, "notes">,
  notes: readonly CanvasNote[],
): boolean {
  return record.notes.every((snapshot) => {
    const current = notes.find((note) => note.id === snapshot.id);
    return !!current && sameValue(snapshotNote(current), snapshot);
  });
}
export function validateConnectionRequest(
  value: unknown,
): asserts value is ConnectionRequest {
  if (
    !object(value) ||
    !keys(value, ["id", "notes"]) ||
    !text(value.id, 200) ||
    !Array.isArray(value.notes) ||
    value.notes.length !== 2 ||
    !value.notes.every(
      (note) =>
        validNote(note) &&
        keys(note as unknown as Record<string, unknown>, [
          "id",
          "version",
          "title",
          "text",
        ]) &&
        !!note.text.trim(),
    ) ||
    value.notes[0].id === value.notes[1].id ||
    value.notes[0].text.length + value.notes[1].text.length > 60000
  )
    throw new Error(
      "请选择两张不同的非空便笺，正文合计不能超过 60,000 个 UTF-16 单元。",
    );
}
function validMetadata(value: unknown): value is GeminiMetadata {
  return (
    object(value) &&
    keys(value, [
      "modelId",
      "promptVersion",
      "validatorVersion",
      "durationMs",
      "usage",
    ]) &&
    text(value.modelId, 200) &&
    text(value.promptVersion, 100) &&
    text(value.validatorVersion, 100) &&
    typeof value.durationMs === "number" &&
    Number.isFinite(value.durationMs) &&
    value.durationMs >= 0 &&
    (value.usage === undefined ||
      (object(value.usage) &&
        keys(value.usage, [
          "total_input_tokens",
          "total_output_tokens",
          "total_thought_tokens",
          "total_cached_tokens",
          "total_tool_use_tokens",
          "total_tokens",
        ]) &&
        Object.values(value.usage).every(
          (count) => integer(count) && count >= 0,
        )))
  );
}
export function validateConnectionResult(
  value: unknown,
  request: ConnectionRequest,
): ConnectionResult {
  validateConnectionRequest(request);
  if (
    !object(value) ||
    !keys(value, [
      "id",
      "notes",
      "operation",
      "schemaVersion",
      "execution",
      "status",
      "createdAt",
      "connections",
      "reason",
      "metadata",
    ]) ||
    value.id !== request.id ||
    !sameValue(value.notes, request.notes) ||
    value.operation !== "connect" ||
    value.schemaVersion !== "gemini-connection-1" ||
    value.execution !== "gemini" ||
    value.status !== "completed" ||
    !date(value.createdAt) ||
    !validMetadata(value.metadata) ||
    typeof value.reason !== "string" ||
    value.reason.length > 4000 ||
    (value.reason.length > 0 && !value.reason.trim()) ||
    !Array.isArray(value.connections) ||
    value.connections.length > 1 ||
    (!value.connections.length && !value.reason.trim()) ||
    !value.connections.every((connection) => {
      if (
        !object(connection) ||
        !keys(connection, ["title", "explanation", "evidence"]) ||
        !text(connection.title, 300) ||
        !text(connection.explanation, 4000) ||
        !Array.isArray(connection.evidence) ||
        connection.evidence.length < 2 ||
        connection.evidence.length > 8
      )
        return false;
      const evidence = connection.evidence;
      return (
        request.notes.every((note) =>
          evidence.some((e: unknown) => object(e) && e.noteId === note.id),
        ) &&
        evidence.every((e: unknown) => {
          if (!object(e) || !keys(e, ["noteId", "quote", "start", "end"]))
            return false;
          const note = request.notes.find((n) => n.id === e.noteId);
          return (
            !!note &&
            validEvidence(
              [{ quote: e.quote, start: e.start, end: e.end }],
              note.text,
              1,
              1,
            )
          );
        })
      );
    })
  )
    throw new Error("Gemini 关系结果校验或便笺绑定失败，未保存。");
  return value as unknown as ConnectionResult;
}
