import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useInteraction } from "../../state/stores";
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

type Editor = {
  original?: CanvasNote;
  title: string;
  text: string;
  x: number;
  y: number;
};
const dirty = (e: Editor | undefined) =>
  !!e &&
  (e.original
    ? e.title !== e.original.title ||
      e.text !== e.original.text ||
      e.x !== e.original.x ||
      e.y !== e.original.y
    : !!e.title || !!e.text);

export function Canvas({ blocked }: { blocked: boolean }) {
  const { notes, connections, selected, ready, phase, result, error } =
    useCanvas();
  const enabled = useInteraction((s) => s.settings.helpfulProposals);
  const [editor, setEditor] = useState<Editor>();
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const [inspect, setInspect] = useState<string>();
  const [positionSaving, setPositionSaving] = useState(false);
  const positionLock = useRef(false);
  const [moving, setMoving] = useState<{ id: string; x: number; y: number }>();
  const stopGesture = useRef<(() => void) | undefined>(undefined);
  const root = useRef<HTMLElement>(null);
  const busy = phase === "loading" || phase === "saving";

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
    if (dirty(editor) && !window.confirm("便笺修改尚未保存，仍要关闭白板吗？"))
      return;
    useInteraction.setState({ canvas: false });
  }
  function edit(note?: CanvasNote) {
    if (
      saving ||
      (dirty(editor) && !window.confirm("放弃尚未保存的便笺修改吗？"))
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
      setNotice("便笺已保存");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "便笺保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }
  async function remove(note: CanvasNote) {
    if (!window.confirm("移除这张便笺？与它相连的已保存关系也会一并移除。"))
      return;
    setLocalError("");
    try {
      await removeCanvasNote(note);
      if (editor?.original?.id === note.id) setEditor(undefined);
      setInspect(undefined);
      setNotice("便笺及关联连线已移除");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "移除失败，请重试。");
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
      setLocalError(e instanceof Error ? e.message : "位置保存失败，请重试。");
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
      role="region"
      aria-label="Canvas 白板"
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
            (!dirty(editor) || window.confirm("放弃尚未保存的便笺修改吗？"))
          )
            setEditor(undefined);
        } else if (busy || result || phase === "inviting") cancelConnection();
        else close();
      }}
    >
      <header className="canvas-header">
        <div>
          <span className="eyebrow">WISP · CANVAS</span>
          <h2>让灵感彼此相连</h2>
        </div>
        <div className="canvas-header-actions">
          <button onClick={() => edit()} disabled={!ready || saving}>
            新建便笺
          </button>
          <button aria-label="关闭白板" onClick={close} disabled={saving}>
            关闭
          </button>
        </div>
      </header>
      <div className="canvas-toolbar">
        <span>Shift 点选两张，或勾选便笺</span>
        <span role="status">已选 {selected.length} / 2 张</span>
        <button
          disabled={!selected.length || saving}
          onClick={clearCanvasSelection}
        >
          清除选择
        </button>
      </div>
      <div className="canvas-body">
        <div className="canvas-scroll" tabIndex={0} aria-label="白板工作面">
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
                <span>两张便笺，一个新角度。</span>
                <p>从一个念头开始，添加文字，再邀请 Wisp 找找联系。</p>
                <button onClick={() => edit()}>添加第一张便笺</button>
              </div>
            )}
            {positioned.map((note, index) => (
              <article
                key={note.id}
                className={`canvas-note tone-${index % 3}`}
                data-testid="canvas-note"
                data-note-id={note.id}
                data-selected={selected.includes(note.id)}
                style={{ left: note.x, top: note.y }}
                tabIndex={0}
                aria-label={`便笺 ${note.title || "未命名"}`}
                onPointerDown={(e) => {
                  if (
                    e.shiftKey &&
                    !(e.target as HTMLElement).closest("button,input,label")
                  )
                    e.preventDefault();
                }}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest("button,input,label"))
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
                      aria-label={`选择便笺 ${note.title || "未命名"}`}
                      onChange={() => choose(note.id, true)}
                    />
                    选择
                  </label>
                  <button
                    className="canvas-note-grip"
                    aria-label={`移动便笺 ${note.title || "未命名"}`}
                    title="拖动，或聚焦后按方向键移动"
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
                    移动
                  </button>
                </div>
                <h3>{note.title || "未命名便笺"}</h3>
                <p>{note.text || "还没有文字，点击编辑写下想法。"}</p>
                <div className="canvas-note-actions">
                  <small>版本 {note.version}</small>
                  <button
                    onClick={() => edit(note)}
                    disabled={saving || positionSaving}
                  >
                    编辑
                  </button>
                  <button
                    aria-label={`移除便笺 ${note.title || "未命名"}`}
                    onClick={() => void remove(note)}
                    disabled={saving || !!editor || positionSaving}
                  >
                    移除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside className="canvas-sidebar" aria-label="白板操作">
          {!ready && <p role="status">正在读取白板…</p>}
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
          {editor ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveNote();
              }}
            >
              <span className="eyebrow">一张便笺</span>
              <h3>{editor.original ? "编辑想法" : "写下新想法"}</h3>
              <label className="canvas-field">
                便笺标题
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
                便笺正文
                <textarea
                  aria-label="便笺正文"
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
                  横向位置
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
                  纵向位置
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
                  {saving ? "保存中…" : "保存便笺"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditor(undefined)}
                >
                  取消编辑
                </button>
              </div>
              <p className="canvas-muted">
                保存到这个浏览器。粘贴的文字也可在这里编辑。
              </p>
            </form>
          ) : (
            <>
              <div className="canvas-selection">
                <span className="eyebrow">当前材料</span>
                <h3>先选择，再寻找</h3>
                {selectedNotes.length ? (
                  selectedNotes.map((n) => (
                    <div className="canvas-source" key={n.id}>
                      <strong>{n.title || "未命名便笺"}</strong>
                      <small>全文 · 版本 {n.version}</small>
                      <details>
                        <summary>查看本次文字</summary>
                        <p>{n.text || "空白便笺"}</p>
                      </details>
                    </div>
                  ))
                ) : (
                  <p className="canvas-muted">
                    选择两张非空便笺，看看它们之间有没有值得保留的联系。
                  </p>
                )}
              </div>
              {!enabled && (
                <p className="canvas-muted">
                  主动提议已关闭，你仍可主动寻找联系。
                </p>
              )}
              {selectedNotes.length === 2 && (
                <p className="canvas-muted">
                  点击“寻找联系”才会将这两张便笺的全文交给 Gemini。正文合计最多
                  60,000 字符。
                </p>
              )}
              {phase === "inviting" && (
                <section
                  className="canvas-invitation"
                  aria-label="寻找联系提议"
                >
                  <h3>要找找它们的联系吗？</h3>
                  <p>返回的关系由你决定是否保留。</p>
                  <div className="canvas-actions">
                    <button
                      className="canvas-primary"
                      disabled={!canConnect}
                      onClick={() => void beginConnection()}
                    >
                      寻找联系
                    </button>
                    <button onClick={dismissCanvasInvitation}>暂时不用</button>
                  </div>
                </section>
              )}
              {phase === "loading" && (
                <div className="canvas-invitation" aria-busy="true">
                  <p role="status">正在寻找联系…</p>
                  <button onClick={cancelConnection}>停止等待</button>
                </div>
              )}
              {phase === "none" && (
                <p role="status">
                  {result?.reason || "这次没有找到可提出的联系。"}
                </p>
              )}
              {!busy && !result?.connections.length && phase !== "inviting" && (
                <button
                  disabled={!canConnect}
                  onClick={() => void beginConnection()}
                >
                  {phase === "error" ? "重试寻找联系" : "寻找联系"}
                </button>
              )}
              {detail?.connections[0] && (
                <section className="canvas-explanation" aria-label="关系解释">
                  <span className="eyebrow">
                    {result ? "候选关系 · 待你确认" : "已保留的关系"}
                  </span>
                  <h3>{detail.connections[0].title}</h3>
                  <p>{detail.connections[0].explanation}</p>
                  {!connectionIsCurrent(detail, notes) && (
                    <p className="canvas-stale">
                      便笺内容已变化，关系待复核。下方依据保留分析时的版本。
                    </p>
                  )}
                  {detail.connections[0].evidence.map((e, i) => (
                    <blockquote key={i}>
                      <small>
                        {detail.notes.find((n) => n.id === e.noteId)?.title ||
                          "未命名便笺"}{" "}
                        · 版本{" "}
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
                        {phase === "saving" ? "保存关系中…" : "保留关系"}
                      </button>
                      <button
                        disabled={phase === "saving"}
                        onClick={cancelConnection}
                      >
                        不保留
                      </button>
                    </div>
                  )}
                </section>
              )}
              <section className="canvas-saved">
                <h3>
                  已保留 <span>{connections.length}</span>
                </h3>
                {!connections.length && (
                  <p className="canvas-muted">
                    认可候选后，连线才会留在白板上。
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
                      {c.notes.map((n) => n.title || "未命名便笺").join(" ↔ ")}
                    </small>
                    {!connectionIsCurrent(c, notes) && (
                      <span className="canvas-stale">待复核</span>
                    )}
                    <button
                      className="canvas-unlink"
                      aria-label={`移除连线 ${c.connections[0]?.title}`}
                      onClick={() => {
                        if (
                          window.confirm("移除这条已保存连线？两张便笺会保留。")
                        )
                          void removeCanvasConnection(c.id)
                            .then(() => setInspect(undefined))
                            .catch((e) => setLocalError(String(e)));
                      }}
                    >
                      移除连线
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
