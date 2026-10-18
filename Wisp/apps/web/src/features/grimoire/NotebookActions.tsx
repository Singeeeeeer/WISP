import { useState } from "react";
import { createRepository } from "../../services/repository";
import { useDocuments, useInteraction, useWorkspace } from "../../state/stores";
import { downloadText } from "../../shared/download";
import { withNotebookSession } from "../../services/notebook-export";

const repository = createRepository();

export function NotebookActions({ onResetting }: { onResetting: (value: boolean) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const exportNotebook = async () => {
    setBusy(true);
    try {
      const saved = await repository.exportNotebook();
      const documents = useDocuments.getState();
      const notebook = withNotebookSession(saved, {
        materials: documents.materials,
        status: documents.status,
        settings: useInteraction.getState().settings,
        windows: useWorkspace.getState().windows,
      });
      downloadText(`wisp-notebook-${notebook.exportedAt.slice(0, 10)}.json`, JSON.stringify(notebook, null, 2), "application/json;charset=utf-8");
      setMessage("Notebook downloaded. Saved records, unsaved document and Canvas drafts, and current preferences are included separately.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The notebook could not be exported. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    onResetting(true);
    setMessage("Resetting this browser workspace…");
    try {
      await repository.resetNotebook(() => setMessage("Waiting for another Wisp tab to close its storage. Close other Wisp tabs to finish the reset."));
      try { localStorage.setItem("wisp-tour-seen", "true"); } catch { /* Storage preferences may be disabled. */ }
      useDocuments.setState({ status: {}, errors: {} });
      location.reload();
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "Reset could not finish."} Reload before continuing.`);
    }
  };
  return <div className="notebook-actions">
    <p className="book-notice">Your notebook lives in this browser. Export saved records, unsaved document and Canvas drafts, and current preferences.</p>
    <button disabled={busy} onClick={() => void exportNotebook()}>Export notebook</button>
    <button disabled={busy} onClick={() => setConfirm(true)}>Reset demo desktop</button>
    {confirm && <div className="reset-confirm" role="group" aria-label="Confirm workspace reset">
      <p>Remove all materials, imported files, tasks, replies, preferences and canvas notes from this browser workspace, including other Wisp tabs. Unsaved drafts will also be lost. Export your notebook first to keep a copy.</p>
      <button disabled={busy} onClick={() => void reset()}>Confirm reset</button>
      <button disabled={busy} onClick={() => setConfirm(false)}>Keep my session</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </div>;
}
