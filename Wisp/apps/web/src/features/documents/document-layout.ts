export type DocumentSection = {
  text: string;
  start: number;
  headingLength: number;
  separator: boolean;
};

// Retain every UTF-16 character so the reading view shares the saved text offsets.
export function documentSections(text: string): DocumentSection[] {
  let start = 0;
  return text.split(/((?:\r?\n){2,})/).map((part) => {
    const firstLine = part.search(/\r?\n/);
    const headingLength =
      firstLine > 0 &&
      firstLine <= 90 &&
      !/[.!?。！？]$/.test(part.slice(0, firstLine))
        ? firstLine
        : 0;
    const section = {
      text: part,
      start,
      headingLength,
      separator: /^(?:\r?\n){2,}$/.test(part),
    };
    start += part.length;
    return section;
  });
}

export function readingSelection(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return undefined;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
}
