import { useDocuments, useInteraction, retrySave } from "../../state/stores";
import { rememberPointer } from "../companion/pointer";
import { useWorkspace } from "../../state/stores";
import { selectText, type Material } from "../../domain/model";
export function DocumentEditor({ material }: { material: Material }) {
  const edit = useDocuments((s) => s.edit);
  const status = useDocuments((s) => s.status[material.id]);
  const error = useDocuments((s) => s.errors[material.id]);
  return (
    <div
      className="document-content"
      onContextMenu={(e) => {
        if (e.shiftKey || useInteraction.getState().draft || useInteraction.getState().batchDraft) return;
        e.preventDefault();
        e.stopPropagation();
        useWorkspace.getState().activate("window-" + material.id);
        const el = e.target;
        if (el instanceof HTMLTextAreaElement) {
          try {
            useInteraction.setState({
              selection:
                el.selectionStart === el.selectionEnd
                  ? undefined
                  : selectText(material, el.selectionStart, el.selectionEnd),
              selectionError: undefined,
            });
          } catch {
            useInteraction.setState({
              selection: undefined,
              selectionError: {
                materialId: material.id,
                message: "选区无效，请重新选择完整文字；不会自动扩大到全文。",
              },
            });
          }
        } else
          useInteraction.setState({
            selection: undefined,
            selectionError: undefined,
          });
        rememberPointer(e);
        useInteraction.setState({ menu: true });
      }}
    >
      <div className="document-meta">
        <span>LOCAL DOCUMENT · V{material.version}</span>
        <span data-testid={"save-" + material.id} role="status">
          {status}
        </span>
      </div>
      <label className="sr-only" htmlFor={"title-" + material.id}>
        文档标题 {material.id}
      </label>
      <input
        id={"title-" + material.id}
        className="document-title"
        value={material.title}
        maxLength={120}
        onChange={(e) => edit(material.id, "title", e.target.value)}
      />
      <textarea
        aria-label={material.title + "正文"}
        value={material.text}
        spellCheck={false}
        onPointerDown={(e) => {
          if (e.button === 2 && !e.shiftKey) e.preventDefault();
        }}
        onChange={(e) => edit(material.id, "text", e.target.value)}
        onSelect={(e) => {
          const el = e.currentTarget;
          if (el.selectionStart === el.selectionEnd) {
            useInteraction.setState({
              selection: undefined,
              selectionError: undefined,
            });
            return;
          }
          try {
            useInteraction.setState({
              selection: selectText(
                material,
                el.selectionStart,
                el.selectionEnd,
              ),
              selectionError: undefined,
            });
          } catch {
            useInteraction.setState({
              selection: undefined,
              selectionError: {
                materialId: material.id,
                message: "选区无效，请重新选择完整文字；不会自动扩大到全文。",
              },
            });
          }
        }}
      />
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => retrySave(material.id)}>重试保存</button>
        </div>
      )}
      <div className="document-hint">
        选中文字或定位文档，双指辅助点按／右键打开基础能力；Shift＋右键使用浏览器菜单。
      </div>
    </div>
  );
}
