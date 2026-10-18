import { useEffect, useRef, type PointerEvent } from "react";
import { useDocuments, useWorkspace } from "../../state/stores";
import {
  endDocumentDrag,
  reportImportError,
  requestDocumentCopy,
  startDocumentDrag,
} from "../../services/cauldron-import";
import type { Material, WindowState } from "../../domain/model";
import { DocumentEditor } from "../documents/DocumentEditor";
import { desktopApp } from "./desktop-scene";
import { OsIcon } from "./OsIcon";
export function DesktopWindow({
  window: w,
  material,
}: {
  window: WindowState;
  material: Material;
}) {
  const activate = useWorkspace((s) => s.activate);
  const move = useWorkspace((s) => s.move);
  const active = useWorkspace((s) => s.active === w.id);
  const app = desktopApp(material);
  const status = useDocuments((s) => s.status[material.id]);
  const compact = globalThis.innerWidth <= 600;
  const availableWidth = Math.max(260, globalThis.innerWidth - 24);
  const availableHeight = Math.max(220, globalThis.innerHeight - (compact ? 246 : 138));
  const width = w.maximized
    ? availableWidth
    : Math.min(w.width, availableWidth);
  const height = w.maximized
    ? availableHeight
    : Math.min(w.height, availableHeight);
  const maxY = globalThis.innerHeight - height - (compact ? 234 : 115);
  const x = w.maximized
    ? 12
    : Math.max(8, Math.min(w.x, globalThis.innerWidth - width - 12));
  const y = w.maximized
    ? 12
    : Math.max(8, Math.min(w.y, maxY));
  const maxCompactHeight = Math.min(availableHeight, globalThis.innerHeight - y - 234);
  const stopGesture = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (w.minimized || w.closed || w.maximized) stopGesture.current?.();
    return () => stopGesture.current?.();
  }, [w.minimized, w.closed, w.maximized]);
  function gesture(e: PointerEvent<HTMLElement>, resize: boolean) {
    if (
      e.button !== 0 ||
      (!resize && (e.target as HTMLElement).closest("button")) ||
      w.maximized ||
      document.documentElement.dataset.wispGesture
    )
      return;
    e.preventDefault();
    activate(w.id);
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    el.setPointerCapture(pointerId);
    const surface = el.closest<HTMLElement>(".desktop-window");
    document.documentElement.dataset.wispGesture = resize ? "resize" : "drag";
    if (!resize) surface?.setAttribute("data-wisp-dragging", "true");
    const sx = e.clientX,
      sy = e.clientY;
    const update = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      move(
        w.id,
        resize
          ? {
              width: Math.max(
                Math.min(320, availableWidth),
                Math.min(
                  globalThis.innerWidth - x - 16,
                  width + event.clientX - sx,
                ),
              ),
              height: Math.max(
                220,
                Math.min(
                  compact ? maxCompactHeight : globalThis.innerHeight - y - 140,
                  height + event.clientY - sy,
                ),
              ),
            }
          : {
              x: Math.max(
                0,
                Math.min(
                  globalThis.innerWidth - width - 16,
                  x + event.clientX - sx,
                ),
              ),
              y: Math.max(
                0,
                Math.min(compact ? maxY : globalThis.innerHeight - 240, y + event.clientY - sy),
              ),
            },
      );
    };
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      el.removeEventListener("pointermove", update);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("lostpointercapture", release);
      window.removeEventListener("blur", end);
      window.removeEventListener("keydown", cancel);
      delete document.documentElement.dataset.wispGesture;
      surface?.removeAttribute("data-wisp-dragging");
      stopGesture.current = undefined;
      if (el.isConnected && el.hasPointerCapture(pointerId))
        el.releasePointerCapture(pointerId);
    };
    const release = (event: globalThis.PointerEvent) => {
      if (event.pointerId === pointerId) end();
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") end();
    };
    stopGesture.current = end;
    el.addEventListener("pointermove", update);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("lostpointercapture", release);
    window.addEventListener("blur", end);
    window.addEventListener("keydown", cancel);
  }
  function keyboardMove(e: React.KeyboardEvent<HTMLElement>, resize: boolean) {
    if (
      e.target !== e.currentTarget ||
      w.maximized ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    )
      return;
    e.preventDefault();
    const step = e.shiftKey ? 40 : 16;
    const dx =
      e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    move(
      w.id,
      resize
        ? {
            width: Math.max(
              Math.min(320, availableWidth),
              Math.min(availableWidth - x, width + dx),
            ),
            height: Math.max(220, Math.min(compact ? maxCompactHeight : availableHeight - y, height + dy)),
          }
        : {
            x: Math.max(
              8,
              Math.min(globalThis.innerWidth - width - 12, x + dx),
            ),
            y: Math.max(
              8,
              Math.min(maxY, y + dy),
            ),
          },
    );
  }
  if (w.minimized || w.closed) return null;
  return (
    <section
      className={`desktop-window ${app.tone}-window ${active ? "active focused" : ""} ${w.maximized ? "maximized" : ""}`}
      aria-label={material.title + " window"}
      style={{ left: x, top: y, width, height, zIndex: w.z }}
      onFocusCapture={() => {
        if (!active) activate(w.id);
      }}
      onPointerDownCapture={() => {
        if (!active) activate(w.id);
      }}
    >
      <header
        className="window-titlebar window-bar"
        tabIndex={0}
        aria-label={"Move " + material.title + " window"}
        data-testid={"drag-" + material.id}
        onPointerDown={(e) => gesture(e, false)}
        onKeyDown={(e) => keyboardMove(e, false)}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest("button"))
            move(w.id, { maximized: !w.maximized });
        }}
      >
        <div className="window-controls traffic-lights">
          <button
            data-window-action="close"
            title="Close window"
            aria-label={"Close " + material.title}
            onClick={() => move(w.id, { closed: true, minimized: true })}
          >
            <OsIcon name="x" />
          </button>
          <button
            data-window-action="minimize"
            title="Minimize"
            aria-label={"Minimize " + material.title}
            onClick={() => move(w.id, { minimized: true })}
          >
            <OsIcon name="minus" />
          </button>
          <button
            data-window-action="maximize"
            title={w.maximized ? "Restore window" : "Maximize window"}
            aria-label={
              (w.maximized ? "Restore " : "Maximize ") + material.title
            }
            onClick={() => move(w.id, { maximized: !w.maximized })}
          >
            <OsIcon name="arrows-out-simple" />
          </button>
        </div>
        <div className="window-title">
          <strong>
            <OsIcon name={app.icon} />
            {material.title}
          </strong>
          <small>
            {app.file} ·{" "}
            {status === "saved"
              ? "Saved"
              : status === "failed"
                ? "Save failed"
                : "Editing"}
          </small>
        </div>
        <span className="window-app-label">{app.name}</span>
      </header>
      <div className="os-toolbar">
        <span>
          <OsIcon name={app.icon} />
          {app.name === "Mail"
            ? "Inbox"
            : app.name === "Sheets"
              ? "Event plan"
              : "Document"}
        </span>
        <span>
          {app.name === "Mail"
            ? "Mara · narrative room"
            : app.name === "Sheets"
              ? "Story beats"
              : "Body · 12 pt"}
        </span>
        <button
          className="document-copy-handle"
          aria-label={"Drag into cauldron " + material.title}
          title="Drag toward Inspiration Cauldron, or click to add a full-text copy"
          draggable
          onDragStart={(e) => {
            try {
              startDocumentDrag(material.id, e.dataTransfer);
            } catch (error) {
              e.preventDefault();
              reportImportError(error);
            }
          }}
          onDragEnd={endDocumentDrag}
          onClick={() => requestDocumentCopy(material.id)}
        >
          <OsIcon name="arrow-down" />
          <span>Add to cauldron</span>
        </button>
      </div>
      <DocumentEditor material={material} />
      <button
        className="resize-handle window-resize"
        aria-label={"Resize " + material.title}
        onPointerDown={(e) => gesture(e, true)}
        onKeyDown={(e) => keyboardMove(e, true)}
      >
        <OsIcon name="arrows-out-simple" />
      </button>
    </section>
  );
}
