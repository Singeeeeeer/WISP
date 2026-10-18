import { afterEach, expect, it, vi } from "vitest";
import {
  connectionIsCurrent,
  snapshotNote,
  validateCanvasNote,
  validateConnectionRequest,
  validateConnectionResult,
  type CanvasNote,
  type ConnectionRequest,
  type ConnectionResult,
} from "../src/domain/canvas";
import { requestConnection } from "../src/services/gemini-connections";

const notes: [CanvasNote, CanvasNote] = ["a", "b"].map((id) => ({
  id,
  title: id,
  text: "🌟共同材料",
  version: 1,
  revision: 1,
  x: 20,
  y: 20,
  updatedAt: "2026-10-18T00:00:00Z",
})) as [CanvasNote, CanvasNote];
const request = (): ConnectionRequest => ({
  id: "connection",
  notes: notes.map(snapshotNote) as ConnectionRequest["notes"],
});
const result = (): ConnectionResult => ({
  ...request(),
  operation: "connect",
  schemaVersion: "gemini-connection-1",
  execution: "gemini",
  status: "completed",
  createdAt: "2026-10-18T00:00:00Z",
  reason: "",
  connections: [
    {
      title: "共同主题",
      explanation: "都谈到材料",
      evidence: notes.map((note) => ({
        noteId: note.id,
        quote: "共同材料",
        start: 2,
        end: 6,
      })),
    },
  ],
  metadata: {
    modelId: "mock",
    promptVersion: "mock",
    validatorVersion: "mock",
    durationMs: 1,
  },
});
afterEach(() => vi.unstubAllGlobals());

it("keeps the entire 260 by 190 note inside the 1600 by 1200 canvas", () => {
  for (const position of [
    { x: 0, y: 0 },
    { x: 1340, y: 1010 },
  ])
    expect(validateCanvasNote({ ...notes[0], ...position })).toBe(true);
  for (const position of [
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1340.1, y: 0 },
    { x: 0, y: 1010.1 },
    { x: 1600, y: 1200 },
    { x: Number.NaN, y: 0 },
  ])
    expect(validateCanvasNote({ ...notes[0], ...position })).toBe(false);
});

it("captures only content; movement remains current but edits and missing notes invalidate a result", () => {
  expect(snapshotNote(notes[0])).toEqual({
    id: "a",
    title: "a",
    text: "🌟共同材料",
    version: 1,
  });
  const moved = notes.map((note) => ({ ...note, x: 200, revision: 2 }));
  expect(connectionIsCurrent(result(), moved)).toBe(true);
  expect(connectionIsCurrent(result(), [moved[0]])).toBe(false);
  expect(
    connectionIsCurrent(result(), [{ ...notes[0], title: "new" }, notes[1]]),
  ).toBe(false);
  expect(
    connectionIsCurrent(result(), [{ ...notes[0], version: 2 }, notes[1]]),
  ).toBe(false);
});

it("validates two distinct nonempty snapshots and the combined UTF-16 limit", () => {
  expect(() => validateConnectionRequest(request())).not.toThrow();
  for (const value of [
    { ...request(), notes: [notes[0]] },
    { ...request(), notes: [snapshotNote(notes[0]), snapshotNote(notes[0])] },
    {
      ...request(),
      notes: [snapshotNote(notes[0]), { ...snapshotNote(notes[1]), text: " " }],
    },
    {
      ...request(),
      notes: [
        snapshotNote(notes[0]),
        { ...snapshotNote(notes[1]), text: "🌟".repeat(30000) },
      ],
    },
    { ...request(), notes },
  ])
    expect(() => validateConnectionRequest(value)).toThrow();
});

it("binds identity and source order, requires evidence from both notes and exact UTF-16 ranges", () => {
  expect(validateConnectionResult(result(), request())).toEqual(result());
  const mutations: ((record: ConnectionResult) => void)[] = [
    (r) => {
      r.id = "other";
    },
    (r) => {
      r.notes.reverse();
    },
    (r) => {
      r.notes[0].text = "changed";
    },
    (r) => {
      r.connections[0].evidence[1].noteId = "a";
    },
    (r) => {
      r.connections[0].evidence[0].quote = "错误";
    },
    (r) => {
      r.connections[0].evidence[0].start = 1;
    },
    (r) => {
      r.connections[0].evidence[0] = {
        noteId: "a",
        quote: "\udf1f",
        start: 1,
        end: 2,
      };
    },
    (r) => {
      r.connections.push(structuredClone(r.connections[0]));
    },
    (r) => {
      r.metadata.durationMs = -1;
    },
    (r) => {
      r.metadata.usage = { total_tokens: -1 };
    },
    (r) => {
      r.reason = " ";
    },
  ];
  for (const mutate of mutations) {
    const broken = result();
    mutate(broken);
    expect(() => validateConnectionResult(broken, request())).toThrow();
  }
});

it("accepts no connection only with an explicit reason and rejects unexpected fields", () => {
  const empty = {
    ...result(),
    connections: [],
    reason: "材料之间没有足够依据。",
  };
  expect(validateConnectionResult(empty, request())).toEqual(empty);
  expect(() =>
    validateConnectionResult({ ...empty, reason: "" }, request()),
  ).toThrow();
  expect(() =>
    validateConnectionResult({ ...result(), hidden: "unexpected" }, request()),
  ).toThrow();
});

it("sends only the two frozen snapshots once and validates a matching response", async () => {
  const expected = request(),
    pendingRequest = request();
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const pending = requestConnection(
    pendingRequest,
    new AbortController().signal,
  );
  pendingRequest.notes[0].text = "changed after dispatch";
  resolve(new Response(JSON.stringify(result())));
  expect(await pending).toEqual(result());
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("/api/connections");
  expect(JSON.parse(options.body as string)).toEqual(expected);
  expect(options.signal).toBeInstanceOf(AbortSignal);
});

it("rejects invalid requests before fetch and never retries or exposes provider details", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          error: { code: "MODEL_AUTH_FAILED", detail: "secret" },
        }),
        { status: 502 },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  await expect(
    requestConnection(
      { ...request(), notes: [request().notes[0], request().notes[0]] },
      new AbortController().signal,
    ),
  ).rejects.toThrow("two");
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    requestConnection(request(), new AbortController().signal),
  ).rejects.toThrow("authentication failed");
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ error: { code: "UNKNOWN", detail: "secret" } }),
      { status: 502 },
    ),
  );
  await expect(
    requestConnection(request(), new AbortController().signal),
  ).rejects.toThrow("Check the local service status");
  fetch.mockResolvedValueOnce(new Response("not-json"));
  await expect(
    requestConnection(request(), new AbortController().signal),
  ).rejects.toThrow("invalid response");
  const cancelled = new AbortController();
  cancelled.abort();
  fetch.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
  await expect(requestConnection(request(), cancelled.signal)).rejects.toThrow(
    "Waiting stopped",
  );
});
