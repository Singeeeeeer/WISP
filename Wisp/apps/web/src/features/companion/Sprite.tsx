// Display cells of the supplied transparent atlas without altering the source image.
const cells = {
  witch: [0, 0],
  casting: [1, 0],
  book: [2, 1],
  check: [3, 2],
  create: [1, 3],
  summon: [1, 2],
} as const;
export type SpriteName = keyof typeof cells;
export function Sprite({
  name,
  className = "",
}: {
  name: SpriteName;
  className?: string;
}) {
  const [col, row] = cells[name];
  return (
    <svg
      className={`wisp-sprite ${className}`}
      viewBox={`${col * 313.5 + 28} ${row * 313.5 + 55} 270 260`}
      aria-hidden="true"
      focusable="false"
    >
      <image href="/assets/wisp/wisp-atlas.png" width="1254" height="1254" />
    </svg>
  );
}
