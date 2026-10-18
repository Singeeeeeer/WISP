import { useId } from "react";
import "./character-pose.css";

export type CharacterPoseName =
  | "flying"
  | "reading"
  | "checking"
  | "creating"
  | "brewing"
  | "hat"
  | "sweep"
  | "nap";

const atlas = "/assets/wisp/wisp-atlas.png";
const hatOutline =
  "M56 94L66 58L93 34L145 34L182 62L198 79L246 75L245 99L224 121L173 140L61 153L61 123Z";

function CharacterCell({ column }: { column: number }) {
  return (
    <svg viewBox={`${column * 313.5 + 28} 55 270 260`} width="270" height="260">
      <image href={atlas} width="1254" height="1254" />
    </svg>
  );
}

function Spark({
  x,
  y,
  className = "",
}: {
  x: number;
  y: number;
  className?: string;
}) {
  return (
    <path
      className={className}
      transform={`translate(${x} ${y})`}
      d="M0-8H3V-3H8V0H3V5H0V0H-5V-3H0Z"
    />
  );
}

/** Existing atlas poses with lightweight decoration; task timing belongs to Companion. */
export function CharacterPose({
  pose,
  success = false,
}: {
  pose: CharacterPoseName;
  success?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const column =
    pose === "checking"
      ? 1
      : pose === "reading" || pose === "creating"
        ? 2
        : pose === "brewing" || pose === "sweep"
          ? 3
          : 0;
  return (
    <svg
      className={`wisp-sprite companion-pose character-pose character-pose-${pose}`}
      viewBox="0 0 270 260"
      data-pose={pose}
      data-success={success ? "true" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {(pose === "brewing" || pose === "sweep") && (
        <defs>
          <clipPath id={`${id}-tool`}>
            <path d="M0 0H270V212H174V260H0Z" />
          </clipPath>
        </defs>
      )}
      {pose === "hat" ? (
        <>
          <defs>
            <clipPath id={`${id}-hat`}>
              <path d={hatOutline} />
            </clipPath>
            <clipPath id={`${id}-body`}>
              <path d={`M0 0H270V260H0Z ${hatOutline}`} clipRule="evenodd" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-body)`}>
            <CharacterCell column={0} />
          </g>
          <g className="pose-hat-adjust">
            <g clipPath={`url(#${id}-hat)`}>
              <CharacterCell column={0} />
            </g>
          </g>
        </>
      ) : (
        <g className="pose-character">
          <g
            clipPath={
              pose === "brewing" || pose === "sweep"
                ? `url(#${id}-tool)`
                : undefined
            }
          >
            <CharacterCell column={column} />
          </g>
        </g>
      )}
      {pose === "reading" && (
        <g className="pose-reading-lights" fill="#e5b653">
          <Spark x={231} y={142} className="pose-light" />
          <circle
            cx="150"
            cy="164"
            r="3"
            className="pose-light pose-light-late"
          />
        </g>
      )}
      {pose === "checking" && (
        <g className="pose-scan" fill="none" stroke="#54c9c1" strokeWidth="4">
          <path d="M235 64L246 90V186L222 203" opacity=".35" />
          <path className="pose-scan-line" d="M214 112H257" />
        </g>
      )}
      {pose === "creating" && (
        <g className="pose-idea" fill="#e5b653">
          <Spark x={232} y={114} className="pose-light" />
          <path
            d="M232 88V81M249 98L255 93M211 98L205 93"
            stroke="#e5b653"
            strokeWidth="4"
          />
        </g>
      )}
      {pose === "brewing" && (
        <g className="pose-cauldron">
          <svg
            x="149"
            y="160"
            width="112"
            height="100"
            viewBox="64 1000 230 215"
          >
            <image href={atlas} width="1254" height="1254" />
          </svg>
          <g fill="#47d3c7" stroke="#168e95" strokeWidth="2">
            <circle className="pose-bubble" cx="193" cy="174" r="5" />
            <circle
              className="pose-bubble pose-bubble-late"
              cx="217"
              cy="164"
              r="4"
            />
          </g>
        </g>
      )}
      {pose === "sweep" && (
        <g className="pose-stardust" fill="#e5b653">
          <Spark x={210} y={236} />
          <path d="M185 246H190V251H185ZM242 230H247V235H242Z" />
        </g>
      )}
      {pose === "nap" && (
        <g
          className="pose-sleep"
          fill="none"
          stroke="#a691ba"
          strokeWidth="4"
          strokeLinejoin="round"
        >
          <path d="M229 91H243L229 107H243M245 67H259L245 83H259" />
        </g>
      )}
      {success && (
        <g
          className="pose-success"
          fill="#ffe69c"
          stroke="#ffe69c"
          strokeWidth="3"
        >
          {(pose === "reading" || pose === "creating") && (
            <path
              fill="none"
              d="M157 145L185 152L224 136L223 193L186 210L160 190Z"
            />
          )}
          <Spark
            x={pose === "checking" ? 242 : 234}
            y={pose === "checking" ? 40 : pose === "brewing" ? 174 : 144}
          />
        </g>
      )}
    </svg>
  );
}
