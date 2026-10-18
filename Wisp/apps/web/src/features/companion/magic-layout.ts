export type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function getMagicLayout(
  anchor: Point,
  characterWidth: number,
  viewport: { width: number; height: number },
) {
  const size = Math.max(
    0,
    Math.min(360, viewport.width - 16, viewport.height - 16),
  );
  const center = {
    x: clamp(anchor.x, size / 2 + 8, viewport.width - size / 2 - 8),
    y: clamp(anchor.y, size / 2 + 8, viewport.height - size / 2 - 8),
  };
  const facing: 1 | -1 = anchor.x < center.x ? -1 : 1;
  const scale = characterWidth / 270;
  const height = 260 * scale;
  // Atlas light center (596, 100), relative to casting viewBox (341.5, 55).
  const tipOffset = { x: (facing === 1 ? 254.5 : 15.5) * scale, y: 45 * scale };
  // Keep the actor inside the central gap between the four fixed buttons.
  const innerHalf = Math.max(0, size * 0.22 - 4);
  const place = (
    desired: number,
    middle: number,
    extent: number,
    available: number,
  ) => {
    const inside =
      extent <= innerHalf * 2
        ? clamp(desired, middle - innerHalf, middle + innerHalf - extent)
        : middle - extent / 2;
    const margin = Math.min(8, Math.max(0, (available - extent) / 2));
    return clamp(inside, margin, Math.max(margin, available - extent - margin));
  };
  const x = place(
    anchor.x - facing * 12 - tipOffset.x,
    center.x,
    characterWidth,
    viewport.width,
  );
  const y = place(
    anchor.y + 4 - tipOffset.y,
    center.y,
    height,
    viewport.height,
  );
  return {
    size,
    center,
    caster: { x, y, facing, tip: { x: x + tipOffset.x, y: y + tipOffset.y } },
  };
}

export type MagicLayout = ReturnType<typeof getMagicLayout>;
