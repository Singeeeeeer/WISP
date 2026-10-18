// Ephemeral pointer coordinates; do not persist or trigger React renders per move.
export const pointer = { x: 220, y: 250 };
export function rememberPointer(event: { clientX: number; clientY: number }) {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
}
