import { useEffect, useRef } from "react";
import { Sprite } from "./Sprite";
import { SUMMON_FLIGHT_EVENT, type SummonFlightSignal } from "./summon-flight";
import "./familiar-flight.css";

function targetBox() {
  // The narrow layout hides the marker; its task records remain in the grimoire.
  const targets = [
    document.querySelector(".familiar-marker > span"),
    Array.from(document.querySelectorAll(".top-status button")).find(
      (button) => button.textContent?.trim() === "魔法书",
    ),
  ];
  for (const target of targets) {
    const box = target?.getBoundingClientRect();
    if (
      target &&
      box?.width &&
      box.height &&
      getComputedStyle(target).visibility !== "hidden"
    )
      return box;
  }
}

export function FamiliarFlight({
  reduced,
  visible,
}: {
  reduced: boolean;
  visible: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current!;
    let animation: Animation | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      animation?.cancel();
      animation = undefined;
      clearTimeout(timer);
      element.dataset.flight = "none";
    };
    const show = (event: Event) => {
      clear();
      const signal = (event as CustomEvent<SummonFlightSignal>).detail;
      if (
        signal.kind === "clear" ||
        !visible ||
        document.hidden ||
        !document.hasFocus()
      )
        return;
      const box = targetBox();
      if (!box) return;
      const clamp = (value: number, size: number) =>
        Math.max(24, Math.min(value, size - 24));
      const x = clamp(signal.x, innerWidth);
      const y = clamp(signal.y, innerHeight);
      const targetX = clamp(box.left + box.width / 2, innerWidth);
      const targetY = clamp(box.top + box.height / 2, innerHeight);
      element.dataset.familiar = signal.familiar;
      element.dataset.flight = reduced ? "handoff" : "flying";
      element.style.left = `${targetX - 24}px`;
      element.style.top = `${targetY - 24}px`;
      if (reduced) {
        timer = setTimeout(clear, 500);
      } else {
        const dx = x - targetX;
        const dy = y - targetY;
        animation = element.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(.85)`, opacity: 1 },
            {
              transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 20}px) scale(1)`,
              opacity: 1,
              offset: 0.5,
            },
            { transform: "translate(0, 0) scale(.65)", opacity: 0 },
          ],
          { duration: 500, easing: "ease-in-out" },
        );
        animation.onfinish = clear;
      }
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener(SUMMON_FLIGHT_EVENT, show);
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clear();
      window.removeEventListener(SUMMON_FLIGHT_EVENT, show);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [reduced, visible]);
  return (
    <div
      ref={ref}
      className="familiar-flight"
      data-flight="none"
      aria-hidden="true"
    >
      <Sprite name="book" className="flight-page-sprite" />
      <Sprite name="summon" className="flight-scout-bat" />
      <Sprite name="create" className="flight-alchemy-imp" />
    </div>
  );
}
