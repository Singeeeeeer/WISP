import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useInteraction } from "../../state/stores";
import { OsIcon } from "../workspace/OsIcon";
import {
  canvasDraftChanged as dirty,
  setCanvasExportDraft,
  type CanvasNoteDraft,
} from "../../services/notebook-export";
import {
  connectionIsCurrent,
  type CanvasNote,
  type ConnectionResult,
} from "../../domain/canvas";
import {
  useCanvas,
  observeCanvas,
  setCanvasContext,
  selectCanvasNote,
  clearCanvasSelection,
  dismissCanvasInvitation,
  cancelConnection,
  beginConnection,
  keepConnection,
  removeCanvasConnection,
  putCanvasNote,
  removeCanvasNote,
  moveCanvasNote,
} from "../../services/canvas-runtime";
import "./canvas.css";

export function Canvas({ blocked }: { blocked: boolean }) {
  const { notes, connections, selected, ready, phase, result, error } =
    useCanvas();
  const enabled = useInteraction((s) => s.settings.helpfulProposals);
  const [editor, setEditor] = useState<CanvasNoteDraft>();
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const [inspect, setInspect] = useState<string>();
  const [showInspector, setShowInspector] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [positionSaving, setPositionSaving] = useState(false);
  const positionLock = useRef(false);
  const [moving, setMoving] = useState<{ id: string; x: number; y: number }>();
  const stopGesture = useRef<(() => void) | undefined>(undefined);
  const root = useRef<HTMLElement>(null);
  const busy = phase === "loading" || phase === "saving";

  useEffect(() => {
    setCanvasExportDraft(editor);
    return () => setCanvasExportDraft(undefined);
  }, [editor]);
  useEffect(() => {
    const stop = observeCanvas();
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => {
      stopGesture.current?.();
      setCanvasContext({ visible: false, blocked: true, enabled: false });
      stop();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    setCanvasContext({
      visible: true,
      blocked: blocked || !!editor || saving || !!moving,
      enabled,
    });
  }, [blocked, editor, saving, moving, enabled]);
  useEffect(() => {
    if (blocked) stopGesture.current?.();
  }, [blocked]);
  useEffect(() => {
    const leaving = (e: BeforeUnloadEvent) => {
      if (dirty(editor) || saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    return () => window.removeEventListener("beforeunload", leaving);
  }, [editor, saving]);
  useEffect(() => {
    setInspect(undefined);
  }, [selected.join("|")]);

  function close() {
    if (saving) return;
    if (
      dirty(editor) &&
      !window.confirm("Note changes are not saved. Close the canvas anyway?")
    )
      return;
    useInteraction.setState({ canvas: false });
  }
  function edit(note?: CanvasNote) {
    if (
      saving ||
      (dirty(editor) && !window.confirm("Discard unsaved note changes?"))
    )
      return;
    cancelConnection();
    setLocalError("");
    setNotice("");
    setInspect(undefined);
    setEditor(
      note
        ? {
            original: note,
            title: note.title,
            text: note.text,
            x: note.x,
            y: note.y,
          }
        : {
            title: "",
            text: "",
            x: 28 + (notes.length % 4) * 300,
            y: 28 + (Math.floor(notes.length / 4) % 5) * 210,
          },
    );
  }
  async function saveNote() {
    if (!editor || saving) return;
    const old = editor.original;
    const changed =
      !old || old.title !== editor.title || old.text !== editor.text;
    const note: CanvasNote = {
      id: old?.id ?? crypto.randomUUID(),
      title: editor.title,
      text: editor.text,
      x: editor.x,
      y: editor.y,
      version: old ? old.version + Number(changed) : 1,
      revision: old ? old.revision + 1 : 1,
      updatedAt: new Date().toISOString(),
    };
    setSaving(true);
    setLocalError("");
    try {
      await putCanvasNote(note, old?.revision ?? null);
      setEditor(undefined);
      setNotice("Note saved");
    } catch (e) {
      setLocalError(
        e instanceof Error
          ? e.message
          : "Could not save note. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(note: CanvasNote) {
    if (
      !window.confirm(
        "Remove this note? Saved connections to it will also be removed.",
      )
    )
      return;
    setLocalError("");
    try {
      await removeCanvasNote(note);
      if (editor?.original?.id === note.id) setEditor(undefined);
      setInspect(undefined);
      setNotice("Note and its connections removed");
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : "Could not remove. Please try again.",
      );
    }
  }
  async function move(note: CanvasNote, x: number, y: number) {
    if (positionLock.current) return;
    positionLock.current = true;
    setPositionSaving(true);
    setLocalError("");
    try {
      await moveCanvasNote(
        note,
        Math.max(0, Math.min(1340, x)),
        Math.max(0, Math.min(1010, y)),
      );
    } catch (e) {
      setLocalError(
        e instanceof Error
          ? e.message
          : "Could not save position. Please try again.",
      );
    } finally {
      positionLock.current = false;
      setPositionSaving(false);
    }
  }
  function drag(e: PointerEvent<HTMLButtonElement>, note: CanvasNote) {
    if (e.button !== 0 || saving || stopGesture.current) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget,
      pointerId = e.pointerId,
      sx = e.clientX,
      sy = e.clientY;
    let x = note.x,
      y = note.y,
      ended = false;
    el.setPointerCapture(pointerId);
    document.documentElement.dataset.wispGesture = "drag";
    setMoving({ id: note.id, x, y });
    const update = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      x = Math.round(Math.max(0, Math.min(1340, note.x + event.clientX - sx)));
      y = Math.round(Math.max(0, Math.min(1010, note.y + event.clientY - sy)));
      setMoving({ id: note.id, x, y });
    };
    const end = (commit: boolean) => {
      if (ended) return;
      ended = true;
      el.removeEventListener("pointermove", update);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
      delete document.documentElement.dataset.wispGesture;
      stopGesture.current = undefined;
      if (el.isConnected && el.hasPointerCapture(pointerId))
        el.releasePointerCapture(pointerId);
      setMoving(undefined);
      if (commit && (x !== note.x || y !== note.y)) void move(note, x, y);
    };
    const release = (event: globalThis.PointerEvent) => {
      if (event.pointerId === pointerId) end(true);
    };
    const cancel = () => end(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    stopGesture.current = cancel;
    el.addEventListener("pointermove", update);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
  }
  function choose(id: string, additive: boolean) {
    setLocalError("");
    setNotice("");
    selectCanvasNote(id, additive);
  }
  const positioned = notes.map((n) =>
    moving?.id === n.id ? { ...n, x: moving.x, y: moving.y } : n,
  );
  const detail =
    result ?? connections.find((connection) => connection.id === inspect);
  const candidate =
    phase === "candidate" || phase === "saving" ? result : undefined;
  const selectedNotes = selected
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is CanvasNote => !!n);
  const canConnect =
    selectedNotes.length === 2 &&
    selectedNotes.every((n) => !!n.text.trim()) &&
    selectedNotes.reduce((sum, n) => sum + n.text.length, 0) <= 60000;
  const inspectorOpen =
    showInspector ||
    (!!editor && !editor.original) ||
    (!editor && selected.length > 0) ||
    (!editor && !!detail) ||
    busy ||
    !!localError ||
    !!error ||
    !ready;
  const line = (record: ConnectionResult, isCandidate: boolean) => {
    const a = positioned.find((n) => n.id === record.notes[0].id);
    const b = positioned.find((n) => n.id === record.notes[1].id);
    if (!a || !b || !record.connections.length) return null;
    const x1 = a.x + (b.x >= a.x ? 260 : 0),
      x2 = b.x + (b.x >= a.x ? 0 : 260);
    const y1 = a.y + 95,
      y2 = b.y + 95,
      mx = (x1 + x2) / 2;
    return (
      <path
        key={record.id}
        data-state={
          isCandidate
            ? "candidate"
            : connectionIsCurrent(record, notes)
              ? "confirmed"
              : "stale"
        }
        d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
      />
    );
  };

  return (
    <section
      className="canvas-window"
      data-maximized={maximized}
      role="region"
      aria-label="Canvas board"
      tabIndex={-1}
      ref={root}
      hidden={blocked}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || moving) return;
        e.stopPropagation();
        if (editor) {
          if (
            !saving &&
            (!dirty(editor) || window.confirm("Discard unsaved note changes?"))
          )
            setEditor(undefined);
        } else if (busy || result || phase === "inviting") cancelConnection();
        else close();
      }}
    >
      <header className="canvas-header">
        <div className="canvas-window-controls">
          <button
            aria-label="Close canvas"
            title="Close canvas"
            onClick={close}
            disabled={saving}
          />
          <button
            aria-label={maximized ? "Restore canvas" : "Maximize canvas"}
            title={maximized ? "Restore canvas" : "Maximize canvas"}
            onClick={() => setMaximized(!maximized)}
          />
        </div>
        <h2>
          <OsIcon name="squares-four" /> Canvas{" "}
          <span>— Ideas & connections</span>
        </h2>
        <div className="canvas-header-actions">
          <button onClick={() => edit()} disabled={!ready || saving}>
            New note
          </button>
        </div>
      </header>
      <div className="canvas-toolbar">
        <span>Shift-click two notes, or use their checkboxes</span>
        <span role="status">Selected {selected.length} / 2 notes</span>
        <button
          disabled={!selected.length || saving}
          onClick={clearCanvasSelection}
        >
          Clear selection
        </button>
        <button
          aria-expanded={inspectorOpen}
          onClick={() => setShowInspector(!showInspector)}
        >
          Connections {connections.length ? `(${connections.length})` : ""}
        </button>
      </div>
      <div className="canvas-body" data-inspector={inspectorOpen}>
        <div
          className="canvas-scroll"
          tabIndex={0}
          aria-label="Canvas workspace"
        >
          <div className="canvas-intro">
            <span>THOUGHTS, STILL GROWING</span>
            <h3>A few threads of Mistport</h3>
            <p>
              Click a note to write. Shift-click two notes to explore a
              connection.
            </p>
          </div>
          <div className="canvas-board" data-testid="canvas-board">
            <svg
              className="canvas-lines"
              width="1600"
              height="1200"
              aria-hidden="true"
            >
              {connections.map((c) => line(c, false))}
              {candidate && line(candidate, true)}
            </svg>
            {ready && !notes.length && (
              <div className="canvas-empty">
                <span>Two notes, one new angle.</span>
                <p>
                  Start with an idea, add text, and invite Wisp to find a
                  connection.
                </p>
                <button onClick={() => edit()}>Add the first note</button>
              </div>
            )}
            {positioned.map((note, index) => (
              <article
                key={note.id}
                className={`canvas-note tone-${index % 4}`}
                data-testid="canvas-note"
                data-note-id={note.id}
                data-selected={selected.includes(note.id)}
                data-editing={editor?.original?.id === note.id}
                style={{ left: note.x, top: note.y }}
                tabIndex={0}
                aria-label={`Note ${note.title || "Untitled"}`}
                onPointerDown={(e) => {
                  if (
                    e.shiftKey &&
                    !(e.target as HTMLElement).closest(
                      "button,input,label,textarea,form",
                    )
                  )
                    e.preventDefault();
                }}
                onClick={(e) => {
                  if (
                    !(e.target as HTMLElement).closest(
                      "button,input,label,textarea,form",
                    )
                  )
                    choose(note.id, e.shiftKey);
                }}
                onKeyDown={(e) => {
                  if (
                    e.target === e.currentTarget &&
                    (e.key === " " || e.key === "Enter")
                  ) {
                    e.preventDefault();
                    choose(note.id, e.shiftKey);
                  }
                }}
              >
                <div className="canvas-note-top">
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(note.id)}
                      aria-label={`Select note ${note.title || "Untitled"}`}
                      onChange={() => choose(note.id, true)}
                    />
                    Select
                  </label>
                  <button
                    className="canvas-note-grip"
                    aria-label={`Move note ${note.title || "Untitled"}`}
                    title="Drag, or focus and use arrow keys to move"
                    disabled={saving || !!editor || positionSaving}
                    onPointerDown={(e) => drag(e, note)}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 1 : 20;
                      const delta: Record<string, [number, number]> = {
                        ArrowLeft: [-step, 0],
                        ArrowRight: [step, 0],
                        ArrowUp: [0, -step],
                        ArrowDown: [0, step],
                      };
                      if (delta[e.key]) {
                        e.preventDefault();
                        e.stopPropagation();
                        void move(
                          note,
                          note.x + delta[e.key][0],
                          note.y + delta[e.key][1],
                        );
                      }
                    }}
                  >
                    Move
                  </button>
                </div>
                {editor?.original?.id === note.id ? (
                  <form
                    className="canvas-inline-editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveNote();
                    }}
                  >
                    <input
                      aria-label="Note title"
                      maxLength={1000}
                      value={editor.title}
                      disabled={saving}
                      onChange={(e) =>
                        setEditor({ ...editor, title: e.target.value })
                      }
                    />
                    <textarea
                      autoFocus
                      aria-label="Note text"
                      maxLength={60000}
                      rows={6}
                      value={editor.text}
                      disabled={saving}
                      onChange={(e) =>
                        setEditor({ ...editor, text: e.target.value })
                      }
                    />
                    <div className="canvas-actions">
                      <button
                        type="submit"
                        className="canvas-primary"
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save note"}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setEditor(undefined)}
                      >
                        Cancel editing
                      </button>
                    </div>
                    <small>Changes stay here until you save.</small>
                  </form>
                ) : (
                  <>
                    <h3>{note.title || "Untitled note"}</h3>
                    <button
                      className="canvas-note-text"
                      aria-label={`Edit text of ${note.title || "Untitled note"}`}
                      disabled={saving || positionSaving}
                      onClick={(e) =>
                        e.shiftKey ? choose(note.id, true) : edit(note)
                      }
                    >
                      {note.text || "Click to write an idea."}
                    </button>
                  </>
                )}
                <div className="canvas-note-actions">
                  <small>Version {note.version}</small>
                  <button
                    onClick={() => edit(note)}
                    disabled={saving || positionSaving}
                    hidden={editor?.original?.id === note.id}
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Remove note ${note.title || "Untitled"}`}
                    onClick={() => void remove(note)}
                    disabled={saving || !!editor || positionSaving}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside
          className="canvas-sidebar"
          aria-label="Canvas actions"
          hidden={!inspectorOpen}
        >
          {!ready && <p role="status">Loading canvas…</p>}
          {(localError || error) && (
            <p className="canvas-error" role="alert">
              {localError || error}
            </p>
          )}
          {notice && (
            <p className="canvas-notice" role="status">
              {notice}
            </p>
          )}
          {editor && !editor.original ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveNote();
              }}
            >
              <span className="eyebrow">A note</span>
              <h3>{editor.original ? "Edit idea" : "Write a new idea"}</h3>
              <label className="canvas-field">
                Note title
                <input
                  autoFocus
                  maxLength={1000}
                  value={editor.title}
                  disabled={saving}
                  onChange={(e) =>
                    setEditor({ ...editor, title: e.target.value })
                  }
                />
              </label>
              <label className="canvas-field">
                Note text
                <textarea
                  aria-label="Note text"
                  rows={8}
                  maxLength={60000}
                  value={editor.text}
                  disabled={saving}
                  onChange={(e) =>
                    setEditor({ ...editor, text: e.target.value })
                  }
                />
              </label>
              <div className="canvas-coordinates">
                <label>
                  Horizontal position
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={1340}
                    value={editor.x}
                    disabled={saving}
                    onChange={(e) =>
                      setEditor({ ...editor, x: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Vertical position
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={1010}
                    value={editor.y}
                    disabled={saving}
                    onChange={(e) =>
                      setEditor({ ...editor, y: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="canvas-actions">
                <button
                  type="submit"
                  className="canvas-primary"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save note"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditor(undefined)}
                >
                  Cancel editing
                </button>
              </div>
              <p className="canvas-muted">
                Saved to this browser. Pasted text can also be edited here.
              </p>
            </form>
          ) : (
            <>
              <div className="canvas-selection">
                <span className="eyebrow">Current materials</span>
                <h3>Select, then find</h3>
                {selectedNotes.length ? (
                  selectedNotes.map((n) => (
                    <div className="canvas-source" key={n.id}>
                      <strong>{n.title || "Untitled note"}</strong>
                      <small>Full text · Version {n.version}</small>
                      <details>
                        <summary>View this text</summary>
                        <p>{n.text || "Empty note"}</p>
                      </details>
                    </div>
                  ))
                ) : (
                  <p className="canvas-muted">
                    Select two non-empty notes to see whether they have a
                    connection worth keeping.
                  </p>
                )}
              </div>
              {!enabled && (
                <p className="canvas-muted">
                  Helpful proposals are off; you can still find connections
                  yourself.
                </p>
              )}
              {selectedNotes.length === 2 && (
                <p className="canvas-muted">
                  Only clicking “Find connection” sends both notes in full to
                  Gemini. The combined text is limited to 60,000 characters.
                </p>
              )}
              {phase === "inviting" && (
                <section
                  className="canvas-invitation"
                  aria-label="Find connection proposal"
                >
                  <h3>Find a connection between them?</h3>
                  <p>You decide whether to keep the returned connection.</p>
                  <div className="canvas-actions">
                    <button
                      className="canvas-primary"
                      disabled={!canConnect}
                      onClick={() => void beginConnection()}
                    >
                      Find connection
                    </button>
                    <button onClick={dismissCanvasInvitation}>Not now</button>
                  </div>
                </section>
              )}
              {phase === "loading" && (
                <div className="canvas-invitation" aria-busy="true">
                  <p role="status">Finding a connection…</p>
                  <button onClick={cancelConnection}>Stop waiting</button>
                </div>
              )}
              {phase === "none" && (
                <p role="status">
                  {result?.reason || "No connection to propose was found."}
                </p>
              )}
              {!busy && !result?.connections.length && phase !== "inviting" && (
                <button
                  disabled={!canConnect}
                  onClick={() => void beginConnection()}
                >
                  {phase === "error"
                    ? "Retry finding connection"
                    : "Find connection"}
                </button>
              )}
              {detail?.connections[0] && (
                <section
                  className="canvas-explanation"
                  aria-label="Connection explanation"
                >
                  <span className="eyebrow">
                    {result
                      ? "Candidate connection · awaiting your confirmation"
                      : "Kept connection"}
                  </span>
                  <h3>{detail.connections[0].title}</h3>
                  <p>{detail.connections[0].explanation}</p>
                  {!connectionIsCurrent(detail, notes) && (
                    <p className="canvas-stale">
                      Note content changed; review this connection. The evidence
                      below uses the analyzed versions.
                    </p>
                  )}
                  {detail.connections[0].evidence.map((e, i) => (
                    <blockquote key={i}>
                      <small>
                        {detail.notes.find((n) => n.id === e.noteId)?.title ||
                          "Untitled note"}{" "}
                        · Version{" "}
                        {detail.notes.find((n) => n.id === e.noteId)?.version}
                      </small>
                      {e.quote}
                    </blockquote>
                  ))}
                  {result && (
                    <div className="canvas-actions">
                      <button
                        className="canvas-primary"
                        disabled={
                          phase !== "candidate" ||
                          !connectionIsCurrent(result, notes)
                        }
                        onClick={() => void keepConnection()}
                      >
                        {phase === "saving"
                          ? "Saving connection…"
                          : "Keep connection"}
                      </button>
                      <button
                        disabled={phase === "saving"}
                        onClick={cancelConnection}
                      >
                        Do not keep
                      </button>
                    </div>
                  )}
                </section>
              )}
              <section className="canvas-saved">
                <h3>
                  Kept <span>{connections.length}</span>
                </h3>
                {!connections.length && (
                  <p className="canvas-muted">
                    The connection stays on the canvas only after you accept it.
                  </p>
                )}
                {connections.map((c) => (
                  <div className="canvas-saved-item" key={c.id}>
                    <button
                      className="canvas-relation-title"
                      onClick={() => {
                        cancelConnection();
                        setInspect(c.id);
                      }}
                    >
                      {c.connections[0]?.title}
                    </button>
                    <small>
                      {c.notes
                        .map((n) => n.title || "Untitled note")
                        .join(" ↔ ")}
                    </small>
                    {!connectionIsCurrent(c, notes) && (
                      <span className="canvas-stale">Needs review</span>
                    )}
                    <button
                      className="canvas-unlink"
                      aria-label={`Remove connection ${c.connections[0]?.title}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this saved connection? Both notes will be kept.",
                          )
                        )
                          void removeCanvasConnection(c.id)
                            .then(() => setInspect(undefined))
                            .catch((e) => setLocalError(String(e)));
                      }}
                    >
                      Remove connection
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
        </aside>
      </div>
      <footer className="canvas-footer">
        <span>{notes.length} notes · Saved in this browser</span>
        <span role="status">
          {notice || "Select two notes to find a connection"}
        </span>
      </footer>
    </section>
  );
}
