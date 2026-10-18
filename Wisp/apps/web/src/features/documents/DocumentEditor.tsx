import { Fragment, useEffect, useRef, useState } from "react";
import { useDocuments, useInteraction, retrySave } from "../../state/stores";
import { rememberPointer } from "../companion/pointer";
import { useWorkspace } from "../../state/stores";
import { selectText, type Material } from "../../domain/model";
import { requestDocumentCopy } from "../../services/cauldron-import";
import { CHECKLIST_ID, desktopApp } from "../workspace/desktop-scene";
import { SheetEditor } from "../workspace/SheetEditor";
import { documentSections, readingSelection } from "./document-layout";
import "./document-layout.css";
export function DocumentEditor({ material }: { material: Material }) {
  const edit = useDocuments((s) => s.edit);
  const status = useDocuments((s) => s.status[material.id]);
  const error = useDocuments((s) => s.errors[material.id]);
  const selection = useInteraction((s) => s.selection);
  const app = desktopApp(material);
  const [editing, setEditing] = useState(false);
  const reading = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (title.current) {
      title.current.style.height = "auto";
      title.current.style.height = `${title.current.scrollHeight}px`;
    }
  }, [material.title]);
  useEffect(() => {
    const element = title.current;
    if (!element) return;
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (editing) body.current?.focus();
  }, [editing]);
  function readSelection() {
    const range = reading.current && readingSelection(reading.current);
    try {
      useInteraction.setState({
        selection: range
          ? selectText(material, range.start, range.end)
          : undefined,
        selectionError: undefined,
      });
    } catch {
      useInteraction.setState({
        selection: undefined,
        selectionError: {
          materialId: material.id,
          message:
            "Selection is invalid. Select complete text again; it will not expand to the full text automatically.",
        },
      });
    }
  }
  function selectBody(start: number, end: number) {
    if (start === end) {
      useInteraction.setState({
        selection: undefined,
        selectionError: undefined,
      });
      return;
    }
    try {
      useInteraction.setState({
        selection: selectText(material, start, end),
        selectionError: undefined,
      });
    } catch {
      useInteraction.setState({
        selection: undefined,
        selectionError: {
          materialId: material.id,
          message:
            "Selection is invalid. Select complete text again; it will not expand to the full text automatically.",
        },
      });
    }
  }
  return (
    <div
      className={`document-content window-body ${app.name === "Mail" ? "reference-sheet" : app.name === "Sheets" ? "table-sheet" : "document-sheet"}`}
      onContextMenu={(e) => {
        const state = useInteraction.getState();
        if (
          e.shiftKey ||
          state.draft ||
          state.batchDraft ||
          state.cauldron ||
          state.canvas ||
          state.book ||
          state.jointDraft ||
          state.watchDraft
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        useWorkspace.getState().activate("window-" + material.id);
        const el = e.target;
        if (el instanceof HTMLTextAreaElement && el !== title.current) {
          const start = Number(el.dataset.sourceStart ?? 0);
          try {
            useInteraction.setState({
              selection:
                el.selectionStart === el.selectionEnd
                  ? undefined
                  : selectText(
                      material,
                      start + el.selectionStart,
                      start + el.selectionEnd,
                    ),
              selectionError: undefined,
            });
          } catch {
            useInteraction.setState({
              selection: undefined,
              selectionError: {
                materialId: material.id,
                message:
                  "Selection is invalid. Select complete text again; it will not expand to the full text automatically.",
              },
            });
          }
        } else if (reading.current?.contains(el as Node)) readSelection();
        else
          useInteraction.setState({
            selection: undefined,
            selectionError: undefined,
          });
        rememberPointer(e);
        useInteraction.setState({ menu: true });
      }}
    >
      <div className="document-meta">
        <span className="doc-category">{app.category}</span>
        <span data-testid={"save-" + material.id} role="status">
          {status}
        </span>
      </div>
      <label className="sr-only" htmlFor={"title-" + material.id}>
        Document title {material.id}
      </label>
      <textarea
        id={"title-" + material.id}
        className="document-title"
        ref={title}
        rows={1}
        value={material.title}
        maxLength={120}
        onChange={(e) => edit(material.id, "title", e.target.value)}
      />
      <p className="doc-subtitle">{app.subtitle}</p>
      {material.id === CHECKLIST_ID ? (
        <SheetEditor material={material} />
      ) : editing ? (
        <>
          <div className="document-view-tools">
            <span>Editing full text · changes save automatically</span>
            <button onClick={() => setEditing(false)}>Done editing</button>
          </div>
          <textarea
            ref={body}
            className="document-body"
            aria-label={material.title + " text"}
            value={material.text}
            spellCheck={false}
            onPointerDown={(e) => {
              if (e.button === 2 && !e.shiftKey) e.preventDefault();
            }}
            onChange={(e) => edit(material.id, "text", e.target.value)}
            onSelect={(e) => {
              const el = e.currentTarget;
              selectBody(el.selectionStart, el.selectionEnd);
            }}
          />
        </>
      ) : (
        <>
          <div className="document-view-tools">
            <button
              onClick={() => setEditing(true)}
              aria-label={`Edit text of ${material.title}`}
            >
              Edit text
            </button>
          </div>
          <div
            ref={reading}
            className="document-reading"
            aria-label={material.title + " reading view"}
            tabIndex={0}
            onMouseUp={readSelection}
            onKeyUp={readSelection}
            onDoubleClick={() => {
              if (!window.getSelection()?.toString()) setEditing(true);
            }}
          >
            {documentSections(material.text).map((section, index) =>
              section.separator ? (
                <Fragment key={section.start}>{section.text}</Fragment>
              ) : (
                <span
                  className={`document-reading-section${index === 0 && !section.headingLength ? " document-reading-lead" : ""}`}
                  key={section.start}
                >
                  {section.headingLength ? (
                    <>
                      <strong className="document-section-heading">
                        {section.text.slice(0, section.headingLength)}
                      </strong>
                      {section.text.slice(section.headingLength)}
                    </>
                  ) : (
                    section.text
                  )}
                </span>
              ),
            )}
            {!material.text && (
              <span aria-hidden="true" className="document-empty">
                Use Edit text to start writing.
              </span>
            )}
          </div>
        </>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => retrySave(material.id)}>Retry save</button>
        </div>
      )}
      <details className="document-material-actions">
        <summary>Material actions · version {material.version}</summary>
        <div className="document-copy-actions">
          <button onClick={() => requestDocumentCopy(material.id)}>
            Add full copy to cauldron
          </button>
          <button
            disabled={selection?.materialId !== material.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => requestDocumentCopy(material.id, true)}
          >
            Add selection copy to cauldron
          </button>
        </div>
      </details>
      <div className="document-hint">
        Select a passage, then secondary-click for a little magic. Shift +
        right-click opens the browser menu.
      </div>
    </div>
  );
}
