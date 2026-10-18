import { captureOutcome } from "../companion/outcome";
import { useEffect, useRef, useState } from "react";
import type { Material } from "../../domain/model";
import {
  createTextMaterial,
  fileSource,
  sourceDescription,
} from "../../domain/cauldron";
import { readFileText } from "../../services/import-text";
import {
  useDocuments,
  useInteraction,
  openMaterial,
  prepareMaterial,
  retrySave,
} from "../../state/stores";
import {
  createMaterial,
  changeMembership,
  refreshCauldron,
  useCauldron,
} from "../../services/cauldron-runtime";
import { useWatches } from "../../services/watch-runtime";
import { FloatingPanel } from "../../shared/FloatingPanel";
import { SourceInfo } from "../../shared/SourceInfo";
import {
  claimImport,
  releaseImport,
  currentDocumentId,
  requestDocumentCopy,
  useCauldronImport,
  validateImportFiles,
} from "../../services/cauldron-import";
import { prepareBatch } from "../batch/actions";
import "./cauldron.css";
type Mode = "new_text" | "pasted_text" | "file" | "copy";
export function Cauldron() {
  const materials = useDocuments((s) => s.materials);
  const status = useDocuments((s) => s.status);
  const errors = useDocuments((s) => s.errors);
  const edit = useDocuments((s) => s.edit);
  const { entries, ready, error: loadError, selected } = useCauldron();
  const watches = useWatches((s) => s.watches);
  const [all, setAll] = useState(false);
  const [batchSelecting, setBatchSelecting] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<{
    name: string;
    size: number;
    lastModified: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [readNotice, setReadNotice] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const readingTicket = useRef(0);
  const readingController = useRef<AbortController | undefined>(undefined);
  const candidate = useRef<Material | undefined>(undefined);
  const [draftId, setDraftId] = useState("");
  const [copy, setCopy] = useState<Material>();
  const [fileBatch, setFileBatch] = useState<File[]>([]);
  const [fileBatchTotal, setFileBatchTotal] = useState(0);
  const importOwner = useRef<string | undefined>(undefined);
  const request = useCauldronImport((s) => s.request);
  const selection = useInteraction((s) => s.selection);
  const currentId = currentDocumentId();
  useEffect(() => {
    if (!request) return;
    useCauldronImport.setState({ request: undefined });
    if ("file" in request || "files" in request) {
      begin("file");
      startFiles("files" in request ? request.files : [request.file]);
    } else {
      begin("copy");
      setCopy(request.copy);
      candidate.current = request.copy;
      setTitle(request.copy.title);
      setText(request.copy.text);
    }
  }, [request]);
  useEffect(() => {
    void refreshCauldron();
    return () => {
      ++readingTicket.current;
      readingController.current?.abort();
      releaseImport(importOwner.current);
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (mode && (text || title || reading || busy || fileBatch.length)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mode, text, title, reading, busy, fileBatch.length]);
  const material = materials.find((m) => m.id === selected);
  const member = (id: string) => entries.some((e) => e.materialId === id);
  const visible = materials.filter((m) => all || member(m.id));
  const picked = checked.filter(
    (id) => member(id) && materials.some((m) => m.id === id),
  );
  const pickedUnits = picked.reduce(
    (total, id) => total + materials.find((m) => m.id === id)!.text.length,
    0,
  );
  const close = () => {
    if (lock.current || reading) return;
    if (mode) {
      setError(
        "This material has not been added. Confirm the addition, or click “Cancel new material” to discard this input.",
      );
      return;
    }
    useInteraction.setState({ cauldron: false });
  };
  function begin(next: Mode) {
    importOwner.current = claimImport();
    setBatchSelecting(false);
    setMode(next);
    setTitle("");
    setText("");
    setNote("");
    setFile(undefined);
    setCopy(undefined);
    setFileBatch([]);
    setFileBatchTotal(0);
    setError("");
    setWarnings([]);
    setReadNotice("");
    candidate.current = undefined;
    setDraftId(crypto.randomUUID());
  }
  function changedInput() {
    candidate.current = undefined;
    setError("");
  }
  function startFiles(files: File[]) {
    if (!files.length) return;
    try {
      validateImportFiles(files);
      setFileBatch(files);
      setFileBatchTotal(files.length);
      void readFile(files[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start file import.");
    }
  }
  function clearDraft() {
    stopReading();
    setMode(undefined);
    setCopy(undefined);
    releaseImport(importOwner.current);
    setFileBatch([]);
    setFileBatchTotal(0);
    setText("");
    setTitle("");
    setNote("");
    setFile(undefined);
    setWarnings([]);
    setReadNotice("");
    setError("");
    candidate.current = undefined;
  }
  function nextFile() {
    stopReading();
    const remaining = fileBatch.slice(1);
    if (!remaining.length) {
      clearDraft();
      return;
    }
    setFileBatch(remaining);
    void readFile(remaining[0]);
  }
  async function readFile(chosen?: File) {
    if (!chosen) return;
    const finish = captureOutcome();
    const ticket = ++readingTicket.current;
    readingController.current?.abort();
    const controller = new AbortController();
    readingController.current = controller;
    setReading(true);
    setError("");
    setWarnings([]);
    setReadNotice("");
    setFile(undefined);
    setText("");
    setTitle("");
    setNote("");
    setDraftId(crypto.randomUUID());
    candidate.current = undefined;
    try {
      const contents = await readFileText(chosen, controller.signal);
      if (ticket !== readingTicket.current) return;
      const metadata = {
        name: chosen.name,
        size: chosen.size,
        lastModified: chosen.lastModified,
      };
      // Keep title within the same character boundary policy as creation.
      const preview = createTextMaterial({
        title: "",
        text: contents.text,
        source: fileSource(chosen.name),
        note: contents.warnings.join("\n"),
        file: metadata,
      });
      setText(contents.text);
      setFile(metadata);
      setWarnings(contents.warnings);
      setNote(contents.warnings.join("\n"));
      // Reading only prepares a preview; completion belongs to durable saving.
      setTitle(preview.title);
    } catch (e) {
      if (ticket === readingTicket.current) {
        finish("error");
        setError(
          e instanceof Error
            ? e.message
            : "Could not read file. Select it again.",
        );
      }
    } finally {
      if (ticket === readingTicket.current) {
        setReading(false);
        readingController.current = undefined;
      }
    }
  }
  function stopReading() {
    ++readingTicket.current;
    readingController.current?.abort();
    readingController.current = undefined;
    setReading(false);
  }
  async function add() {
    if (lock.current || reading || !mode) return;
    const finish = captureOutcome();
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode === "file" && !file)
        throw new Error(
          "Choose a file and wait for it to finish loading first.",
        );
      let m = candidate.current;
      if (!m) {
        if (mode === "copy")
          throw new Error(
            "The copy preview is no longer valid. Fetch it again.",
          );
        m = createTextMaterial({
          id: draftId,
          title,
          text,
          source: mode === "file" ? fileSource(file!.name) : mode,
          note,
          file,
        });
      }
      candidate.current = m;
      await createMaterial(m);
      finish("success");
      setAll(false);
      if (mode === "file" && fileBatch.length > 1) nextFile();
      else clearDraft();
      if (mode === "new_text") {
        openMaterial(m.id);
        useInteraction.setState({ cauldron: false });
      }
    } catch (e) {
      finish("error");
      setError(
        e instanceof Error
          ? e.message
          : "Could not save material. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function membership(id: string, adding: boolean) {
    if (lock.current) return;
    // The successful refresh may remove this member's action button first.
    const finish = captureOutcome(
      document.activeElement?.closest(".cauldron") ?? document.activeElement,
    );
    lock.current = true;
    const owner = claimImport();
    importOwner.current = owner;
    setBusy(true);
    setError("");
    try {
      await changeMembership(id, adding);
      finish("success");
    } catch (e) {
      finish("error");
      setError(
        e instanceof Error
          ? e.message
          : "Could not update the cauldron. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      releaseImport(owner);
    }
  }
  return (
    <FloatingPanel
      title="Inspiration Cauldron"
      close={close}
      busy={busy || reading}
      className="cauldron-panel"
      placement="left"
      closeLabel="Close Inspiration Cauldron"
    >
      <div className="cauldron" aria-busy={busy || reading}>
        <div className="cauldron-heading">
          <img src="/assets/prototype/pot_idle.png" alt="" />
          <div>
            <div className="eyebrow">A LITTLE ROOM FOR YOUR IDEAS</div>
            <h2>Inspiration Cauldron</h2>
          </div>
        </div>
        <div className="cauldron-dropzone" data-cauldron-target>
          <strong>A few things to work with</strong>
          <p>Drop files, paste text, or bring in a copy.</p>
          <div className="cauldron-toolbar cauldron-inputs">
            <button
              disabled={!!mode || busy || !ready}
              onClick={() => begin("new_text")}
            >
              New material
            </button>
            <button
              disabled={!!mode || busy || !ready}
              onClick={() => begin("pasted_text")}
            >
              Paste text
            </button>
            <button
              disabled={!!mode || busy || !ready}
              onClick={() => begin("file")}
            >
              Import file
            </button>
            <button
              disabled={!!mode || busy || !ready || !currentId}
              onClick={() => requestDocumentCopy(currentId)}
            >
              Full copy of current document
            </button>
            <button
              disabled={
                !!mode ||
                busy ||
                !ready ||
                !currentId ||
                selection?.materialId !== currentId
              }
              onClick={() => requestDocumentCopy(currentId, true)}
            >
              Copy of current selection
            </button>
          </div>
        </div>
        <p className="cauldron-count">
          {entries.length} / 12 in cauldron · TXT, DOCX, PPTX, XLSX, PDF
        </p>
        <details className="cauldron-help">
          <summary>How materials are added</summary>
          <p className="subtle">
            Drop up to 12 TXT, DOCX, PPTX, XLSX, or PDF files onto this page, or
            drag a document’s “Add to cauldron” handle to Inspiration Cauldron.
            Review and confirm each file before it is added. Files that do not
            fit the available cauldron slots are not silently discarded.
          </p>
        </details>
        {(error || loadError) && (
          <p className="error" role="alert">
            {error || loadError}
          </p>
        )}
        {!ready && <p role="status">Loading material list…</p>}
        {mode ? (
          <section className="cauldron-form" aria-label="New material">
            <h3>
              {mode === "new_text"
                ? "Create blank material"
                : mode === "pasted_text"
                  ? "Add pasted text"
                  : mode === "copy"
                    ? "Confirm frozen text copy"
                    : "Review extracted file text"}
            </h3>
            {mode === "file" && (
              <>
                {!!fileBatch.length && (
                  <div className="notice" role="status">
                    <strong>
                      File {fileBatchTotal - fileBatch.length + 1} of{" "}
                      {fileBatchTotal}: {fileBatch[0].name}
                    </strong>
                    <p>
                      {fileBatch.length - 1} files waiting. Each file is added
                      only after you review and confirm it.
                    </p>
                    {fileBatch.length > 1 && (
                      <details>
                        <summary>Files waiting for review</summary>
                        <ol>
                          {fileBatch.slice(1).map((item, index) => (
                            <li key={index}>{item.name}</li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>
                )}
                <label className="field-label">
                  Choose file
                  <input
                    type="file"
                    multiple
                    accept=".txt,.docx,.pptx,.xlsx,.pdf"
                    disabled={busy || reading || fileBatchTotal > 1}
                    onChange={(e) => {
                      startFiles(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="notice">
                  TXT (UTF-8), DOCX, PPTX, XLSX, PDF · Up to 12 files, 20 MB
                  each · Up to 60,000 UTF-16 units. Files are read locally as
                  editable text without calling Gemini. The original file is not
                  modified or monitored. PDF import extracts only the text
                  layer; OCR is not supported.
                </p>
                {reading && (
                  <div className="cauldron-toolbar">
                    <p role="status">Reading file…</p>
                    <button
                      onClick={() => {
                        captureOutcome()("cancel");
                        stopReading();
                        setReadNotice(
                          "Reading stopped. Retry this file or skip it; waiting files are kept.",
                        );
                      }}
                    >
                      Stop reading
                    </button>
                  </div>
                )}
                {readNotice && (
                  <p className="notice" role="status">
                    {readNotice}
                  </p>
                )}
                {!reading && !file && !!fileBatch.length && (
                  <button
                    disabled={busy}
                    onClick={() => void readFile(fileBatch[0])}
                  >
                    Retry reading this file
                  </button>
                )}
              </>
            )}
            <label className="field-label">
              New material title
              <input
                maxLength={120}
                value={title}
                disabled={busy || reading || mode === "copy"}
                placeholder="Untitled material"
                onChange={(e) => {
                  changedInput();
                  setTitle(e.target.value);
                }}
              />
            </label>
            {mode === "pasted_text" && (
              <>
                <label className="field-label">
                  Pasted text
                  <textarea
                    value={text}
                    disabled={busy}
                    onChange={(e) => {
                      changedInput();
                      setText(e.target.value);
                    }}
                  />
                </label>
                <label className="field-label">
                  Source note (optional)
                  <input
                    value={note}
                    maxLength={500}
                    disabled={busy}
                    onChange={(e) => {
                      changedInput();
                      setNote(e.target.value);
                    }}
                  />
                </label>
              </>
            )}
            {mode === "file" && file && (
              <section className="scope">
                <strong>{file.name}</strong>
                {warnings.map((warning, index) => (
                  <p className="notice" key={index}>
                    {warning}
                  </p>
                ))}
                <label className="field-label">
                  Imported text preview (editable)
                  <textarea
                    aria-label="Imported text preview"
                    data-testid="import-preview"
                    value={text}
                    disabled={busy || reading}
                    onChange={(e) => {
                      changedInput();
                      setText(e.target.value);
                    }}
                  />
                </label>
              </section>
            )}
            {mode === "copy" && copy && (
              <section className="scope">
                <SourceInfo value={copy} />
                <pre className="cauldron-preview" data-testid="copy-preview">
                  {copy.text}
                </pre>
                <p className="notice">
                  Title, text, source version, and range are frozen. Once saved,
                  source changes will not change this copy. If another tab
                  changed the source, cancel this addition, back up unsaved
                  text, reload the page, and fetch the copy again.
                </p>
              </section>
            )}
            {mode !== "new_text" && (
              <p>
                {text.length.toLocaleString("en-US")} / 60,000 UTF-16 units ·
                Not saved until added
              </p>
            )}
            {mode === "new_text" && (
              <p>
                After saving, a blank editor opens. Add text before using an
                ability.
              </p>
            )}
            <div className="panel-actions">
              <button
                disabled={busy}
                onClick={() => {
                  captureOutcome()("cancel");
                  if (mode === "file" && fileBatch.length > 1) nextFile();
                  else clearDraft();
                }}
              >
                {fileBatchTotal > 1 ? "Skip this file" : "Cancel new material"}
              </button>
              {fileBatch.length > 1 && (
                <button disabled={busy} onClick={clearDraft}>
                  Discard all {fileBatch.length} remaining files
                </button>
              )}
              <button
                className="primary"
                disabled={busy || reading || (mode === "file" && !file)}
                onClick={() => void add()}
              >
                {busy
                  ? "Saving material…"
                  : mode === "new_text"
                    ? "Confirm creation"
                    : "Confirm addition"}
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="cauldron-toolbar">
              <button aria-pressed={!all} onClick={() => setAll(false)}>
                Materials in cauldron
              </button>
              <button aria-pressed={all} onClick={() => setAll(true)}>
                All local materials
              </button>
              <button onClick={() => void refreshCauldron()}>
                Refresh material list
              </button>
              <button
                aria-pressed={batchSelecting}
                onClick={() => {
                  setBatchSelecting(!batchSelecting);
                  setChecked([]);
                  setError("");
                }}
              >
                {batchSelecting
                  ? "Exit multi-material selection"
                  : "Select multiple materials"}
              </button>
            </div>
            {batchSelecting && (
              <section className="scope" aria-label="Multi-material processing">
                <strong>Selected {picked.length} / 12 items</strong>
                <p role="status">
                  Total full text: {pickedUnits.toLocaleString("en-US")} UTF-16
                  units · Limit for this run: 60,000.{" "}
                  {pickedUnits > 60000
                    ? "Narrow each range in the next step; text over the limit will not be submitted."
                    : "In the next step, confirm the full text or a selection from each material."}
                </p>
                <div className="cauldron-actions">
                  {(["understand", "check", "create", "summon"] as const).map(
                    (entry) => (
                      <button
                        key={entry}
                        disabled={busy || !ready || picked.length < 2}
                        onClick={() => {
                          try {
                            prepareBatch(picked, entry);
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Material unavailable",
                            );
                          }
                        }}
                      >
                        {entry[0].toUpperCase() + entry.slice(1)} multiple
                        materials
                      </button>
                    ),
                  )}
                </div>
                <p className="subtle">
                  Select 2–12 materials from the cauldron. Combined processing
                  uses Gemini; selecting an ability opens the confirmation panel
                  before anything is sent. Exit multi-material selection to use
                  local rules with one material.
                </p>
              </section>
            )}
            <div className="cauldron-grid">
              <div className="cauldron-list" aria-label="Material list">
                {!visible.length && (
                  <p className="empty">
                    The cauldron is empty. Add some text to begin.
                  </p>
                )}
                {visible.map((m) => (
                  <div className="cauldron-item" key={m.id}>
                    {batchSelecting && (
                      <input
                        type="checkbox"
                        aria-label={"Process material " + m.title}
                        title={
                          member(m.id)
                            ? "Include in this run"
                            : "Add to the cauldron first"
                        }
                        disabled={!member(m.id) || busy}
                        checked={picked.includes(m.id)}
                        onChange={(e) =>
                          setChecked(
                            e.target.checked
                              ? [...picked, m.id]
                              : picked.filter((id) => id !== m.id),
                          )
                        }
                      />
                    )}
                    <button
                      aria-label={"Select material " + m.title}
                      aria-pressed={selected === m.id}
                      onClick={() => {
                        useCauldron.setState({ selected: m.id });
                        setError("");
                      }}
                    >
                      <strong>{m.title || "Untitled material"}</strong>
                      <small>
                        {member(m.id) ? "In cauldron" : "Saved locally"} ·{" "}
                        {status[m.id]}
                      </small>
                      <small>{sourceDescription(m)}</small>
                    </button>
                  </div>
                ))}
              </div>
              <section
                className="cauldron-detail"
                data-testid="material-detail"
              >
                {material ? (
                  <>
                    <label className="field-label">
                      Material title
                      <input
                        maxLength={120}
                        value={material.title}
                        onChange={(e) =>
                          edit(material.id, "title", e.target.value)
                        }
                      />
                    </label>
                    <p>
                      <span data-testid="material-save-status" role="status">
                        {status[material.id]}
                      </span>{" "}
                      · Version {material.version} ·{" "}
                      {material.text.length.toLocaleString("en-US")} UTF-16
                      units
                    </p>
                    <details className="cauldron-source">
                      <summary>Source details</summary>
                      <SourceInfo value={material} />
                    </details>
                    {errors[material.id] && (
                      <p role="alert" className="error">
                        {errors[material.id]}
                        <button onClick={() => retrySave(material.id)}>
                          Retry save
                        </button>
                      </p>
                    )}
                    {watches.some(
                      (w) =>
                        w.materialId === material.id && w.status === "active",
                    ) && (
                      <p className="notice">
                        This material is being watched. Removing it from the
                        cauldron will not stop watching.
                      </p>
                    )}
                    <pre className="cauldron-preview">
                      {material.text ||
                        "Empty material. Open the editor to add text."}
                    </pre>
                    <div className="cauldron-toolbar">
                      <button
                        disabled={busy}
                        onClick={() => {
                          openMaterial(material.id);
                          useInteraction.setState({ cauldron: false });
                        }}
                      >
                        Open editor
                      </button>
                      <button
                        disabled={busy || !ready}
                        onClick={() =>
                          void membership(material.id, !member(material.id))
                        }
                      >
                        {member(material.id)
                          ? "Remove from cauldron"
                          : "Add to cauldron"}
                      </button>
                    </div>
                    <details className="cauldron-help">
                      <summary>About removing materials</summary>
                      <p className="subtle">
                        Removing a material frees a cauldron slot. Its text,
                        results, tasks, and watches remain; add it again from
                        “All local materials”.
                      </p>
                    </details>
                    {!batchSelecting && (
                      <div className="cauldron-actions">
                        {(
                          ["understand", "check", "create", "summon"] as const
                        ).map((entry) => (
                          <button
                            key={entry}
                            disabled={
                              busy ||
                              !material.text.trim() ||
                              material.text.length > 60000
                            }
                            onClick={() => {
                              try {
                                prepareMaterial(material.id, entry);
                              } catch (e) {
                                setError(String(e));
                              }
                            }}
                          >
                            {entry[0].toUpperCase() + entry.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                    {!batchSelecting && (
                      <p className="subtle">
                        Only the selected material’s full text is processed. You
                        must still confirm the range next; the document
                        selection is not reused.
                        {material.text.length > 60000
                          ? " Full text exceeds the limit; open the editor and choose a smaller range."
                          : ""}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="empty">
                    Select a material to view its source and actions.
                  </p>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </FloatingPanel>
  );
}
