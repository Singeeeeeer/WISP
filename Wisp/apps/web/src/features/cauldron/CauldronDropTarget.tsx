import { useEffect, useState } from "react";
import { fileSource } from "../../domain/cauldron";
import {
  DOCUMENT_DRAG_TYPE,
  draggedDocument,
  endDocumentDrag,
  importBlockReason,
  queueImport,
  reportImportError,
  useCauldronImport,
} from "../../services/cauldron-import";
import "./cauldron.css";

export function CauldronDropTarget() {
  const [feedback, setFeedback] = useState<{
    allowed: boolean;
    text: string;
  }>();
  const error = useCauldronImport((s) => s.error);
  useEffect(() => {
    let depth = 0;
    const reset = () => {
      depth = 0;
      setFeedback(undefined);
      delete document.documentElement.dataset.cauldronDrop;
    };
    function evaluate(event: DragEvent) {
      const data = event.dataTransfer;
      if (!data) return;
      const internal = data.types.includes(DOCUMENT_DRAG_TYPE);
      const files = data.types.includes("Files");
      if (!internal && !files) return;
      let reason = importBlockReason();
      if (
        !reason &&
        internal &&
        !(event.target as Element)?.closest?.(
          "[data-cauldron-target], .cauldron",
        )
      )
        reason = "请拖向顶部“灵感熔炉”入口。";
      const items = Array.from(data.items).filter(
        (item) => item.kind === "file",
      );
      if (!reason && files && items.length > 1)
        reason = "每次只能拖入一个文件。";
      if (!reason && files && data.files.length === 1) {
        try {
          fileSource(data.files[0].name);
          if (data.files[0].size > 20_000_000)
            reason = "单个文件不能超过 20 MB。";
        } catch (error) {
          reason = (error as Error).message;
        }
      }
      return { internal, reason };
    }
    const over = (event: DragEvent) => {
      const result = evaluate(event);
      if (!result) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = result.reason ? "none" : "copy";
      document.documentElement.dataset.cauldronDrop = result.reason
        ? "blocked"
        : "allowed";
      setFeedback({
        allowed: !result.reason,
        text:
          result.reason ||
          (result.internal
            ? "可放入 · 松开后查看全文副本，确认保存后加入熔炉。"
            : "可放入 · 单个 TXT / DOCX / PPTX / XLSX / PDF；松开后预览，确认保存后加入。"),
      });
    };
    const enter = (event: DragEvent) => {
      if (evaluate(event)) {
        depth++;
        over(event);
      }
    };
    const leave = () => {
      if (--depth <= 0) reset();
    };
    const drop = (event: DragEvent) => {
      const result = evaluate(event);
      if (!result) return;
      event.preventDefault();
      event.stopPropagation();
      reset();
      try {
        if (result.reason) throw new Error(result.reason);
        if (result.internal)
          queueImport({ copy: draggedDocument(event.dataTransfer!) });
        else {
          const files = event.dataTransfer!.files;
          const directory = Array.from(event.dataTransfer!.items).some(
            (item) => item.webkitGetAsEntry?.()?.isDirectory,
          );
          if (directory || files.length !== 1)
            throw new Error("每次只支持一个文件，不能拖入文件夹。");
          queueImport({ file: files[0] });
        }
      } catch (error) {
        reportImportError(error);
      } finally {
        endDocumentDrag();
      }
    };
    const end = () => {
      reset();
      endDocumentDrag();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") end();
    };
    document.addEventListener("dragenter", enter, true);
    document.addEventListener("dragover", over, true);
    document.addEventListener("dragleave", leave, true);
    document.addEventListener("drop", drop, true);
    document.addEventListener("dragend", end, true);
    window.addEventListener("blur", end);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("dragenter", enter, true);
      document.removeEventListener("dragover", over, true);
      document.removeEventListener("dragleave", leave, true);
      document.removeEventListener("drop", drop, true);
      document.removeEventListener("dragend", end, true);
      window.removeEventListener("blur", end);
      window.removeEventListener("keydown", key);
      end();
    };
  }, []);
  return (
    <>
      {error && (
        <div className="cauldron-import-error" role="alert">
          <span>{error}</span>
          <button onClick={() => useCauldronImport.setState({ error: "" })}>
            关闭导入提示
          </button>
        </div>
      )}
      {feedback && (
        <div
          className="cauldron-drop-feedback"
          role="status"
          data-allowed={feedback.allowed}
        >
          <strong>{feedback.allowed ? "放入灵感熔炉" : "暂不可放入"}</strong>
          <span>{feedback.text}</span>
        </div>
      )}
    </>
  );
}
