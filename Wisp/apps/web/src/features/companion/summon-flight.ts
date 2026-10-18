import type { Familiar } from "../../domain/model";

export const SUMMON_FLIGHT_EVENT = "wisp:summon-flight";
export type SummonFlightSignal =
  | { kind: "clear" }
  | { kind: "launch"; familiar: Familiar; x: number; y: number };
let latest = 0;

/** Capture the initiating button before saving; launch only after enqueue succeeds. */
export function captureSummonFlight(
  familiar: Familiar,
  origin: Element,
  input?: { detail: number; clientX: number; clientY: number },
) {
  const ticket = ++latest;
  const box = origin.getBoundingClientRect();
  const x =
    input && input.detail > 0 ? input.clientX : box.left + box.width / 2;
  const y =
    input && input.detail > 0 ? input.clientY : box.top + box.height / 2;
  const emit = (detail: SummonFlightSignal) =>
    window.dispatchEvent(new CustomEvent(SUMMON_FLIGHT_EVENT, { detail }));
  let launched = false;
  emit({ kind: "clear" });
  return () => {
    if (launched) return;
    launched = true;
    if (ticket !== latest || !origin.isConnected || document.hidden) return;
    emit({ kind: "launch", familiar, x, y });
  };
}
