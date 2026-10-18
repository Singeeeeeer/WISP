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
import { Dialog } from "../../shared/Dialog";
import { SourceInfo } from "../../shared/SourceInfo";
import { prepareBatch } from "../batch/actions";
import "./cauldron.css";
type Mode = "new_text" | "pasted_text" | "file";
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
  useEffect(() => {
    void refreshCauldron();
    return () => {
      ++readingTicket.current;
      readingController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (mode && (text || title || reading || busy)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mode, text, title, reading, busy]);
  const material = materials.find((m) => m.id === selected);
  const member = (id: string) => entries.some((e) => e.materialId === id);
  const visible = materials.filter((m) => all || member(m.id));
  const picked = checked.filter((id) => member(id) && materials.some((m) => m.id === id));
  const pickedUnits = picked.reduce((total, id) => total + materials.find((m) => m.id === id)!.text.length, 0);
  const close = () => {
    if (lock.current || reading) return;
    if (mode) {
      setError(
        "这份材料尚未加入，请先确认加入，或点击“取消新增”放弃本次输入。",
      );
      return;
    }
    useInteraction.setState({ cauldron: false });
  };
  function begin(next: Mode) {
    setBatchSelecting(false);
    setMode(next);
    setTitle("");
    setText("");
    setNote("");
    setFile(undefined);
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
      finish("success");
      setTitle(preview.title);
    } catch (e) {
      if (ticket === readingTicket.current) {
        finish("error");
        setError(
          e instanceof Error ? e.message : "文件读取失败，请重新选择文件",
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
      if (mode === "file" && !file) throw new Error("请先选择并成功读取文件");
      const m =
        candidate.current ??
        createTextMaterial({
          id: draftId,
          title,
          text,
          source: mode === "file" ? fileSource(file!.name) : mode,
          note,
          file,
        });
      candidate.current = m;
      await createMaterial(m);
      finish("success");
      setAll(false);
      setMode(undefined);
      setText("");
      setTitle("");
      if (mode === "new_text") {
        openMaterial(m.id);
        useInteraction.setState({ cauldron: false });
      }
    } catch (e) {
      finish("error");
      setError(e instanceof Error ? e.message : "材料保存失败，请重试");
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
    setBusy(true);
    setError("");
    try {
      await changeMembership(id, adding);
      finish("success");
    } catch (e) {
      finish("error");
      setError(e instanceof Error ? e.message : "成员保存失败，请重试");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title="灵感熔炉" close={close}>
      <div className="cauldron" aria-busy={busy || reading}>
        <div className="panel-heading">
          <div>
            <div className="eyebrow">IDEA CAULDRON · LOCAL TEXT</div>
            <h2>灵感熔炉</h2>
          </div>
          <button
            aria-label="关闭熔炉"
            onClick={close}
            disabled={busy || reading}
          >
            ×
          </button>
        </div>
        <p>收好手边的文字，选择一份或勾选多份，确认范围后再交给 Wisp。</p>
        <div className="cauldron-toolbar">
          <button
            disabled={!!mode || busy || !ready}
            onClick={() => begin("new_text")}
          >
            新建材料
          </button>
          <button
            disabled={!!mode || busy || !ready}
            onClick={() => begin("pasted_text")}
          >
            粘贴文本
          </button>
          <button
            disabled={!!mode || busy || !ready}
            onClick={() => begin("file")}
          >
            导入文件
          </button>
          <span>{entries.length} / 12 份在熔炉中</span>
        </div>
        {(error || loadError) && (
          <p className="error" role="alert">
            {error || loadError}
          </p>
        )}
        {!ready && <p role="status">正在读取材料列表…</p>}
        {mode ? (
          <section className="cauldron-form" aria-label="新增材料">
            <h3>
              {mode === "new_text"
                ? "新建空白材料"
                : mode === "pasted_text"
                  ? "加入粘贴文本"
                  : "读取文件文字副本"}
            </h3>
            {mode === "file" && (
              <>
                <label className="field-label">
                  选择文件
                  <input
                    type="file"
                    accept=".txt,.docx,.pptx,.xlsx,.pdf"
                    disabled={busy || reading}
                    onChange={(e) => {
                      void readFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="notice">
                  TXT（UTF-8）、DOCX、PPTX、XLSX、PDF · 单文件最多 20 MB · 最多
                  60,000 个 UTF-16 单元。在本机读取为可编辑的文字副本， 不调用
                  Gemini，不修改或监控原文件。PDF 仅提取文字层，不含 OCR。
                </p>
                {reading && (
                  <div className="cauldron-toolbar">
                    <p role="status">正在读取文件…</p>
                    <button
                      onClick={() => {
                        captureOutcome()("cancel");
                        stopReading();
                        setReadNotice("已停止读取，可重新选择文件。");
                      }}
                    >
                      停止读取
                    </button>
                  </div>
                )}
                {readNotice && (
                  <p className="notice" role="status">
                    {readNotice}
                  </p>
                )}
              </>
            )}
            <label className="field-label">
              新材料标题
              <input
                maxLength={120}
                value={title}
                disabled={busy || reading}
                placeholder="未命名材料"
                onChange={(e) => {
                  changedInput();
                  setTitle(e.target.value);
                }}
              />
            </label>
            {mode === "pasted_text" && (
              <>
                <label className="field-label">
                  粘贴正文
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
                  来源备注（可选，用户填写）
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
                  导入文字预览（可编辑）
                  <textarea
                    aria-label="导入文字预览"
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
            {mode !== "new_text" && (
              <p>
                {text.length.toLocaleString()} / 60,000 UTF-16 单元 ·
                加入前不会保存
              </p>
            )}
            {mode === "new_text" && (
              <p>保存后打开空白编辑窗口；正文为空时不能运行能力。</p>
            )}
            <div className="panel-actions">
              <button
                disabled={busy}
                onClick={() => {
                  captureOutcome()("cancel");
                  stopReading();
                  setMode(undefined);
                  setText("");
                  setTitle("");
                  setNote("");
                  setFile(undefined);
                  setWarnings([]);
                  setReadNotice("");
                  setError("");
                  candidate.current = undefined;
                }}
              >
                取消新增
              </button>
              <button
                className="primary"
                disabled={busy || reading || (mode === "file" && !file)}
                onClick={() => void add()}
              >
                {busy
                  ? "正在保存材料…"
                  : mode === "new_text"
                    ? "确认新建"
                    : "确认加入"}
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="cauldron-toolbar">
              <button aria-pressed={!all} onClick={() => setAll(false)}>
                熔炉中的材料
              </button>
              <button aria-pressed={all} onClick={() => setAll(true)}>
                全部本地材料
              </button>
              <button onClick={() => void refreshCauldron()}>
                刷新材料列表
              </button>
              <button
                aria-pressed={batchSelecting}
                onClick={() => {
                  setBatchSelecting(!batchSelecting);
                  setChecked([]);
                  setError("");
                }}
              >
                {batchSelecting ? "退出多材料选择" : "勾选多材料"}
              </button>
            </div>
            {batchSelecting && (
              <section className="scope" aria-label="多材料处理">
                <strong>已选 {picked.length} / 12 份</strong>
                <p role="status">
                  全文合计 {pickedUnits.toLocaleString()} UTF-16 单元 · 本次处理上限 60,000。
                  {pickedUnits > 60000 ? "请在下一步逐份缩小范围，超限不会提交。" : "下一步可逐份确认全文或选段。"}
                </p>
                <div className="cauldron-actions">
                  {(["understand", "check", "create", "summon"] as const).map((entry) => (
                    <button
                      key={entry}
                      disabled={busy || !ready || picked.length < 2}
                      onClick={() => {
                        try { prepareBatch(picked, entry); }
                        catch (e) { setError(e instanceof Error ? e.message : "材料不可用"); }
                      }}
                    >
                      {entry[0].toUpperCase() + entry.slice(1)} 多材料
                    </button>
                  ))}
                </div>
                <p className="subtle">勾选 2～12 份熔炉材料。综合处理使用 Gemini；点击入口仅确认，不立即发送。单份本地规则请退出多材料选择。</p>
              </section>
            )}
            <div className="cauldron-grid">
              <div className="cauldron-list" aria-label="材料列表">
                {!visible.length && (
                  <p className="empty">熔炉还是空的。加入一份文字开始吧。</p>
                )}
                {visible.map((m) => (
                  <div className="cauldron-item" key={m.id}>
                  {batchSelecting && (
                    <input
                      type="checkbox"
                      aria-label={"处理材料 " + m.title}
                      title={member(m.id) ? "加入本次处理" : "请先加入熔炉"}
                      disabled={!member(m.id) || busy}
                      checked={picked.includes(m.id)}
                      onChange={(e) => setChecked(e.target.checked ? [...picked, m.id] : picked.filter((id) => id !== m.id))}
                    />
                  )}
                  <button
                    aria-label={"选择材料 " + m.title}
                    aria-pressed={selected === m.id}
                    onClick={() => {
                      useCauldron.setState({ selected: m.id });
                      setError("");
                    }}
                  >
                    <strong>{m.title || "未命名材料"}</strong>
                    <small>
                      {member(m.id) ? "熔炉中" : "本地保存"} · {status[m.id]}
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
                      材料标题
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
                      · 版本 {material.version} ·{" "}
                      {material.text.length.toLocaleString()} UTF-16 单元
                    </p>
                    <SourceInfo value={material} />
                    {errors[material.id] && (
                      <p role="alert" className="error">
                        {errors[material.id]}
                        <button onClick={() => retrySave(material.id)}>
                          重试保存
                        </button>
                      </p>
                    )}
                    {watches.some(
                      (w) =>
                        w.materialId === material.id && w.status === "active",
                    ) && (
                      <p className="notice">
                        这份材料正在持续关注中。移出熔炉不会停止关注。
                      </p>
                    )}
                    <pre className="cauldron-preview">
                      {material.text || "空白材料，请打开编辑补充正文。"}
                    </pre>
                    <div className="cauldron-toolbar">
                      <button
                        onClick={() => {
                          openMaterial(material.id);
                          useInteraction.setState({ cauldron: false });
                        }}
                      >
                        打开编辑
                      </button>
                      <button
                        disabled={busy || !ready}
                        onClick={() =>
                          void membership(material.id, !member(material.id))
                        }
                      >
                        {member(material.id) ? "移出熔炉" : "加入熔炉"}
                      </button>
                    </div>
                    <p className="notice">
                      移出只腾出容器名额。材料、结果、任务与持续关注均保留，可从“全部本地材料”重新加入。
                    </p>
                    {!batchSelecting && <div className="cauldron-actions">
                      {(
                        ["understand", "check", "create", "summon"] as const
                      ).map((entry) => (
                        <button
                          key={entry}
                          disabled={
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
                    </div>}
                    {!batchSelecting && <p className="subtle">
                      仅处理当前选中材料的全文。下一步仍需确认范围，不沿用文档选区。
                      {material.text.length > 60000
                        ? "全文超出处理上限，可打开编辑选择较小范围。"
                        : ""}
                    </p>}
                  </>
                ) : (
                  <p className="empty">选择一份材料，查看来源与处理入口。</p>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
