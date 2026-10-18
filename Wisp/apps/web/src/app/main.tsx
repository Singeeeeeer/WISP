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
import {
  DesktopFiles,
  DesktopFooter,
  DesktopHint,
  DesktopMenubar,
  WorkspaceDock,
} from "../features/workspace/DesktopChrome";
import { useCauldron } from "../services/cauldron-runtime";
import "./styles.css";
import "./prototype-theme.css";
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
  const reducedMotion = useInteraction((s) => s.settings.reducedMotion);

  const [history, setHistory] = useState(false);
  const cauldronCount = useCauldron((s) => s.entries.length);
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
    const reset = (event: Event) => {
      if ((event as CustomEvent<{ remote: boolean }>).detail.remote)
        useDocuments.setState({ ready: false, status: {}, fatal: "This workspace was reset in another Wisp tab. Reload after that reset finishes to open the fresh desktop." });
    };
    const onResize = () => resize((n) => n + 1);
    const key = (e: KeyboardEvent) => {
      if (document.documentElement.dataset.workspaceReset) return;
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
        Object.values(useDocuments.getState().status).some((s) => s !== "saved")
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("pointermove", rememberPointer);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leaving);
    window.addEventListener("wisp:workspace-reset", reset);
    return () => {
      window.removeEventListener("pointermove", rememberPointer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", leaving);
      window.removeEventListener("wisp:workspace-reset", reset);
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
    <div className="app-shell" data-reduced-motion={reducedMotion}>
      <DesktopMenubar
        openHistory={() => {
          useInteraction.setState({ menu: false, book: false });
          setHistory(true);
        }}
      />
      <main
        className="desktop"
        aria-label="Virtual desktop"
        onContextMenu={(e) => {
          if (
            !e.shiftKey &&
            !useInteraction.getState().draft &&
            !useInteraction.getState().batchDraft &&
            !useInteraction.getState().canvas &&
            !useInteraction.getState().cauldron &&
            !useInteraction.getState().book &&
            !useInteraction.getState().jointDraft &&
            !useInteraction.getState().watchDraft &&
            !history &&
            !(e.target as HTMLElement).closest("textarea,input,button")
          ) {
            e.preventDefault();
            rememberPointer(e);
            useInteraction.setState({ menu: true });
          }
        }}
      >
        <DesktopFiles />
        {windows.map((w) => {
          const m = docs.find((m) => m.id === w.materialId);
          return m ? (
            <DesktopWindow key={w.id} window={w} material={m} />
          ) : null;
        })}
        <TaskMarker />
        <DesktopHint />
        <WorkspaceDock />
        <DesktopFooter />
      </main>
      <Companion />
      <WandFeedback />
      <CauldronDropTarget />
      <button
        className="furnace-anchor"
        data-cauldron-target
        aria-label="Inspiration Cauldron"
        disabled={
          !!(draft || canvas || book || history || jointDraft || watchDraft)
        }
        title="Open Inspiration Cauldron, or drag a desktop file here"
        onClick={() =>
          useInteraction.setState({ cauldron: true, menu: false, book: false })
        }
      >
        <img src="/assets/prototype/pot_low.png" alt="" />
        <span>Idea Cauldron</span>
        <small>{cauldronCount}</small>
      </button>
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
            title={
              draft
                ? "Close the current panel before opening another"
                : undefined
            }
            onClick={() => {
              useInteraction.setState({ message: "" });
              useWorkspace.setState({ error: "" });
            }}
          >
            Got it
          </button>
        </div>
      )}
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
