import { afterAll, beforeEach, expect, it, vi } from "vitest";
import {
  initialWindows,
  seeds,
  selectText,
  snapshot,
  type Material,
} from "../src/domain/model";

vi.hoisted(() => vi.stubGlobal("BroadcastChannel", undefined));

import {
  useDocuments,
  useInteraction,
  useWorkspace,
} from "../src/state/stores";
import { useCauldron } from "../src/services/cauldron-runtime";
import {
  claimImport,
  copyFromDocument,
  currentDocumentId,
  DOCUMENT_DRAG_TYPE,
  draggedDocument,
  endDocumentDrag,
  importBlockReason,
  queueImport,
  releaseImport,
  requestDocumentCopy,
  startDocumentDrag,
  useCauldronImport,
} from "../src/services/cauldron-import";

let material: Material;
let querySelector: ReturnType<typeof vi.fn>;

beforeEach(() => {
  material = {
    ...seeds()[0],
    title: "已保存原文",
    text: "前文😀选区\n结尾",
    version: 3,
  };
  querySelector = vi.fn().mockReturnValue(null);
  vi.stubGlobal("document", { querySelector });
  useDocuments.setState(
    {
      ...useDocuments.getInitialState(),
      materials: [material],
      ready: true,
      status: { [material.id]: "saved" },
      errors: {},
    },
    true,
  );
  useInteraction.setState(useInteraction.getInitialState(), true);
  useCauldron.setState({ ...useCauldron.getInitialState(), ready: true }, true);
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      windows: initialWindows([material]),
      active: "window-" + material.id,
    },
    true,
  );
  useCauldronImport.setState(useCauldronImport.getInitialState(), true);
  endDocumentDrag();
});

afterAll(() => {
  endDocumentDrag();
  vi.unstubAllGlobals();
});

function transfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: "none",
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
    getData: (type: string) => values.get(type) ?? "",
  } as DataTransfer;
}

it("releases only the current owner, so stale completion cannot clear a newer preview", () => {
  const first = claimImport({ file: new File(["first"], "first.txt") });
  const nextRequest = { file: new File(["second"], "second.txt") };
  const second = claimImport(nextRequest);
  expect(second).not.toBe(first);
  for (const owner of [undefined, "foreign-owner", first]) {
    releaseImport(owner);
    expect(useCauldronImport.getState()).toMatchObject({
      owner: second,
      occupied: true,
      request: nextRequest,
    });
  }
  releaseImport(second);
  expect(useCauldronImport.getState()).toMatchObject({
    owner: undefined,
    occupied: false,
    request: undefined,
  });
  releaseImport(second);
  expect(importBlockReason()).toBe("");
});

it("claims a queued drop synchronously and preserves the first request on a second drop", () => {
  const first = { file: new File(["first"], "first.txt") };
  queueImport(first);
  const owner = useCauldronImport.getState().owner;
  expect(owner).toBeTruthy();
  expect(useCauldronImport.getState()).toMatchObject({
    occupied: true,
    request: first,
  });
  expect(useInteraction.getState()).toMatchObject({
    cauldron: true,
    menu: false,
  });
  expect(() =>
    queueImport({ file: new File(["second"], "second.txt") }),
  ).toThrow("A material preview is still open");
  expect(useCauldronImport.getState().owner).toBe(owner);
  expect(useCauldronImport.getState().request).toBe(first);
});

it.each(["draft", "jointDraft", "watchDraft", "canvas", "book"] as const)(
  "rejects drops while %s is active",
  (field) => {
    const value =
      field === "draft"
        ? {
            entry: "understand" as const,
            snapshot: snapshot(material),
            instruction: "",
            familiar: "page_sprite" as const,
          }
        : field === "watchDraft"
          ? snapshot(material)
          : field === "jointDraft"
            ? {}
            : true;
    useInteraction.setState({ [field]: value });
    expect(() =>
      queueImport({ file: new File(["text"], "input.txt") }),
    ).toThrow("current panel");
    expect(useCauldronImport.getState().occupied).toBe(false);
    expect(useCauldronImport.getState().request).toBeUndefined();
    expect(useInteraction.getState().cauldron).toBe(false);
  },
);

it("blocks other dialogs but permits the cauldron's own dialog", () => {
  querySelector.mockReturnValue({ role: "dialog" });
  expect(importBlockReason()).toContain("current panel");
  expect(querySelector).toHaveBeenCalledWith(
    '[role="dialog"]:not(:has(.cauldron))',
  );
  querySelector.mockReturnValue(null);
  useInteraction.setState({ cauldron: true });
  expect(importBlockReason()).toBe("");
});

it("preserves a batch confirmation when file or document-copy imports are attempted", () => {
  const batchDraft = {
    id: "batch-confirmation",
    entry: "understand" as const,
    snapshots: [
      snapshot(material),
      snapshot({ ...material, id: "second-material" }),
    ],
    instruction: "共同理解",
    familiar: "page_sprite" as const,
  };
  useInteraction.setState({ batchDraft });
  expect(() =>
    queueImport({ file: new File(["text"], "input.txt") }),
  ).toThrow("current panel");
  requestDocumentCopy(material.id);
  expect(useCauldronImport.getState().error).toContain("current panel");
  const drag = transfer();
  expect(() => startDocumentDrag(material.id, drag)).toThrow("current panel");
  expect(drag.getData(DOCUMENT_DRAG_TYPE)).toBe("");
  expect(useCauldronImport.getState().occupied).toBe(false);
  expect(useCauldronImport.getState().request).toBeUndefined();
  expect(useInteraction.getState().cauldron).toBe(false);
  expect(useInteraction.getState().batchDraft).toBe(batchDraft);
});

it.each(["documents", "cauldron"])(
  "rejects drops before %s has loaded",
  (store) => {
    if (store === "documents") useDocuments.setState({ ready: false });
    else useCauldron.setState({ ready: false });
    expect(() =>
      queueImport({ file: new File(["text"], "input.txt") }),
    ).toThrow("not ready yet");
    expect(useCauldronImport.getState().occupied).toBe(false);
  },
);

it("rejects a full cauldron without creating a draft and permits its twelfth slot", () => {
  const entries = Array.from({ length: 12 }, (_, i) => ({
    materialId: "item-" + i,
    addedAt: new Date().toISOString(),
  }));
  useCauldron.setState({ entries });
  expect(() => queueImport({ file: new File(["text"], "input.txt") })).toThrow(
    "12 materials",
  );
  expect(useCauldronImport.getState().occupied).toBe(false);
  useCauldron.setState({ entries: entries.slice(0, 11) });
  queueImport({ file: new File(["text"], "input.txt") });
  expect(useCauldronImport.getState().occupied).toBe(true);
});

it("rejects unsupported and oversized files before occupying a slot", () => {
  const oversized = new File(["text"], "input.pdf");
  Object.defineProperty(oversized, "size", { value: 20_000_001 });
  for (const file of [new File(["text"], "input.zip"), oversized]) {
    expect(() => queueImport({ file })).toThrow();
    expect(useCauldronImport.getState().occupied).toBe(false);
  }
});

it.each(["pending", "saving", "failed"] as const)(
  "rejects a document with save state %s",
  (status) => {
    useDocuments.setState({ status: { [material.id]: status } });
    expect(() => copyFromDocument(material.id)).toThrow("Save the original document");
    expect(useCauldronImport.getState().occupied).toBe(false);
  },
);

it("rejects missing documents, absent save confirmation and unresolved save errors", () => {
  expect(() => copyFromDocument("missing")).toThrow("current document is unavailable");
  useDocuments.setState({ status: {} });
  expect(() => copyFromDocument(material.id)).toThrow("Save the original document");
  useDocuments.setState({
    status: { [material.id]: "saved" },
    errors: { [material.id]: "另一标签页有更新" },
  });
  expect(() => copyFromDocument(material.id)).toThrow("save conflicts");
});

it("selection-only copy never falls back to full text for missing, stale or invalid selection", () => {
  const selected = selectText(material, 2, 6);
  const invalid = [
    undefined,
    { ...selected, materialId: "other" },
    { ...selected, materialVersion: 2 },
    { ...selected, selectedText: "被替换" },
    { ...selected, start: 3, selectedText: material.text.slice(3, 6) },
    { ...selected, start: 2, end: 2, selectedText: "" },
  ];
  for (const selection of invalid) {
    useInteraction.setState({ selection });
    expect(() => copyFromDocument(material.id, true)).toThrow();
    requestDocumentCopy(material.id, true);
    expect(useCauldronImport.getState().request).toBeUndefined();
    expect(useCauldronImport.getState().occupied).toBe(false);
    expect(useCauldronImport.getState().error).not.toBe("");
  }
});

it("separates explicit full-text and valid selection copies", () => {
  useInteraction.setState({ selection: selectText(material, 2, 6) });
  const full = copyFromDocument(material.id);
  const selected = copyFromDocument(material.id, true);
  expect(full).toMatchObject({ source: "document_copy", text: material.text });
  expect(selected).toMatchObject({ source: "selection_copy", text: "😀选区" });
  expect(selected.origin!.copy).toMatchObject({
    start: 2,
    end: 6,
    materialVersion: 3,
  });
  expect(full.id).not.toBe(selected.id);
});

it("reports unavailable current documents without opening a preview", () => {
  expect(currentDocumentId()).toBe(material.id);
  useWorkspace.setState({
    windows: [{ ...useWorkspace.getState().windows[0], minimized: true }],
  });
  expect(currentDocumentId()).toBeUndefined();
  requestDocumentCopy(currentDocumentId());
  expect(useCauldronImport.getState().occupied).toBe(false);
  expect(useCauldronImport.getState().request).toBeUndefined();
  expect(useCauldronImport.getState().error).toContain("Open and select");
});

it("accepts only the active private drag token and invalidates it on drag end or replacement", () => {
  const external = transfer();
  external.setData(DOCUMENT_DRAG_TYPE, material.id);
  expect(() => draggedDocument(external)).toThrow("no longer available");
  const first = transfer();
  startDocumentDrag(material.id, first);
  expect(first.effectAllowed).toBe("copy");
  expect(first.getData(DOCUMENT_DRAG_TYPE)).not.toBe(material.id);
  external.setData(DOCUMENT_DRAG_TYPE, crypto.randomUUID());
  expect(() => draggedDocument(external)).toThrow("no longer available");
  const captured = draggedDocument(first);
  expect(captured).toMatchObject({
    text: material.text,
    source: "document_copy",
  });
  const second = transfer();
  startDocumentDrag(material.id, second);
  expect(() => draggedDocument(first)).toThrow("no longer available");
  expect(draggedDocument(second).id).not.toBe(captured.id);
  endDocumentDrag();
  expect(() => draggedDocument(second)).toThrow("no longer available");
});

it("captures drag contents before subsequent document edits and refuses blocked drag starts", () => {
  const drag = transfer();
  startDocumentDrag(material.id, drag);
  useDocuments.setState({
    materials: [{ ...material, title: "新标题", text: "新正文", version: 4 }],
  });
  expect(draggedDocument(drag)).toMatchObject({
    text: material.text,
    origin: { copy: { title: material.title, materialVersion: 3 } },
  });
  endDocumentDrag();
  claimImport();
  const blocked = transfer();
  expect(() => startDocumentDrag(material.id, blocked)).toThrow("A material preview is still open");
  expect(blocked.getData(DOCUMENT_DRAG_TYPE)).toBe("");
  expect(() => draggedDocument(blocked)).toThrow("no longer available");
});
