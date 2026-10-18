import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import type { Outcome } from "./outcome";
import type { Operation } from "../../domain/model";
import type { Task } from "../../domain/task";
import { useTasks } from "../../services/task-runtime";

export type ActivityKind = "reading" | "checking" | "creating" | "brewing";
export interface CharacterActivity {
  id: number | string;
  kind: ActivityKind;
  phase: "working" | "success";
  surface: Element;
}
export const useCharacterActivity = create<{ current?: CharacterActivity }>(
  () => ({}),
);
let serial = 0;

/** Owned by the submitting panel; display timing never controls business work. */
export function useTaskActivity(kind: ActivityKind) {
  const active = useRef<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => {
    clearTimeout(timer.current);
    if (
      active.current !== undefined &&
      useCharacterActivity.getState().current?.id === active.current
    )
      useCharacterActivity.setState({ current: undefined });
    active.current = undefined;
  };
  useEffect(() => clear, []);
  return {
    clear,
    start(origin: Element | null = document.activeElement) {
      clear();
      const surface = origin?.closest(".floating-panel, .dialog");
      if (!surface) return (_outcome: Outcome) => {};
      const id = ++serial;
      active.current = id;
      useCharacterActivity.setState({
        current: { id, kind, phase: "working", surface },
      });
      let finished = false;
      return (outcome: Outcome) => {
        if (
          finished ||
          active.current !== id ||
          useCharacterActivity.getState().current?.id !== id
        )
          return;
        finished = true;
        if (outcome !== "success" || !surface.isConnected) {
          clear();
          return;
        }
        useCharacterActivity.setState({
          current: { id, kind, phase: "success", surface },
        });
        timer.current = setTimeout(clear, 720);
      };
    },
  };
}

export const operationPose = (operation: Operation): ActivityKind =>
  operation === "understand"
    ? "reading"
    : operation === "check"
      ? "checking"
      : "creating";

/** Display actual running work only; restored terminal history never celebrates. */
export function useBackgroundActivity(): CharacterActivity | undefined {
  const tasks = useTasks((s) => s.tasks);
  const foreground = useCharacterActivity((s) => s.current);
  const latest = tasks
    .filter((t) => t.status === "running")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const previous = useRef<Task | undefined>(undefined);
  const [completed, setCompleted] = useState<Task>();
  useEffect(() => {
    const before = previous.current;
    const after = tasks.find((t) => t.id === before?.id);
    previous.current = latest;
    if (!latest && before && after?.status === "completed" && !foreground)
      setCompleted(after);
    else if (
      latest ||
      foreground ||
      (completed &&
        !tasks.some((t) => t.id === completed.id && t.status === "completed"))
    )
      setCompleted(undefined);
  }, [tasks, latest, foreground, completed]);
  useEffect(() => {
    if (!completed) return;
    const timer = setTimeout(() => setCompleted(undefined), 720);
    return () => clearTimeout(timer);
  }, [completed]);
  const task = latest ?? completed;
  const surface =
    typeof document === "undefined"
      ? null
      : document.querySelector(".familiar-marker");
  return task && surface && surface.getBoundingClientRect().width > 0
    ? {
        id: task.id,
        kind:
          task.familiar === "alchemy_imp"
            ? "brewing"
            : operationPose(task.operation),
        phase: latest ? "working" : "success",
        surface,
      }
    : undefined;
}

/** Keep the whole decoration outside the material surface, including its glow. */
export function besideSurface(
  box: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  width: number,
  height: number,
  viewport: { width: number; height: number },
  blocked: Pick<DOMRect, "left" | "right" | "top" | "bottom">[] = [],
) {
  const inset = 12;
  const y = Math.max(
    inset,
    Math.min(box.top + 32, viewport.height - height - inset),
  );
  const x = Math.max(inset, Math.min(box.left, viewport.width - width - inset));
  const candidates = [
    { x: box.right + inset, y },
    { x: box.left - width - inset, y },
    { x, y: box.top - height - inset },
    { x, y: box.bottom + inset },
    { x: viewport.width - width - inset, y: viewport.height - height - 100 },
    { x: inset, y: viewport.height - height - 100 },
  ];
  return candidates.find(
    (p) =>
      p.x >= inset &&
      p.y >= inset &&
      p.x + width <= viewport.width - inset &&
      p.y + height <= viewport.height - inset &&
      [box, ...blocked].every(
        (b) =>
          p.x + width + 8 <= b.left ||
          p.x - 8 >= b.right ||
          p.y + height + 8 <= b.top ||
          p.y - 8 >= b.bottom,
      ),
  );
}
