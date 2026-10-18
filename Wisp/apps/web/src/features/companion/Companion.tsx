import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInteraction } from "../../state/stores";
import { Sprite } from "./Sprite";
import { MagicRing } from "./MagicRing";
import { getMagicLayout, type Point } from "./magic-layout";
import { pointer, rememberPointer } from "./pointer";
import {
  besideSurface,
  useBackgroundActivity,
  useCharacterActivity,
} from "./activity";
import { CharacterPose, type CharacterPoseName } from "./CharacterPose";
import { FamiliarFlight } from "./FamiliarFlight";
import "./wand-cursor.css";
import "./companion.css";

const editable =
  'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"]):not([type="hidden"]):not([type="image"]), [contenteditable]:not([contenteditable="false"])';
function isEditing(target: EventTarget | null) {
  return target instanceof Element && !!target.closest(editable);
}

export function Companion() {
  const settings = useInteraction((s) => s.settings);
  const menu = useInteraction((s) => s.menu);
  const foreground = useCharacterActivity((s) => s.current);
  const background = useBackgroundActivity();
  const activity = foreground ?? background;
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const [visual, setVisual] = useState<{
    pose: CharacterPoseName;
    success: boolean;
  }>({ pose: "flying", success: false });
  const visualRef = useRef(visual);
  // The character and ring share one anchor for the entire menu session.
  const anchor = useMemo(() => ({ ...pointer }), [menu]);
  const [viewport, setViewport] = useState(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const reduced = settings.reducedMotion || systemReduced;
  const width = settings.characterSize * 1.5;
  const layout = useMemo(
    () => getMagicLayout(anchor, width, viewport),
    [anchor, width, viewport],
  );
  const ref = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const position = useRef<Point | undefined>(undefined);
  const flight = useRef({ facing: 1, pitch: 0 });
  const gesture = useRef({ pressed: false, selecting: false });
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setSystemReduced(preference.matches);
    const resize = () =>
      setViewport({ width: innerWidth, height: innerHeight });
    preference.addEventListener("change", change);
    window.addEventListener("resize", resize);
    return () => {
      preference.removeEventListener("change", change);
      window.removeEventListener("resize", resize);
    };
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    const direction = heading.current;
    if (!el || !direction || !settings.characterVisible) {
      gesture.current = { pressed: false, selecting: false };
      return;
    }
    const height = (width * 260) / 270;
    // 34px per axis leaves about 48px from the hotspot.
    const gap = 34;
    const limit = (
      value: number,
      size: number,
      viewport: number,
      padding = 8,
    ) => {
      const margin = Math.min(padding, Math.max(0, (viewport - size) / 2));
      return Math.max(margin, Math.min(viewport - size - margin, value));
    };
    const nearby = () => ({
      x: limit(
        pointer.x + gap + width <= innerWidth - 8
          ? pointer.x + gap
          : pointer.x - gap - width,
        width,
        innerWidth,
      ),
      y: limit(
        pointer.y + gap + height <= innerHeight - 8
          ? pointer.y + gap
          : pointer.y - gap - height,
        height,
        innerHeight,
      ),
    });
    const orient = (facing: number, pitch: number) => {
      el.dataset.facing = facing === 1 ? "right" : "left";
      direction.style.transform = `rotate(${pitch}deg) scaleX(${facing})`;
    };
    const place = (x: number, y: number) => {
      position.current = { x, y };
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    if (menu) {
      gesture.current = { pressed: false, selecting: false };
      el.dataset.state = "casting";
      el.dataset.phase = "";
      el.dataset.activitySource = "";
      el.dataset.idleAction = "";
      el.style.visibility = "visible";
      orient(layout.caster.facing, 0);
      place(layout.caster.x, layout.caster.y);
      return;
    }
    let { x, y } = position.current ?? nearby();
    let lastMove = performance.now();
    let previous = lastMove;
    let lastPoint = { ...pointer };
    let lastTurnX = pointer.x;
    let inside = document.hasFocus();
    let frame = 0;
    const showPose = (pose: CharacterPoseName, success = false) => {
      if (
        visualRef.current.pose === pose &&
        visualRef.current.success === success
      )
        return;
      visualRef.current = { pose, success };
      setVisual(visualRef.current);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      rememberPointer(event);
      const dx = event.clientX - lastPoint.x;
      const dy = event.clientY - lastPoint.y;
      // Accumulate slow movement but ignore small reversals from hand jitter.
      const turn = event.clientX - lastTurnX;
      if (Math.hypot(dx, dy) >= 3 || Math.abs(turn) >= 3) {
        if (!reduced) {
          if (Math.abs(turn) >= 3) flight.current.facing = Math.sign(turn);
          const angle = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
          // Keep the gentle climb; make descending movement visibly dive.
          flight.current.pitch =
            angle * (dy > 0 ? 2 / 3 : 0.2) * flight.current.facing;
        }
        if (Math.abs(turn) >= 3) lastTurnX = event.clientX;
        lastPoint = { x: event.clientX, y: event.clientY };
      }
      inside = true;
      lastMove = performance.now();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      lastMove = performance.now();
      gesture.current.pressed = true;
    };
    const end = () => {
      gesture.current.pressed = false;
      gesture.current.selecting = false;
      lastMove = performance.now();
    };
    const selection = () => {
      gesture.current.selecting =
        gesture.current.pressed && !!document.getSelection()?.toString();
    };
    const leave = () => {
      inside = false;
      end();
    };
    const enter = () => {
      inside = true;
      lastMove = performance.now();
      lastPoint = { ...pointer };
      lastTurnX = pointer.x;
    };
    const tick = (now: number) => {
      const current = activityRef.current;
      const yielding =
        !!document.documentElement.dataset.wispGesture ||
        gesture.current.selecting ||
        isEditing(document.activeElement);
      const modal = document.querySelector(
        '[role="dialog"][aria-modal="true"]',
      );
      const working =
        current?.surface.isConnected &&
        !yielding &&
        (!modal || modal === current.surface)
          ? current
          : undefined;
      const box = working?.surface.getBoundingClientRect();
      const blocked = box
        ? Array.from(
            document.querySelectorAll(".desktop textarea"),
            (element) => element.getBoundingClientRect(),
          ).filter((rect) => rect.width > 0 && rect.height > 0)
        : [];
      const taskTarget = box
        ? besideSurface(
            box,
            width,
            height,
            { width: innerWidth, height: innerHeight },
            blocked,
          )
        : undefined;
      const state = yielding
        ? reduced
          ? "still"
          : "yielding"
        : working
          ? working.kind
          : reduced
            ? "still"
            : now - lastMove >= 500
              ? "idle"
              : "following";
      el.dataset.state = state;
      el.dataset.phase = working?.phase ?? "";
      el.dataset.activitySource = working
        ? useCharacterActivity.getState().current === working
          ? "foreground"
          : "background"
        : "";
      // On narrow screens no decoration is preferable to covering the material.
      el.style.visibility =
        (inside || reduced) && (!working || taskTarget) ? "visible" : "hidden";
      orient(
        working
          ? taskTarget && box && taskTarget.x < box.left
            ? 1
            : -1
          : flight.current.facing,
        reduced || working ? 0 : flight.current.pitch,
      );
      const idleAge = now - lastMove;
      const idleStart = settings.idleRhythm === "lively" ? 650 : 1200;
      const idleIndex = Math.floor(Math.max(0, idleAge - idleStart) / 3600) % 3;
      const idleAction =
        state === "idle" &&
        settings.idleAntics &&
        idleAge >= idleStart &&
        (idleAge - idleStart) % 3600 < 1600
          ? (["hat", "sweep", "nap"] as const)[idleIndex]
          : "flying";
      el.dataset.idleAction = idleAction === "flying" ? "" : idleAction;
      showPose(working?.kind ?? idleAction, working?.phase === "success");
      const target =
        taskTarget ??
        (state === "yielding" || state === "still"
          ? {
              x: limit(innerWidth - width - 32, width, innerWidth),
              y: limit(innerHeight - height - 100, height, innerHeight),
            }
          : nearby());
      const alpha = 1 - Math.exp(-Math.min(now - previous, 64) / 110);
      previous = now;
      // Yield immediately so the character never travels across the selection.
      if (state === "yielding" || state === "still" || reduced) {
        x = target.x;
        y = target.y;
      } else {
        x += (target.x - x) * alpha;
        y += (target.y - y) * alpha;
      }
      if (
        working &&
        box &&
        taskTarget &&
        [box, ...blocked].some(
          (rect) =>
            x < rect.right + 8 &&
            x + width > rect.left - 8 &&
            y < rect.bottom + 8 &&
            y + height > rect.top - 8,
        )
      ) {
        x = taskTarget.x;
        y = taskTarget.y;
      }
      // Constrain the rotated sprite, not just its unrotated positioning box.
      const radians =
        (Math.abs(reduced || working ? 0 : flight.current.pitch) * Math.PI) /
        180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const extraX = Math.max(0, (width * cosine + height * sine - width) / 2);
      const extraY = Math.max(0, (width * sine + height * cosine - height) / 2);
      x = limit(x, width, innerWidth, 8 + extraX);
      y = limit(y, height, innerHeight, 8 + extraY);
      place(x, y);
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", enter);
    document.documentElement.addEventListener("pointerleave", leave);
    document.documentElement.addEventListener("pointerenter", enter);
    document.addEventListener("selectionchange", selection);
    tick(performance.now());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", enter);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.documentElement.removeEventListener("pointerenter", enter);
      document.removeEventListener("selectionchange", selection);
    };
  }, [
    settings.characterVisible,
    settings.idleRhythm,
    settings.idleAntics,
    width,
    reduced,
    menu,
    layout,
  ]);

  return (
    <>
      {settings.characterVisible && (
        <div
          ref={ref}
          aria-hidden="true"
          className={"companion" + (reduced ? " still" : "")}
          style={{ width }}
        >
          <div ref={heading} className="companion-heading">
            {menu ? (
              <Sprite name="casting" className="companion-pose" />
            ) : (
              <CharacterPose pose={visual.pose} success={visual.success} />
            )}
          </div>
        </div>
      )}
      {menu && <MagicRing anchor={anchor} layout={layout} reduced={reduced} />}
      <FamiliarFlight reduced={reduced} visible={settings.characterVisible} />
    </>
  );
}
