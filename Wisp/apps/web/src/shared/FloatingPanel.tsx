import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { pointer } from "../features/companion/pointer";
import "./floating-panel.css";

/** Non-modal: leaves the document usable without discarding a frozen draft. */
export function FloatingPanel({
  title,
  close,
  busy = false,
  children,
}: {
  title: string;
  close: () => void;
  busy?: boolean;
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
      const box = panel.getBoundingClientRect();
      const left =
        anchor.x + 20 + box.width <= innerWidth - 12
          ? anchor.x + 20
          : anchor.x - box.width - 20;
      setPosition({
        left: Math.max(12, Math.min(left, innerWidth - box.width - 12)),
        top: Math.max(
          12,
          Math.min(anchor.y - 40, innerHeight - box.height - 12),
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
  }, [anchor]);
  return (
    <div
      ref={ref}
      className="floating-panel"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      aria-busy={busy}
      tabIndex={-1}
      style={position}
    >
      <header className="floating-heading">
        <span>{title}</span>
        <button aria-label="关闭浮层" disabled={busy} onClick={close}>
          ×
        </button>
      </header>
      <div className="floating-content">{children}</div>
    </div>
  );
}
