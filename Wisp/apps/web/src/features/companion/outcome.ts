import { pointer } from "./pointer";

export type Outcome = "success" | "error" | "cancel";
export type OutcomeSignal = { kind: Outcome | "clear"; x: number; y: number };
export const OUTCOME_EVENT = "wisp:outcome";
let latest = 0;

/** Bind a short result to the initiating control, not a later pointer position. */
export function captureOutcome(
  origin: Element | null = document.activeElement,
) {
  const ticket = ++latest;
  const surface = origin?.closest(".floating-panel, .dialog, .cauldron");
  const box = origin?.getBoundingClientRect();
  const atControl =
    box &&
    pointer.x >= box.left &&
    pointer.x <= box.right &&
    pointer.y >= box.top &&
    pointer.y <= box.bottom;
  const x = atControl ? pointer.x : box ? box.left + box.width / 2 : pointer.x;
  const y = atControl ? pointer.y : box ? box.top + box.height / 2 : pointer.y;
  let finished = false;
  const emit = (kind: OutcomeSignal["kind"]) =>
    window.dispatchEvent(
      new CustomEvent<OutcomeSignal>(OUTCOME_EVENT, { detail: { kind, x, y } }),
    );
  emit("clear");
  return (kind: Outcome) => {
    if (finished) return false;
    finished = true;
    const modal = Array.from(
      document.querySelectorAll('[role="dialog"][aria-modal="true"]'),
    ).at(-1);
    if (
      ticket !== latest ||
      !origin?.isConnected ||
      !origin.closest(".app-shell") ||
      (surface && !surface.isConnected) ||
      (modal && !modal.contains(origin)) ||
      document.hidden
    )
      return false;
    emit(kind);
    return true;
  };
}
