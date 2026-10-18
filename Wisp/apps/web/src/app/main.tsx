import { Cauldron } from "../features/cauldron/Cauldron";
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
  const draft = useInteraction((s) => s.draft);
  const watchDraft = useInteraction((s) => s.watchDraft);
  const jointDraft = useInteraction((s) => s.jointDraft);
  const message = useInteraction((s) => s.message);

  const [history, setHistory] = useState(false);
  const [api, setApi] = useState("API 状态未检查");
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
          (s) => s !== "已保存",
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
        <h1>本机存储暂时不可用</h1>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>重新载入</button>
      </main>
    );
  if (!ready) return <main className="startup">正在打开你的工作空间…</main>;
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          ✦ <strong>Wisp</strong>
          <span>一点工作的魔法</span>
        </div>
        <div className="top-status">
          <span className="status-dot" />
          本地工作空间 <span className="module-tag">MODULE 02 · LOCAL</span>
          <button
            disabled={!!draft}
            title={draft ? "先关闭当前浮层，再打开其他面板" : undefined}
            onClick={() =>
              useInteraction.setState({
                cauldron: true,
                menu: false,
                book: false,
              })
            }
          >
            灵感熔炉
          </button>
          <button
            disabled={!!draft}
            title={draft ? "先关闭当前浮层，再打开其他面板" : undefined}
            onClick={() => {
              useInteraction.setState({ menu: false, book: false });
              setHistory(true);
            }}
          >
            处理记录
          </button>
          <button
            disabled={!!draft}
            title={draft ? "先关闭当前浮层，再打开其他面板" : undefined}
            onClick={() => useInteraction.setState({ book: true, menu: false })}
          >
            魔法书
          </button>
        </div>
      </header>
      <main
        className="desktop"
        aria-label="虚拟桌面"
        onContextMenu={(e) => {
          if (
            !e.shiftKey &&
            !useInteraction.getState().draft &&
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
          <h1>让思绪，慢慢成形。</h1>
          <p>一点空间，收好手边的文字。</p>
        </div>
        {windows.map((w) => {
          const m = docs.find((m) => m.id === w.materialId);
          return m ? (
            <DesktopWindow key={w.id} window={w} material={m} />
          ) : null;
        })}
        <TaskMarker />
        <div className="desktop-note">
          你的文字留在这个浏览器中。
          <br />
          仅处理 Wisp 内的材料；Gemini 需选择并确认。
        </div>
      </main>
      <Companion />
      <WandFeedback />
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
            title={draft ? "先关闭当前浮层，再打开其他面板" : undefined}
            onClick={() => {
              useInteraction.setState({ message: "" });
              useWorkspace.setState({ error: "" });
            }}
          >
            知道了
          </button>
        </div>
      )}
      <nav className="dock" aria-label="工作区工具">
        <div className="dock-documents">
          {docs
            .filter((m) => windows.some((w) => w.materialId === m.id))
            .map((m) => (
              <button
                key={m.id}
                aria-label={"打开" + m.title}
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
          aria-label="打开 Canvas 白板"
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
          title={draft ? "先关闭当前浮层，再选择其他能力" : undefined}
          className="spell-button"
          aria-label="打开基础能力"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (e.detail > 0) rememberPointer(e);
            useInteraction.setState({ menu: !menu });
          }}
        >
          <span>✦</span>基础能力 <kbd>Q</kbd>
        </button>
      </nav>
      <footer className="statusbar">
        <span>示例材料可编辑 · 自动保存到本机</span>
        <button
          onClick={() => {
            setApi("正在检查 API…");
            void checkHealth().then(setApi);
          }}
        >
          {api} ↻
        </button>
        <span>本地优先 · Gemini 由你确认后调用</span>
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
