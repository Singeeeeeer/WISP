import { useEffect, useRef, type PointerEvent } from "react";
import { useWorkspace } from "../../state/stores";
import type { Material, WindowState } from "../../domain/model";
import { DocumentEditor } from "../documents/DocumentEditor";
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
  const width = Math.min(w.width, Math.max(340, globalThis.innerWidth - 32));
  const x = Math.min(w.x, Math.max(0, globalThis.innerWidth - width - 16));
  const y = Math.min(w.y, Math.max(0, globalThis.innerHeight - 260));
  const stopGesture = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (w.minimized) stopGesture.current?.();
    return () => stopGesture.current?.();
  }, [w.minimized]);
  function gesture(e: PointerEvent<HTMLElement>, resize: boolean) {
    if (
      e.button !== 0 ||
      (e.target as HTMLElement).closest("button") ||
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
                340,
                Math.min(
                  globalThis.innerWidth - x - 16,
                  width + event.clientX - sx,
                ),
              ),
              height: Math.max(
                300,
                Math.min(
                  globalThis.innerHeight - y - 140,
                  w.height + event.clientY - sy,
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
                Math.min(globalThis.innerHeight - 240, y + event.clientY - sy),
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
  if (w.minimized) return null;
  return (
    <section
      className={"desktop-window " + (active ? "active" : "")}
      aria-label={material.title + "窗口"}
      style={{ left: x, top: y, width, height: w.height, zIndex: w.z }}
      onFocusCapture={() => {
        if (!active) activate(w.id);
      }}
      onPointerDownCapture={() => {
        if (!active) activate(w.id);
      }}
    >
      <header
        className="window-titlebar"
        data-testid={"drag-" + material.id}
        onPointerDown={(e) => gesture(e, false)}
      >
        <span className="window-dots">
          <i />
          <i />
          <i />
        </span>
        <span>{material.title}</span>
        <button
          title="最小化"
          aria-label={"最小化" + material.title}
          onClick={() => move(w.id, { minimized: true })}
        >
          −
        </button>
      </header>
      <DocumentEditor material={material} />
      <div
        className="resize-handle"
        aria-label={"缩放" + material.title}
        onPointerDown={(e) => gesture(e, true)}
      >
        ◢
      </div>
    </section>
  );
}
