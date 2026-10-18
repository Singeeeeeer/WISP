import { useDocuments, useInteraction, retrySave } from "../../state/stores";
import { rememberPointer } from "../companion/pointer";
import { useWorkspace } from "../../state/stores";
import { selectText, type Material } from "../../domain/model";
import { requestDocumentCopy } from "../../services/cauldron-import";
export function DocumentEditor({ material }: { material: Material }) {
  const edit = useDocuments((s) => s.edit);
  const status = useDocuments((s) => s.status[material.id]);
  const error = useDocuments((s) => s.errors[material.id]);
  const selection = useInteraction((s) => s.selection);
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
                message: "Selection is invalid. Select complete text again; it will not expand to the full text automatically.",
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
        Document title {material.id}
      </label>
      <input
        id={"title-" + material.id}
        className="document-title"
        value={material.title}
        maxLength={120}
        onChange={(e) => edit(material.id, "title", e.target.value)}
      />
      <textarea
        aria-label={material.title + " text"}
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
                message: "Selection is invalid. Select complete text again; it will not expand to the full text automatically.",
              },
            });
          }
        }}
      />
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => retrySave(material.id)}>Retry save</button>
        </div>
      )}
      <div className="document-copy-actions">
        <button onClick={() => requestDocumentCopy(material.id)}>
          Add full copy to cauldron
        </button>
        <button
          disabled={selection?.materialId !== material.id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => requestDocumentCopy(material.id, true)}
        >
          Add selection copy to cauldron
        </button>
      </div>
      <div className="document-hint">
        Select text or focus the document, then use a two-finger tap or right-click to open Core abilities. Shift + right-click opens the browser menu.
      </div>
    </div>
  );
}
