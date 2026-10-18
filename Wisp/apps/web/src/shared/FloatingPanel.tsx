import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { pointer } from "../features/companion/pointer";
import "./floating-panel.css";

/** Non-modal: leaves the document usable without discarding a frozen draft. */
export function FloatingPanel({
  title,
  close,
  busy = false,
  className = "",
  placement = "pointer",
  closeLabel = "Close panel",
  children,
}: {
  title: string;
  close: () => void;
  busy?: boolean;
  className?: string;
  placement?: "pointer" | "left" | "right";
  closeLabel?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchor] = useState(() => ({ ...pointer }));
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const closeRef = useRef(close);
  closeRef.current = close;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useLayoutEffect(() => {
    const panel = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const place = () => {
      const box = { width: panel.offsetWidth, height: panel.offsetHeight };
      const dockTop = document
        .querySelector(".desktop-dock")
        ?.getBoundingClientRect().top;
      const bottom =
        placement === "pointer" && dockTop && dockTop > box.height + 36
          ? dockTop - 12
          : innerHeight - 12;
      const pointerLeft =
        anchor.x + 20 + box.width <= innerWidth - 12
          ? anchor.x + 20
          : anchor.x - box.width - 20;
      const left =
        placement === "left"
          ? 22
          : placement === "right"
            ? innerWidth - box.width - 78
            : pointerLeft;
      setPosition({
        left: Math.max(12, Math.min(left, innerWidth - box.width - 12)),
        top: Math.max(
          12,
          Math.min(
            placement === "pointer" ? anchor.y - 40 : 90,
            bottom - box.height,
          ),
        ),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    window.addEventListener("resize", place);
    panel.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!busyRef.current) closeRef.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", key);
      if (panel.contains(document.activeElement) && previous?.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [anchor, placement]);
  return (
    <div
      ref={ref}
      className={`floating-panel ${className}`.trim()}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      aria-busy={busy}
      tabIndex={-1}
      style={position}
    >
      <header className="floating-heading">
        <span>{title}</span>
        <button aria-label={closeLabel} disabled={busy} onClick={close}>
          ×
        </button>
      </header>
      <div className="floating-content">{children}</div>
    </div>
  );
}
