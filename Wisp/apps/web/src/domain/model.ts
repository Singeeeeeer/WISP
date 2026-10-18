export type SummaryStyle = "brief" | "standard";
export type ExcerptLimit = 3 | 8;
export type Operation = "understand" | "check" | "create";
export type Familiar = "scout_bat" | "page_sprite" | "alchemy_imp";
export type FileSource =
  "txt_file" | "docx_file" | "pptx_file" | "xlsx_file" | "pdf_file";
export type CopySource = "document_copy" | "selection_copy";
export type MaterialSource =
  "virtual_document" | "new_text" | "pasted_text" | FileSource | CopySource;
export interface MaterialCopyOrigin {
  materialId: string;
  materialVersion: number;
  title: string;
  start: number;
  end: number;
  source: MaterialSource;
}
export interface MaterialOrigin {
  kind: "new_text" | "pasted_text" | FileSource | CopySource;
  addedAt: string;
  note?: string;
  fileName?: string;
  byteSize?: number;
  lastModified?: number;
  encoding?: "UTF-8";
  copy?: Readonly<MaterialCopyOrigin>;
}
export interface Material {
  id: string;
  kind: "text";
  title: string;
  text: string;
  version: number;
  updatedAt: string;
  source: MaterialSource;
  createdAt?: string;
  origin?: MaterialOrigin;
}
export interface SelectionContext {
  materialId: string;
  materialVersion: number;
  start: number;
  end: number;
  selectedText: string;
}
export interface MaterialSnapshot {
  readonly id: string;
  readonly materialId: string;
  readonly materialVersion: number;
  readonly title: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly capturedAt: string;
  readonly source?: Material["source"];
  readonly origin?: Readonly<MaterialOrigin>;
}
export interface WindowState {
  id: string;
  materialId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  closed?: boolean;
  maximized?: boolean;
}
export interface Settings {
  characterVisible: boolean;
  reducedMotion: boolean;
  idleAntics: boolean;
  idleRhythm: "default" | "lively";
  characterSize: number;
  helpfulProposals: boolean;
}
export interface ActionDraft {
  presentation?: "brewing";
  summaryStyle?: SummaryStyle;
  fromResult?: boolean;
  execution?: "local" | "gemini";
  excerptLimit?: ExcerptLimit;
  entry: Operation | "summon";
  snapshot: MaterialSnapshot;
  instruction: string;
  familiar: Familiar;
}
export const defaultSettings: Settings = {
  characterVisible: true,
  reducedMotion: false,
  idleAntics: true,
  idleRhythm: "default",
  characterSize: 48,
  helpfulProposals: false,
};
export function seeds(): Material[] {
  return [
    {
      id: "proposal",
      title: "Deep Space Receiver — concept brief",
      text: "DEEP SPACE RECEIVER\n\n01 / Signal premise\nA small research vessel drifts beyond mapped space, listening for a voice that should not exist. The player is the receiver's operator: tune the array, decide which fragments deserve trust, and choose what the crew does with each answer.\n\n02 / Core loop\nScan a band of static, isolate a repeating pattern, decode its meaning, then answer or stay silent. Every response changes the ship's route, the crew's confidence, and what the signal is willing to reveal. The loop should feel like solving a mystery with incomplete tools rather than clearing a checklist.\n\n03 / Player promise\nMake the player feel clever, responsible, and slightly afraid of being heard. The strongest moments come from choosing between a useful lie, a dangerous truth, and the quiet option that keeps everyone alive.\n\n04 / Questions to test\nHow much ambiguity can the first hour carry? Which receiver controls make discovery feel physical? How should a wrong interpretation change later scenes without closing the story too early?\n\nThis editable sample is a fictional game design draft.",
    },
    {
      id: "venue",
      title: "Character & story notes",
      text: "DEEP SPACE RECEIVER · CHARACTER & STORY NOTES\n\nMara Vale / receiver operator\nA patient signal analyst who hides a failed rescue behind precise procedures. She wants proof that the missing fleet is alive, even if the proof asks her to break quarantine.\n\nIvo Ren / systems engineer\nIvo keeps the antenna running with parts meant for another ship. He trusts measurements over memories and becomes the first crew member to question Mara's interpretation.\n\nThe voice / unknown signal\nThe transmission answers in borrowed phrases from the crew's logs. It may be a stranded intelligence, a trap, or a mirror made by the receiver itself. Keep its origin unresolved through the first chapter.\n\nStory choices\nTrusting the voice opens a shortcut through the dark but fractures crew confidence. Hiding a fragment protects the crew and costs the player context. Sharing the raw signal lets each character interpret it, creating different alliances before the final transmission.\n\nDesign note\nThe story should change through what the player chooses to reveal, not through a single morality meter. Every branch needs a playable consequence: a route, a tool, a relationship, or a new way to read the next signal.\n\nThis editable sample is a fictional narrative reference.",
    },
  ].map((m) => ({
    ...m,
    kind: "text",
    source: "virtual_document",
    version: 1,
    updatedAt: new Date().toISOString(),
  }));
}
function boundary(text: string, p: number) {
  return !(
    p > 0 &&
    p < text.length &&
    /[\uD800-\uDBFF]/.test(text[p - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[p])
  );
}
export function selectText(
  m: Material,
  start: number,
  end: number,
): SelectionContext {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > m.text.length ||
    !boundary(m.text, start) ||
    !boundary(m.text, end)
  )
    throw new Error("Invalid selection: choose a range of complete characters");
  return {
    materialId: m.id,
    materialVersion: m.version,
    start,
    end,
    selectedText: m.text.slice(start, end),
  };
}
export function snapshot(
  m: Material,
  selection?: SelectionContext,
): MaterialSnapshot {
  if (
    selection &&
    (selection.materialId !== m.id ||
      selection.materialVersion !== m.version ||
      m.text.slice(selection.start, selection.end) !== selection.selectedText)
  )
    throw new Error("The selection is no longer valid. Select it again");
  if (selection) selectText(m, selection.start, selection.end);
  return Object.freeze({
    id: crypto.randomUUID(),
    materialId: m.id,
    materialVersion: m.version,
    title: m.title,
    text: selection?.selectedText ?? m.text,
    start: selection?.start ?? 0,
    end: selection?.end ?? m.text.length,
    capturedAt: new Date().toISOString(),
    ...(m.source ? { source: m.source } : {}),
    ...(m.origin
      ? {
          origin: Object.freeze({
            ...m.origin,
            ...(m.origin.copy
              ? { copy: Object.freeze({ ...m.origin.copy }) }
              : {}),
          }),
        }
      : {}),
  });
}
export function initialWindows(materials: Material[]): WindowState[] {
  const viewportWidth = typeof innerWidth === "number" ? innerWidth : 1440;
  const viewportHeight = typeof innerHeight === "number" ? innerHeight : 1000;
  const desktopWidth = viewportWidth - (viewportWidth < 600 ? 60 : 72);
  const desktopHeight = viewportHeight - 30;
  return materials.map((m, i) => {
    const mail = m.id === "venue";
    const sheet = m.id === "wisp-demo-checklist";
    return {
      id: "window-" + m.id,
      materialId: m.id,
      x: mail
        ? Math.max(200, desktopWidth * 0.58)
        : sheet
          ? Math.max(160, desktopWidth * 0.55)
          : viewportWidth < 900
            ? 24
            : Math.round(desktopWidth * 0.035) +
              (m.id === "proposal" ? 0 : i * 24),
      y: mail
        ? 62
        : sheet
          ? Math.max(210, desktopHeight * 0.46)
          : 42 + (m.id === "proposal" ? 0 : i * 24),
      width: mail
        ? 420
        : sheet
          ? 480
          : Math.min(620, Math.max(480, desktopWidth * 0.5)),
      height: mail
        ? Math.min(340, desktopHeight * 0.42)
        : sheet
          ? Math.min(360, desktopHeight * 0.42)
          : Math.min(710, desktopHeight - 145),
      z: m.id === "proposal" ? 40 : sheet ? 20 : mail ? 12 : 41 + i,
      minimized: false,
      closed: false,
      maximized: false,
    };
  });
}
