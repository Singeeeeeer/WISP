import { useEffect, useRef, useState } from "react";
import { useInteraction } from "../../state/stores";
import "./wand-feedback.css";
import { WandOutcome } from "./WandOutcome";

const nativeControl =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .resize-handle';
const unavailable = ':disabled, [aria-disabled="true"]';
function clickable(target: Element | null) {
  if (!target?.closest(".app-shell") || target.closest(unavailable))
    return null;
  if (target.closest(nativeControl)) return null;
  return target.closest("button, a[href], summary");
}

export function WandFeedback() {
  const applicationReduced = useInteraction((s) => s.settings.reducedMotion);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const reduced = applicationReduced || systemReduced;
  const ref = useRef<HTMLDivElement>(null);
  const burst = useRef<SVGSVGElement>(null);
  const spot = useRef({ x: 0, y: 0, inside: false });
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystemReduced(preference.matches);
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const feedback = ref.current!;
    const clickEffect = burst.current!;
    const fine = matchMedia("(any-pointer: fine)");
    let pressed: Element | null = null;
    let down = false;
    let selecting = false;
    let frame = 0;
    let clickAnimation: Animation | undefined;
    const refresh = () => {
      frame = 0;
      const { x, y, inside } = spot.current;
      const target = document.elementFromPoint(x, y);
      const gesture = document.documentElement.dataset.wispGesture;
      let state = "none";
      if (inside && fine.matches && document.hasFocus()) {
        if (gesture === "drag") state = "dragging";
        else if (
          !gesture &&
          target?.closest(".app-shell") &&
          !target.closest(nativeControl) &&
          !target.closest(unavailable) &&
          !selecting
        ) {
          const action = clickable(target);
          if (action) state = action === pressed ? "pressed" : "hover";
          else if (
            !target.closest(".window-titlebar") &&
            target.closest('[aria-busy="true"]')
          )
            state = "progress";
        }
      }
      feedback.dataset.state = state;
      feedback.style.transform = `translate(${x}px, ${y}px)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(refresh);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        spot.current.inside = false;
      } else {
        spot.current = { x: event.clientX, y: event.clientY, inside: true };
      }
      schedule();
    };
    const press = (event: PointerEvent) => {
      move(event);
      if (event.button !== 0 || event.pointerType === "touch") return;
      down = true;
      pressed = clickable(
        event.target instanceof Element ? event.target : null,
      );
      schedule();
    };
    const release = () => {
      down = false;
      pressed = null;
      selecting = false;
      schedule();
    };
    const leave = () => {
      spot.current.inside = false;
      release();
      clickAnimation?.cancel();
    };
    const selection = () => {
      selecting = down && !!document.getSelection()?.toString();
      schedule();
    };
    const click = (event: MouseEvent) => {
      // Native click dispatch already handles releases outside the pressed target.
      if (
        reduced ||
        !fine.matches ||
        !spot.current.inside ||
        event.detail === 0 ||
        event.button !== 0 ||
        event.defaultPrevented ||
        !clickable(event.target instanceof Element ? event.target : null)
      )
        return;
      clickAnimation?.cancel();
      clickEffect.style.left = `${event.clientX - 12}px`;
      clickEffect.style.top = `${event.clientY - 12}px`;
      clickAnimation = clickEffect.animate(
        [
          { opacity: 0.95, transform: "scale(0.5)" },
          { opacity: 0, transform: "scale(1.35)" },
        ],
        { duration: 160, easing: "ease-out" },
      );
    };
    const visibility = () => {
      if (document.hidden) leave();
    };
    // Update a stationary pointer when an async region changes or a panel closes.
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-busy",
        "disabled",
        "aria-disabled",
        "data-wisp-gesture",
      ],
    });
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    document.addEventListener("click", click, true);
    document.addEventListener("selectionchange", selection);
    document.addEventListener("visibilitychange", visibility);
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    fine.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      clickAnimation?.cancel();
      observer.disconnect();
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("selectionchange", selection);
      document.removeEventListener("visibilitychange", visibility);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      fine.removeEventListener("change", schedule);
    };
  }, [reduced]);

  return (
    <>
      <WandOutcome reduced={reduced} />
      <div
        ref={ref}
        className="wand-feedback"
        data-state="none"
        data-reduced={reduced}
        aria-hidden="true"
      >
        <svg className="wand-hover-ring" viewBox="-12 -12 24 24">
          <circle
            cx="1"
            cy="5"
            r="6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
        <svg className="wand-press-glow" viewBox="-12 -12 24 24">
          <path
            d="M1 -2L3 3L8 5L3 7L1 12L-1 7L-6 5L-1 3Z"
            fill="currentColor"
          />
        </svg>
        <svg className="wand-progress" viewBox="-12 -12 24 24">
          <circle
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.7"
            opacity="0.35"
          />
          <path
            d="M0 -11L1.2 -8.2L4 -7L1.2 -5.8L0 -3L-1.2 -5.8L-4 -7L-1.2 -8.2Z"
            fill="currentColor"
          />
          <path
            d="M0 3L1.2 5.8L4 7L1.2 8.2L0 11L-1.2 8.2L-4 7L-1.2 5.8Z"
            fill="currentColor"
          />
        </svg>
        <svg className="wand-traction" viewBox="-12 -12 24 24">
          <circle r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M0 -11V-8M0 8V11M-11 0H-8M8 0H11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
      </div>
      <svg
        ref={burst}
        className="wand-click"
        viewBox="-12 -12 24 24"
        aria-hidden="true"
      >
        <circle r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M0 -11V-7M0 7V11M-11 0H-7M7 0H11M-7 -7L-5 -5M5 5L7 7M-7 7L-5 5M5 -5L7 -7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    </>
  );
}
