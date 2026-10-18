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
      title: "书店活动提案",
      text: "周末，留一点光给自己\n\n01 / 活动意图\n给忙碌的人一点留在书店的时间。活动计划于 11 月 8 日开放，预算为 8,000 元。\n\n02 / 不赶时间的体验\n拿一张空白书签，写下一件想放下的事。选一本书，在窗边坐一会儿。\n\n03 / 待确认事项\n海报计划于 11 月 10 日定稿，随后开放报名。场地、印刷与物料报价合计 6,500 元。\n\n这是可编辑的示例材料，不是真实研究数据。",
    },
    {
      id: "venue",
      title: "场地说明",
      text: "夜莺书店 · 场地说明\n\n开放时间\n11 月 8 日，14:00–20:00。\n\n空间与容量\n建议最多 40 人，保留窗边阅读座位。室内禁止明火。\n\n准备事项\n活动前一天确认人员分工与动线。请将海报、报名安排与执行时间再次核对。\n\n这是可编辑的示例材料。",
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
    throw new Error("无效选区：请选择完整字符");
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
    throw new Error("选区已失效，请重新选择");
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
