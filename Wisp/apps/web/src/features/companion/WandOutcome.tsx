import { useEffect, useRef } from "react";
import { OUTCOME_EVENT, type OutcomeSignal } from "./outcome";
import "./wand-outcome.css";

export function WandOutcome({ reduced }: { reduced: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const element = ref.current!;
    let animation: Animation | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      animation?.cancel();
      clearTimeout(timer);
      element.dataset.outcome = "none";
    };
    const show = (event: Event) => {
      clear();
      const { kind, x, y } = (event as CustomEvent<OutcomeSignal>).detail;
      if (
        kind === "clear" ||
        document.hidden ||
        !document.hasFocus() ||
        !matchMedia("(any-pointer: fine)").matches
      )
        return;
      const clamp = (position: number, size: number) =>
        Math.max(22, Math.min(position, size - 22));
      element.style.left = `${clamp(x, innerWidth) - 18}px`;
      element.style.top = `${clamp(y, innerHeight) - 18}px`;
      element.dataset.outcome = kind;
      if (!reduced) {
        const frames =
          kind === "cancel"
            ? [
                { opacity: 0.95, transform: "scale(1)" },
                { opacity: 0, transform: "scale(0.08)" },
              ]
            : [
                { opacity: 0, transform: "scale(0.65)" },
                { opacity: 1, transform: "scale(1)", offset: 0.2 },
                { opacity: 1, transform: "scale(1)", offset: 0.65 },
                { opacity: 0, transform: "scale(1.15)" },
              ];
        animation = element.animate(frames, {
          duration: 720,
          easing: "ease-out",
        });
      }
      timer = setTimeout(clear, 720);
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener(OUTCOME_EVENT, show);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", visibility);
    document.documentElement.addEventListener("pointerleave", clear);
    return () => {
      clear();
      window.removeEventListener(OUTCOME_EVENT, show);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      document.documentElement.removeEventListener("pointerleave", clear);
    };
  }, [reduced]);
  return (
    <svg
      ref={ref}
      className="wand-outcome"
      data-outcome="none"
      viewBox="-18 -18 36 36"
      aria-hidden="true"
    >
      <g className="outcome-success">
        <path d="M0 -11L3 -3L11 0L3 3L0 11L-3 3L-11 0L-3 -3Z" />
        <path d="M11 -13L12 -10L15 -9L12 -8L11 -5L10 -8L7 -9L10 -10Z" />
        <path d="M-11 7L-10 10L-7 11L-10 12L-11 15L-12 12L-15 11L-12 10Z" />
      </g>
      <g className="outcome-error">
        <circle r="11" />
        <path d="M0 -6V2M0 6V7" />
      </g>
      <g className="outcome-cancel">
        <path d="M-13 -6Q-3 -7 0 0M13 -6Q3 -7 0 0M0 14V3" />
        <circle cx="-13" cy="-6" r="2" />
        <circle cx="13" cy="-6" r="2" />
        <circle cy="14" r="2" />
        <circle r="2" />
      </g>
    </svg>
  );
}
