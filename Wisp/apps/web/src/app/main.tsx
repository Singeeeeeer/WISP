import { Cauldron } from "../features/cauldron/Cauldron";
import { CauldronDropTarget } from "../features/cauldron/CauldronDropTarget";
import { Canvas } from "../features/canvas/Canvas";
import { observeCauldron } from "../services/cauldron-runtime";
import { WatchPanel } from "../features/delegation/WatchPanel";
import { observeWatches } from "../services/watch-runtime";
import { JointPanel } from "../features/proposals/JointPanel";
import { ProposalHost } from "../features/proposals/Proposal";
import { observePreferences } from "../services/proposal-runtime";
import { TaskMarker } from "../features/delegation/TaskList";
import { observeTasks } from "../services/task-runtime";
import { LocalHistory } from "../features/check/CheckPanel";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  initialize,
  openMaterial,
  useDocuments,
  useInteraction,
  useWorkspace,
} from "../state/stores";
import { DesktopWindow } from "../features/workspace/DesktopWindow";
import { CapabilityPanel } from "../features/capabilities/CapabilityPanel";
import { Grimoire } from "../features/grimoire/Grimoire";
import { Companion } from "../features/companion/Companion";
import { WandFeedback } from "../features/companion/WandFeedback";
import { rememberPointer } from "../features/companion/pointer";
import { checkHealth } from "../services/api";
import "./styles.css";
function App() {
  const docs = useDocuments((s) => s.materials);
  const ready = useDocuments((s) => s.ready);
  const fatal = useDocuments((s) => s.fatal);
  const windows = useWorkspace((s) => s.windows);
  const layoutError = useWorkspace((s) => s.error);
  const menu = useInteraction((s) => s.menu);
  const cauldron = useInteraction((s) => s.cauldron);
  const canvas = useInteraction((s) => s.canvas);
  const book = useInteraction((s) => s.book);
  const draft = useInteraction((s) => s.draft ?? s.batchDraft);
  const watchDraft = useInteraction((s) => s.watchDraft);
  const jointDraft = useInteraction((s) => s.jointDraft);
  const message = useInteraction((s) => s.message);

  const [history, setHistory] = useState(false);
  const [api, setApi] = useState("API status not checked");
  const [, resize] = useState(0);
  useEffect(() => {
    if (ready) {
      const stopCauldron = observeCauldron();
      const stopTasks = observeTasks();
      const stopWatches = observeWatches();
      const stopPreferences = observePreferences();
      return () => {
        stopCauldron();
        stopTasks();
        stopWatches();
        stopPreferences();
      };
    }
  }, [ready]);
  useEffect(() => {
    void initialize();
    const onResize = () => resize((n) => n + 1);
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const input = !!target.closest(
        'input, textarea, select, [contenteditable="true"]',
      );
      const state = useInteraction.getState();
      if (
        history ||
        state.draft ||
        state.batchDraft ||
        state.cauldron ||
        state.canvas ||
        state.jointDraft ||
        state.watchDraft
      )
        return;
      if (e.key === "Escape") {
        useInteraction.setState(
          state.draft
            ? { draft: undefined }
            : state.book
              ? { book: false }
              : { menu: false },
        );
      } else if (e.altKey && e.code === "KeyM" && !input && !state.draft) {
        e.preventDefault();
        useInteraction.setState({ book: !state.book, menu: false });
      } else if (
        e.key.toLowerCase() === "q" &&
        !input &&
        !state.book &&
        !state.draft &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        useInteraction.setState({ menu: !state.menu });
      }
    };
    const leaving = (e: BeforeUnloadEvent) => {
      if (
        Object.values(useDocuments.getState().status).some(
          (s) => s !== "saved",
        )
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("pointermove", rememberPointer);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("pointermove", rememberPointer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", leaving);
    };
  }, [history]);
  if (fatal)
    return (
      <main className="startup" role="alert">
        <h1>Local storage is temporarily unavailable</h1>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    );
  if (!ready) return <main className="startup">Opening your workspace…</main>;
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          ✦ <strong>Wisp</strong>
          <span>A little working magic</span>
        </div>
        <div className="top-status">
          <span className="status-dot" />
          Local workspace <span className="module-tag">MODULE 02 · LOCAL</span>
          <button
            data-cauldron-target
            disabled={!!draft}
            title={draft ? "Close the current panel before opening another" : undefined}
            onClick={() =>
              useInteraction.setState({
                cauldron: true,
                menu: false,
                book: false,
              })
            }
          >
            Inspiration Cauldron
          </button>
          <button
            disabled={!!draft}
            title={draft ? "Close the current panel before opening another" : undefined}
            onClick={() => {
              useInteraction.setState({ menu: false, book: false });
              setHistory(true);
            }}
          >
            Run history
          </button>
          <button
            disabled={!!draft}
            title={draft ? "Close the current panel before opening another" : undefined}
            onClick={() => useInteraction.setState({ book: true, menu: false })}
          >
            Grimoire
          </button>
        </div>
      </header>
      <main
        className="desktop"
        aria-label="Virtual desktop"
        onContextMenu={(e) => {
          if (
            !e.shiftKey &&
            !useInteraction.getState().draft &&
            !useInteraction.getState().batchDraft &&
            !useInteraction.getState().canvas &&
            !(e.target as HTMLElement).closest("textarea,input,button")
          ) {
            e.preventDefault();
            rememberPointer(e);
            useInteraction.setState({ menu: true });
          }
        }}
      >
        <div className="desktop-intro">
          <div className="eyebrow">A QUIET PLACE FOR YOUR IDEAS</div>
          <h1>Give your thoughts room to take shape.</h1>
          <p>A little space for the words at hand.</p>
        </div>
        {windows.map((w) => {
          const m = docs.find((m) => m.id === w.materialId);
          return m ? (
            <DesktopWindow key={w.id} window={w} material={m} />
          ) : null;
        })}
        <TaskMarker />
        <div className="desktop-note">
          Your words stay in this browser.
          <br />
          Wisp processes only the materials you choose; Gemini always requires confirmation.
        </div>
      </main>
      <Companion />
      <WandFeedback />
      <CauldronDropTarget />
      <ProposalHost
        blocked={
          !!(
            canvas ||
            cauldron ||
            history ||
            draft ||
            jointDraft ||
            watchDraft ||
            book ||
            menu
          )
        }
      />
      {(message || layoutError) && (
        <div role="alert" className="toast">
          {message || layoutError}
          <button
            disabled={!!draft}
            title={draft ? "Close the current panel before opening another" : undefined}
            onClick={() => {
              useInteraction.setState({ message: "" });
              useWorkspace.setState({ error: "" });
            }}
          >
            Got it
          </button>
        </div>
      )}
      <nav className="dock" aria-label="Workspace tools">
        <div className="dock-documents">
          {docs
            .filter((m) => windows.some((w) => w.materialId === m.id))
            .map((m) => (
              <button
                key={m.id}
                aria-label={"Open " + m.title}
                onClick={() => {
                  openMaterial(m.id);
                  useInteraction.setState({ selection: undefined });
                }}
              >
                <span>▤</span>
                {m.title}
              </button>
            ))}
        </div>
        <div className="dock-divider" />
        <button
          aria-label="Open Canvas board"
          disabled={
            !!(draft || book || cauldron || history || jointDraft || watchDraft)
          }
          aria-pressed={canvas}
          onClick={() => useInteraction.setState({ canvas: true, menu: false })}
        >
          Canvas
        </button>
        <button
          disabled={!!draft}
          title={draft ? "Close the current panel before choosing another ability" : undefined}
          className="spell-button"
          aria-label="Open core abilities"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (e.detail > 0) rememberPointer(e);
            useInteraction.setState({ menu: !menu });
          }}
        >
          <span>✦</span>Core abilities <kbd>Q</kbd>
        </button>
      </nav>
      <footer className="statusbar">
        <span>Editable sample materials · saved automatically on this device</span>
        <button
          onClick={() => {
            setApi("Checking API…");
            void checkHealth().then(setApi);
          }}
        >
          {api} ↻
        </button>
        <span>Local first · Gemini runs only after you confirm</span>
      </footer>
      {cauldron &&
        !history &&
        !draft &&
        !jointDraft &&
        !watchDraft &&
        !book && <Cauldron />}
      {canvas && (
        <Canvas
          blocked={
            !!(
              cauldron ||
              history ||
              draft ||
              jointDraft ||
              watchDraft ||
              book ||
              menu
            )
          }
        />
      )}
      {history && <LocalHistory close={() => setHistory(false)} />}
      {watchDraft && !history && (
        <WatchPanel key={watchDraft.id} source={watchDraft} />
      )}
      {jointDraft && !watchDraft && !history && (
        <JointPanel key={jointDraft.id} draft={jointDraft} />
      )}
      {draft && !watchDraft && !jointDraft && !history && <CapabilityPanel />}
      {book && !draft && !watchDraft && !jointDraft && !history && <Grimoire />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
