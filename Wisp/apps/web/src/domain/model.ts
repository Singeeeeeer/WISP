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
}
export interface Settings {
  characterVisible: boolean;
  reducedMotion: boolean;
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
  idleRhythm: "default",
  characterSize: 48,
  helpfulProposals: false,
};
export function seeds(): Material[] {
  return [
    {
      id: "proposal",
      title: "Bookstore event proposal",
      text: "A little light for yourself this weekend\n\n01 / Event intent\nGive busy people time to stay in the bookstore. The event is scheduled to open on November 8, with a budget of CNY 8,000.\n\n02 / An unhurried experience\nTake a blank bookmark and write down one thing to let go of. Choose a book and sit by the window for a while.\n\n03 / Items to confirm\nThe poster is scheduled to be finalized on November 10, followed by registration opening. Venue, printing, and materials are quoted at CNY 6,500 in total.\n\nThis editable sample uses fictional information.",
    },
    {
      id: "venue",
      title: "Venue notes",
      text: "Nightingale Books · Venue notes\n\nOpening hours\nNovember 8, 14:00–20:00.\n\nSpace and capacity\nUp to 40 people are recommended, with window seats reserved for reading. No open flames indoors.\n\nPreparation\nConfirm roles and flow the day before the event. Check the poster, registration plan, and schedule again.\n\nThis is editable sample material.",
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
  return materials.map((m, i) => ({
    id: "window-" + m.id,
    materialId: m.id,
    x: 44 + i * 440,
    y: 48 + i * 44,
    width: 470,
    height: 470,
    z: i + 1,
    minimized: false,
  }));
}
