import { useEffect, useRef } from "react";
import { Sprite } from "./Sprite";
import type { Familiar } from "../../domain/model";
import { SUMMON_FLIGHT_EVENT, type SummonFlightSignal } from "./summon-flight";
import "./familiar-flight.css";

function targetBox(familiar: Familiar) {
  // The narrow layout hides the marker; its task records remain in the grimoire.
  const targets = [
    document.querySelector(`.familiar-marker [data-familiar="${familiar}"]`),
    document.querySelector(".familiar-marker > span"),
    document.querySelector('button[aria-label="Grimoire"]'),
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
  const particles = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current!;
    let animation: Animation | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let spriteTimer: ReturnType<typeof setInterval> | undefined;
    const particleTimers = new Set<ReturnType<typeof setTimeout>>();
    const sparkles = (x: number, y: number, count: number) => {
      if (reduced) return;
      for (let i = 0; i < count; i++) {
        const star = document.createElement("span");
        star.className = "familiar-sparkle";
        star.style.left = `${x + (Math.random() - .5) * 55}px`;
        star.style.top = `${y + (Math.random() - .5) * 32}px`;
        star.style.animationDelay = `${Math.random() * .2}s`;
        particles.current?.append(star);
        const timeout = setTimeout(() => { star.remove(); particleTimers.delete(timeout); }, 1200);
        particleTimers.add(timeout);
      }
    };
    const clear = () => {
      animation?.cancel();
      animation = undefined;
      clearTimeout(timer);
      clearInterval(spriteTimer);
      for (const timeout of particleTimers) clearTimeout(timeout);
      particleTimers.clear();
      particles.current?.replaceChildren();
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
      const box = targetBox(signal.familiar);
      if (!box) return;
      const clamp = (value: number, size: number) =>
        Math.max(24, Math.min(value, size - 24));
      const x = clamp(signal.x, innerWidth);
      const y = clamp(signal.y, innerHeight);
      const targetX = clamp(box.left + box.width / 2, innerWidth);
      const targetY = clamp(box.top + box.height / 2, innerHeight);
      element.dataset.familiar = signal.familiar;
      const sprites = { page_sprite: ["book_open", "book_left"], scout_bat: ["bat_open", "bat_rest"], alchemy_imp: ["pot_low", "pot_high"] }[signal.familiar];
      const sprite = element.querySelector<HTMLImageElement>(`.flight-${{page_sprite: "page-sprite", scout_bat: "scout-bat", alchemy_imp: "alchemy-imp"}[signal.familiar]}`)!;
      sprite.src = `/assets/prototype/${sprites[0]}.png`;
      element.dataset.flight = reduced ? "handoff" : "flying";
      const name = element.querySelector(".summon-name")!;
      name.textContent = `${{ page_sprite: "Page Sprite", scout_bat: "Scout Bat", alchemy_imp: "Alchemy Imp" }[signal.familiar]} answers your call.`;
      // Keep the ritual's label inside the viewport without moving the captured origin.
      (name as HTMLElement).style.transform =
        `translate(${Math.max(0, 110 - x) - Math.max(0, x + 110 - innerWidth)}px, ${-Math.max(0, y + 92 - innerHeight)}px)`;
      element.style.left = `${targetX - 24}px`;
      element.style.top = `${targetY - 24}px`;
      if (reduced) {
        timer = setTimeout(clear, 500);
      } else {
        sparkles(x, y, 20);
        let frame = 0;
        spriteTimer = setInterval(() => {
          sprite.src = `/assets/prototype/${sprites[++frame % 2]}.png`;
        }, 160);
        timer = setTimeout(() => {
          clearInterval(spriteTimer);
          sprite.src = `/assets/prototype/${sprites[0]}.png`;
        }, 1700);
        // A second enqueue can replace a flight before the browser paints "none".
        for (const decoration of element.getAnimations({ subtree: true })) {
          decoration.currentTime = 0;
          decoration.play();
        }
        const dx = x - targetX;
        const dy = y - targetY;
        const flight = Array.from({ length: 33 }, (_, index) => {
          const t = index / 32;
          const remaining = Math.pow(1 - t, 3);
          return { transform: `translate(${dx * remaining}px, ${dy * remaining - Math.sin(t * Math.PI) * 65}px) rotate(${Math.sin(t * Math.PI) * 12}deg) scale(${.6 + t * .4})`, opacity: 1, offset: (1700 + 1150 * t) / 2850 };
        });
        animation = element.animate(
          [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 1, offset: 0 },
           { transform: `translate(${dx}px, ${dy}px)`, opacity: 1, offset: 1699 / 2850 }, ...flight],
          { duration: 2850, easing: "linear" },
        );
        animation.onfinish = () => { clear(); sparkles(targetX, targetY, 7); };
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
    <>
    <div ref={particles} className="familiar-sparkles" aria-hidden="true" />
    <div
      ref={ref}
      className="familiar-flight"
      data-flight="none"
      aria-hidden="true"
    >
      <div className="summon-ritual">
        <img
          className="ceremony-circle back"
          src="/assets/prototype/quiet-ring.png"
          alt=""
        />
        <img
          className="ceremony-circle front"
          src="/assets/prototype/quiet-ring.png"
          alt=""
        />
        <div className="summon-glow" />
        <span className="summon-name" />
      </div>
      <Sprite name="book" className="flight-page-sprite" />
      <Sprite name="summon" className="flight-scout-bat" />
      <Sprite name="create" className="flight-alchemy-imp" />
    </div>
    </>
  );
}
