import type { Point } from "./magic-layout";

export type TextAnchor = {
  point: Point;
  rects: DOMRect[];
  source: Element;
};

const controls = 'button, select, a[href], [role="button"], [role="menuitem"]';
const editor = '[contenteditable]:not([contenteditable="false"])';
const typography = [
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-variant",
  "font-feature-settings",
  "font-variation-settings",
  "font-kerning",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-align",
  "text-indent",
  "direction",
  "tab-size",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
] as const;

function intersection(a: DOMRect, b: DOMRect) {
  const left = Math.max(a.left, b.left),
    top = Math.max(a.top, b.top);
  return new DOMRect(
    left,
    top,
    Math.max(0, Math.min(a.right, b.right) - left),
    Math.max(0, Math.min(a.bottom, b.bottom) - top),
  );
}

function visibleBounds(source: Element, input: boolean) {
  let bounds = new DOMRect(0, 0, innerWidth, innerHeight);
  for (
    let element: Element | null = source;
    element;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const clipX =
      (element === source && input) ||
      /auto|scroll|hidden|clip/.test(style.overflowX);
    const clipY =
      (element === source && input) ||
      /auto|scroll|hidden|clip/.test(style.overflowY);
    if (!clipX && !clipY) continue;
    const scaleX =
      element instanceof HTMLElement && element.offsetWidth
        ? box.width / element.offsetWidth
        : 1;
    const scaleY =
      element instanceof HTMLElement && element.offsetHeight
        ? box.height / element.offsetHeight
        : 1;
    const left = box.left + element.clientLeft * scaleX;
    const top = box.top + element.clientTop * scaleY;
    bounds = intersection(
      bounds,
      new DOMRect(
        clipX ? left : bounds.left,
        clipY ? top : bounds.top,
        clipX ? element.clientWidth * scaleX : bounds.width,
        clipY ? element.clientHeight * scaleY : bounds.height,
      ),
    );
  }
  return bounds;
}

function caretRects(range: Range, node: Node, offset: number): DOMRect[] {
  const collapsed = document.createRange();
  collapsed.setStart(node, offset);
  collapsed.collapse(true);
  const rects = Array.from(collapsed.getClientRects()).filter(
    (box) => box.height > 0,
  );
  if (rects.length) return rects;
  // Empty editable blocks and line endings may expose no collapsed range box.
  if (node.nodeType === Node.TEXT_NODE && node.textContent?.length) {
    const previous = offset > 0;
    collapsed.setStart(node, previous ? offset - 1 : 0);
    collapsed.setEnd(node, previous ? offset : 1);
    const boxes = Array.from(collapsed.getClientRects());
    const neighbor = previous ? boxes.at(-1) : boxes[0];
    if (neighbor?.height)
      return [
        new DOMRect(
          previous ? neighbor.right : neighbor.left,
          neighbor.top,
          0,
          neighbor.height,
        ),
      ];
  }
  if (node instanceof Element) {
    const next = node.childNodes[offset];
    let leaf = next ?? node.childNodes[offset - 1];
    while (leaf?.childNodes.length)
      leaf = (next ? leaf.firstChild : leaf.lastChild)!;
    if (leaf?.nodeType === Node.TEXT_NODE)
      return caretRects(range, leaf, next ? 0 : leaf.textContent!.length);
    if (leaf instanceof Element) {
      const box = leaf.getBoundingClientRect();
      if (box.height)
        return [
          new DOMRect(
            next || leaf.tagName === "BR" ? box.left : box.right,
            box.top,
            0,
            box.height,
          ),
        ];
    }
  }
  const box = range.getBoundingClientRect();
  return box.height ? [box] : [];
}

/** Keep native focus and selection untouched; only the offscreen mirror is owned here. */
export function createTextTracker() {
  let mirror: HTMLDivElement | undefined;
  let dirty = true,
    target = false;
  let cached: TextAnchor | undefined;
  let intent:
    | { source: Element; key?: string; pointer?: Point; before?: Point }
    | undefined;
  let previous:
    | {
        source: Element;
        active: Element | null;
        value: string;
        anchor: Node | null;
        focus: Node | null;
        key: string;
      }
    | undefined;

  function chooseCaret(rects: DOMRect[], source: Element) {
    if (rects.length < 2) return rects[0];
    const current =
      intent &&
      (intent.source.contains(source) || source.contains(intent.source))
        ? intent
        : undefined;
    if (current?.pointer) {
      const point = current.pointer;
      return rects.reduce((best, rect) =>
        Math.hypot(rect.left - point.x, rect.top + rect.height / 2 - point.y) <
        Math.hypot(best.left - point.x, best.top + best.height / 2 - point.y)
          ? rect
          : best,
      );
    }
    if (current?.key === "Home" || current?.key === "ArrowLeft")
      return rects.at(-1);
    if (
      (current?.key === "ArrowUp" || current?.key === "ArrowDown") &&
      current.before
    ) {
      const x = current.before.x;
      return rects.reduce((best, rect) =>
        Math.abs(rect.left - x) < Math.abs(best.left - x) ? rect : best,
      );
    }
    return rects[0];
  }

  function read(): TextAnchor | undefined {
    const active = document.activeElement;
    const input =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
        ? active
        : undefined;
    const selection = window.getSelection();
    const focus = selection?.focusNode;
    const focusElement =
      focus instanceof Element ? focus : focus?.parentElement;
    const editable = focusElement?.closest(editor);
    const textSurface =
      editable ??
      focusElement?.closest(
        ".document-reading, p, pre, li, td, th, h1, h2, h3, h4, h5, h6",
      ) ??
      focusElement;
    const source =
      input ??
      (selection?.rangeCount &&
      focusElement &&
      (!selection.isCollapsed || (editable && editable.contains(active)))
        ? textSurface
        : undefined);
    const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
    target =
      !!source &&
      source.isConnected &&
      !active?.closest(controls) &&
      (!!input ||
        active === document.body ||
        active === document.documentElement ||
        !!active?.contains(source) ||
        source.contains(active)) &&
      (!modal || modal.contains(source));
    if (!target || !source) return undefined;
    // Passwords and controls without the Selection API have no supported text anchor.
    if (
      input &&
      (input.type === "password" ||
        input.selectionStart === null ||
        input.selectionEnd === null)
    ) {
      target = false;
      return undefined;
    }
    const box = source.getBoundingClientRect();
    const bounds = visibleBounds(source, !!input);
    const start = input?.selectionStart ?? selection?.anchorOffset ?? 0;
    const end = input?.selectionEnd ?? selection?.focusOffset ?? 0;
    const value = input?.value ?? source.textContent ?? "";
    const key = [
      start,
      end,
      input?.selectionDirection,
      box.x,
      box.y,
      box.width,
      box.height,
      source.clientWidth,
      source.clientHeight,
      source.scrollLeft,
      source.scrollTop,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      innerWidth,
      innerHeight,
    ].join(",");
    if (
      !dirty &&
      previous?.source === source &&
      previous.active === active &&
      previous.value === value &&
      previous.anchor === selection?.anchorNode &&
      previous.focus === focus &&
      previous.key === key
    )
      return cached;
    dirty = false;
    previous = {
      source,
      active,
      value,
      anchor: selection?.anchorNode ?? null,
      focus: focus ?? null,
      key,
    };
    cached = undefined;
    if (
      box.width <= 0 ||
      box.height <= 0 ||
      bounds.width <= 0 ||
      bounds.height <= 0
    )
      return undefined;

    let caret: DOMRect | undefined;
    let rects: DOMRect[] = [];
    if (input) {
      mirror ??= document.createElement("div");
      const style = getComputedStyle(input);
      mirror.style.cssText =
        "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;margin:0;box-sizing:border-box;overflow:hidden;border-style:solid;";
      for (const property of typography)
        mirror.style.setProperty(property, style.getPropertyValue(property));
      mirror.style.whiteSpace =
        input instanceof HTMLTextAreaElement && input.wrap !== "off"
          ? "pre-wrap"
          : "pre";
      mirror.style.overflowWrap =
        input instanceof HTMLTextAreaElement ? "break-word" : "normal";
      mirror.style.width = `${input.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
      if (input instanceof HTMLInputElement) {
        mirror.style.lineHeight = `${Math.max(1, input.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))}px`;
      }
      mirror.textContent = `${input.value}\u200b`;
      if (!mirror.isConnected) document.body.append(mirror);
      const text = mirror.firstChild!;
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, end);
      const offset = input.selectionDirection === "backward" ? start : end;
      const origin = mirror.getBoundingClientRect();
      const scaleX = input.offsetWidth ? box.width / input.offsetWidth : 1;
      const scaleY = input.offsetHeight ? box.height / input.offsetHeight : 1;
      const translate = (rect: DOMRect) =>
        new DOMRect(
          box.left + (rect.left - origin.left - input.scrollLeft) * scaleX,
          box.top + (rect.top - origin.top - input.scrollTop) * scaleY,
          rect.width * scaleX,
          rect.height * scaleY,
        );
      caret = chooseCaret(
        caretRects(range, text, offset).map(translate),
        source,
      );
      // Protect all visible text, including the word immediately before a caret.
      const fullText = document.createRange();
      fullText.selectNodeContents(mirror);
      rects = Array.from(fullText.getClientRects(), translate);
    } else if (selection?.rangeCount && focus) {
      const range = selection.getRangeAt(0);
      caret = chooseCaret(
        caretRects(range, focus, selection.focusOffset),
        source,
      );
      rects = Array.from(range.getClientRects());
      const textNodes = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = textNodes.nextNode())) {
        const text = document.createRange();
        text.selectNodeContents(node);
        rects.push(...Array.from(text.getClientRects()));
      }
      if (!caret && editable) {
        const style = getComputedStyle(editable);
        const font = parseFloat(style.fontSize) || 16;
        caret = new DOMRect(
          box.left + parseFloat(style.paddingLeft),
          box.top + parseFloat(style.paddingTop),
          0,
          parseFloat(style.lineHeight) || font * 1.2,
        );
      }
    }
    if (!caret) return undefined;
    const point = { x: caret.left, y: caret.top + caret.height / 2 };
    if (
      point.x < bounds.left - 1 ||
      point.x > bounds.right + 1 ||
      point.y < bounds.top ||
      point.y > bounds.bottom
    )
      return undefined;
    rects = rects
      .map((rect) => intersection(rect, bounds))
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length)
      rects = [
        intersection(
          new DOMRect(caret.left, caret.top, 1, caret.height),
          bounds,
        ),
      ];
    cached = { point, rects, source };
    return cached;
  }

  return {
    read,
    hasTarget: () => target,
    invalidate: (event?: Event) => {
      const element =
        event?.target instanceof Element ? event.target : undefined;
      if (event instanceof KeyboardEvent && element) {
        const before = read()?.point;
        intent = { source: element, key: event.key, before };
      } else if (event instanceof PointerEvent && element) {
        const source =
          element.closest("input, textarea, [contenteditable]") ??
          (previous?.source.contains(element) ? previous.source : undefined);
        if (source)
          intent = { source, pointer: { x: event.clientX, y: event.clientY } };
      }
      dirty = true;
    },
    dispose: () => {
      mirror?.remove();
      mirror = undefined;
      cached = undefined;
      previous = undefined;
      target = false;
      intent = undefined;
    },
  };
}

/** The same calibrated casting cell points beside the active text endpoint. */
export function getTextLayout(
  anchor: TextAnchor,
  characterWidth: number,
  viewport: { width: number; height: number },
) {
  const scale = characterWidth / 270;
  const height = 260 * scale;
  const line = anchor.rects.filter(
    (rect) => anchor.point.y >= rect.top && anchor.point.y <= rect.bottom,
  );
  const lineTop = line.length
    ? Math.min(...line.map((rect) => rect.top))
    : anchor.point.y;
  const lineBottom = line.length
    ? Math.max(...line.map((rect) => rect.bottom))
    : anchor.point.y;
  const lineLeft = line.length
    ? Math.min(...line.map((rect) => rect.left))
    : anchor.point.x;
  const lineRight = line.length
    ? Math.max(...line.map((rect) => rect.right))
    : anchor.point.x;
  const below = lineBottom - anchor.point.y + 45 * scale + 5;
  const above = lineTop - anchor.point.y - (height - 45 * scale) - 5;
  const textBottom = Math.max(
    lineBottom,
    ...anchor.rects.map((rect) => rect.bottom),
  );
  const textTop = Math.min(lineTop, ...anchor.rects.map((rect) => rect.top));
  const outsideBelow = textBottom - anchor.point.y + 45 * scale + 5;
  const outsideAbove = textTop - anchor.point.y - (height - 45 * scale) - 5;
  for (const dy of [0, -12, 12, below, above, outsideBelow, outsideAbove]) {
    if (Math.abs(dy) > height + lineBottom - lineTop) continue;
    for (const besideLine of [false, true]) {
      for (const facing of [1, -1] as const) {
        const tip = {
          x:
            (besideLine
              ? facing === 1
                ? lineLeft
                : lineRight
              : anchor.point.x) -
            facing * 12,
          y: anchor.point.y + dy,
        };
        if (
          Math.hypot(tip.x - anchor.point.x, dy) >
          height + lineBottom - lineTop
        )
          continue;
        const x = tip.x - (facing === 1 ? 254.5 : 15.5) * scale;
        const y = tip.y - 45 * scale;
        if (
          x < 8 ||
          y < 8 ||
          x + characterWidth > viewport.width - 8 ||
          y + height > viewport.height - 8
        )
          continue;
        if (
          anchor.rects.some(
            (rect) =>
              x < rect.right + 4 &&
              x + characterWidth > rect.left - 4 &&
              y < rect.bottom + 4 &&
              y + height > rect.top - 4,
          )
        )
          continue;
        return { x, y, facing, tip };
      }
    }
  }
  return undefined;
}
