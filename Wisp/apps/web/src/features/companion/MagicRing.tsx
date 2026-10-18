import { useEffect, useRef } from "react";
import { useInteraction } from "../../state/stores";
import { Sprite, type SpriteName } from "./Sprite";
import type { MagicLayout, Point } from "./magic-layout";
import "./magic-ring.css";

const entries = [
  {
    id: "understand",
    label: "Understand",
    subtitle: "解释与摘要",
    sprite: "book",
  },
  { id: "check", label: "Check", subtitle: "疑点与依据", sprite: "check" },
  { id: "create", label: "Create", subtitle: "草稿与方向", sprite: "create" },
  { id: "summon", label: "Summon", subtitle: "一次性委托", sprite: "summon" },
] as const;

export function MagicRing({
  anchor,
  layout,
  reduced,
}: {
  anchor: Point;
  layout: MagicLayout;
  reduced: boolean;
}) {
  const open = useInteraction((s) => s.open);
  const characterVisible = useInteraction((s) => s.settings.characterVisible);
  const ref = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const { size, center, caster } = layout;
  const origin = characterVisible ? caster.tip : anchor;
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const previous = previousFocus.current;
    return () => {
      // Do not steal focus from an opening dialog.
      if (
        !useInteraction.getState().draft &&
        !useInteraction.getState().book &&
        previous?.isConnected
      )
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <>
      <div
        className="ring-dismiss"
        aria-hidden="true"
        onPointerDown={() => useInteraction.setState({ menu: false })}
        onContextMenu={(e) => {
          e.preventDefault();
          useInteraction.setState({ menu: false });
        }}
      />
      {!reduced && (
        <svg
          className="magic-trace"
          aria-hidden="true"
          focusable="false"
          data-anchor-x={anchor.x}
          data-anchor-y={anchor.y}
        >
          <circle
            className="magic-trace-tip"
            cx={origin.x}
            cy={origin.y}
            r="4"
          />
          <path
            className="magic-trace-path"
            d={`M ${origin.x} ${origin.y} L ${anchor.x} ${anchor.y} L ${center.x} ${center.y}`}
            pathLength="1"
          />
          <circle
            className="magic-trace-arrival"
            cx={anchor.x}
            cy={anchor.y}
            r="8"
          />
        </svg>
      )}
      <div
        ref={ref}
        className={"magic-ring" + (reduced ? " magic-ring-reduced" : "")}
        role="menu"
        aria-label="基础能力"
        style={{
          left: center.x - size / 2,
          top: center.y - size / 2,
          width: size,
          height: size,
        }}
        onMouseDown={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          const keys: Record<string, number> = {
            ArrowUp: 0,
            ArrowRight: 1,
            ArrowDown: 2,
            ArrowLeft: 3,
            Home: 0,
            End: 3,
          };
          if (e.key in keys) {
            e.preventDefault();
            ref.current
              ?.querySelectorAll<HTMLButtonElement>("button")
              [keys[e.key]].focus();
          }
          if (e.key === "Tab") {
            e.preventDefault();
            const buttons = [
              ...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ??
                []),
            ];
            const current = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            buttons[(current + (e.shiftKey ? 3 : 1)) % 4]?.focus();
          }
        }}
      >
        <div className="ring-orbit" aria-hidden="true" />
        {entries.map((entry) => (
          <button
            key={entry.id}
            role="menuitem"
            aria-label={entry.label}
            className={`ring-entry ring-${entry.id}`}
            onClick={() => open(entry.id)}
          >
            <Sprite name={entry.sprite as SpriteName} />
            <strong>{entry.label}</strong>
            <small>{entry.subtitle}</small>
          </button>
        ))}
      </div>
    </>
  );
}
