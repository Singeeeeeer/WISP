import { useEffect, useRef, useState } from "react";
import { initialWindows, selectText, type Material } from "../../domain/model";
import {
  openMaterial,
  useDocuments,
  useInteraction,
  useWorkspace,
} from "../../state/stores";
import { checkHealth } from "../../services/api";
import {
  endDocumentDrag,
  reportImportError,
  startDocumentDrag,
  useCauldronImport,
} from "../../services/cauldron-import";
import { rememberPointer } from "../companion/pointer";
import { CHECKLIST_ID, desktopApp } from "./desktop-scene";
import { OsIcon } from "./OsIcon";

const menuNames = ["File", "Edit", "View", "Window", "Help"] as const;
type MenuName = (typeof menuNames)[number];
const TOUR_SEEN_KEY = "wisp-tour-seen";

function hasSeenTour() {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function DesktopMenubar({ openHistory }: { openHistory: () => void }) {
  const materials = useDocuments((s) => s.materials);
  const windows = useWorkspace((s) => s.windows);
  const active = useWorkspace((s) => s.active);
  const panelOpen = useInteraction(
    (s) =>
      !!(
        s.draft ||
        s.batchDraft ||
        s.watchDraft ||
        s.jointDraft ||
        s.cauldron ||
        s.canvas
      ),
  );
  const importOccupied = useCauldronImport((s) => s.occupied);
  const blocked = panelOpen || importOccupied;
  const grimoireBlocked =
    useInteraction(
      (s) =>
        !!(
          s.draft ||
          s.batchDraft ||
          s.watchDraft ||
          s.jointDraft ||
          s.cauldron
        ),
    ) || importOccupied;
  const [menu, setMenu] = useState<{ name: MenuName; left: number }>();
  const [tour, setTour] = useState(() => !hasSeenTour());
  const tourCovered = useInteraction((s) => s.book || s.menu);
  const [now, setNow] = useState(() => new Date());
  const ref = useRef<HTMLDivElement>(null);
  const currentWindow = windows.find(
    (w) => w.id === active && !w.minimized && !w.closed,
  );
  const current = materials.find((m) => m.id === currentWindow?.materialId);
  useEffect(() => {
    const close = (e: globalThis.PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(undefined);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(undefined);
        dismissTour();
      }
    };
    const timer = setInterval(() => setNow(new Date()), 60_000);
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(timer);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, []);
  function dismissTour() {
    setTour(false);
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "true");
    } catch {
      // The walkthrough remains dismissible when browser storage is unavailable.
    }
  }
  function perform(action: () => void) {
    setMenu(undefined);
    action();
  }
  const notify = (message: string) => useInteraction.setState({ message });
  function arrange() {
    const defaults = initialWindows(
      windows
        .map((w) => materials.find((m) => m.id === w.materialId))
        .filter((m): m is Material => !!m),
    );
    for (const next of defaults) useWorkspace.getState().move(next.id, next);
    if (materials.some((m) => m.id === "proposal")) openMaterial("proposal");
    notify("Windows arranged. Your materials and familiar tasks are safe.");
  }
  function selectCurrent() {
    if (!current?.text) return;
    const text = document.querySelector<HTMLTextAreaElement>(
      ".desktop-window.active .document-body",
    );
    text?.focus();
    text?.select();
    if (!text) {
      const reading = document.querySelector<HTMLElement>(
        ".desktop-window.active .document-reading",
      );
      if (reading) {
        reading.focus();
        const range = document.createRange();
        range.selectNodeContents(reading);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
    useInteraction.setState({
      selection: selectText(current, 0, current.text.length),
      selectionError: undefined,
    });
  }
  const openCanvas = () =>
    useInteraction.setState({ canvas: true, menu: false, book: false });
  return (
    <div ref={ref} className="desktop-menu-host">
      <header className="os-menubar">
        <div className="menu-left">
          <button
            className="system-mark-button"
            aria-label="Grimoire"
            title="Open Grimoire · Alt + M"
            disabled={grimoireBlocked}
            onClick={() => useInteraction.setState({ book: true, menu: false })}
          >
            <img
              className="system-mark"
              src="/assets/prototype/witch_idle.png"
              alt=""
            />
          </button>
          <strong>{current ? desktopApp(current).name : "Finder"}</strong>
          {menuNames.map((name) => (
            <button
              key={name}
              data-os-menu={name.toLowerCase()}
              disabled={blocked}
              aria-expanded={menu?.name === name}
              aria-controls="desktop-os-menu"
              onClick={(e) =>
                setMenu(
                  menu?.name === name
                    ? undefined
                    : {
                        name,
                        left: Math.max(
                          10,
                          Math.min(
                            e.currentTarget.getBoundingClientRect().left,
                            innerWidth - 330,
                          ),
                        ),
                      },
                )
              }
            >
              {name}
            </button>
          ))}
        </div>
        <div className="menu-status">
          <span className="demo-label">LOCAL WORKSPACE</span>
          <OsIcon name="wifi-high" />
          <OsIcon name="battery-full" />
          <time dateTime={now.toISOString()}>
            {now.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            &nbsp;{" "}
            {now.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </div>
      </header>
      {menu && (
        <div
          id="desktop-os-menu"
          className="os-menu"
          aria-label={menu.name + " menu"}
          style={{ left: menu.left }}
        >
          {(menu.name === "File" || menu.name === "Window") && (
            <>
              <div className="os-menu-heading">
                {menu.name === "File"
                  ? "OPEN A WORKSPACE FILE"
                  : "WORKSPACE WINDOWS"}
              </div>
              {materials.map((m) => (
                <button
                  key={m.id}
                  onClick={() => perform(() => openMaterial(m.id))}
                >
                  <OsIcon name={desktopApp(m).icon} />
                  <span>
                    {menu.name === "File"
                      ? desktopApp(m).file
                      : desktopApp(m).name + " — " + m.title}
                  </span>
                </button>
              ))}
              <button onClick={() => perform(openCanvas)}>
                <OsIcon name="squares-four" />
                <span>Mistport.board</span>
              </button>
            </>
          )}
          {menu.name === "File" && (
            <>
              <div className="os-menu-heading">WISP</div>
              <button
                onClick={() =>
                  perform(() =>
                    useInteraction.setState({
                      cauldron: true,
                      menu: false,
                      book: false,
                    }),
                  )
                }
              >
                <span>Inspiration Cauldron</span>
              </button>
              <button onClick={() => perform(openHistory)}>
                <span>Run history</span>
              </button>
            </>
          )}
          {menu.name === "Edit" && (
            <>
              <button
                disabled={!current}
                onClick={() => perform(selectCurrent)}
              >
                Select current document <small>for a spell</small>
              </button>
              <button
                onClick={() =>
                  perform(() => {
                    window.getSelection()?.removeAllRanges();
                    useInteraction.setState({
                      selection: undefined,
                      selectionError: undefined,
                    });
                  })
                }
              >
                Clear selection
              </button>
            </>
          )}
          {menu.name === "View" && (
            <>
              <button onClick={() => perform(arrange)}>
                Arrange demo windows
              </button>
              <button onClick={() => perform(showDesktop)}>Show desktop</button>
              <button
                onClick={() =>
                  perform(() => {
                    for (const m of materials) openMaterial(m.id);
                    if (materials.some((m) => m.id === "proposal"))
                      openMaterial("proposal");
                  })
                }
              >
                Open all workspace apps
              </button>
            </>
          )}
          {menu.name === "Window" && (
            <>
              <div className="os-menu-heading">WINDOW CONTROLS</div>
              <button
                disabled={!currentWindow}
                onClick={() =>
                  perform(() => {
                    if (currentWindow)
                      useWorkspace
                        .getState()
                        .move(currentWindow.id, { minimized: true });
                  })
                }
              >
                Minimize active window
              </button>
              <button
                disabled={!currentWindow}
                onClick={() =>
                  perform(() => {
                    if (currentWindow)
                      useWorkspace.getState().move(currentWindow.id, {
                        maximized: !currentWindow.maximized,
                      });
                  })
                }
              >
                Zoom active window
              </button>
            </>
          )}
          {menu.name === "Help" && (
            <>
              <button onClick={() => perform(() => setTour(true))}>
                Meet Wisp · walkthrough
              </button>
              <button
                onClick={() =>
                  perform(() =>
                    notify(
                      "Secondary-click: spells · Q: core abilities · Alt + M: grimoire · Esc: close · Drag a title bar: move window",
                    ),
                  )
                }
              >
                Keyboard & trackpad shortcuts
              </button>
              <button
                onClick={() =>
                  perform(() =>
                    notify(
                      "Wisp is a browser workspace. Materials stay on this device. Gemini runs only after you confirm.",
                    ),
                  )
                }
              >
                About this workspace
              </button>
              <button
                onClick={() =>
                  perform(() => {
                    notify("Checking API…");
                    void checkHealth().then(notify);
                  })
                }
              >
                Check API connection
              </button>
            </>
          )}
        </div>
      )}
      {tour && !blocked && !tourCovered && (
        <aside className="onboarding" aria-label="Demo walkthrough">
          <button
            className="onboarding-close"
            aria-label="Dismiss walkthrough"
            onClick={dismissTour}
          >
            ×
          </button>
          <span className="eyebrow">MEET YOUR CURSOR COMPANION</span>
          <h1>
            Stay in your flow.
            <br />
            Leave a little to her.
          </h1>
          <p>
            Wisp travels with your cursor in this workspace.
            <br />
            Secondary-click for four basic abilities.
            <br />
            Her guide and settings live in a little grimoire.
          </p>
          <button
            className="primary"
            disabled={blocked}
            onClick={() => {
              if (blocked) return;
              dismissTour();
              if (!current && materials[0]) openMaterial(materials[0].id);
              useInteraction.getState().open("summon");
            }}
          >
            Try Summon
          </button>
          <button className="text-button" onClick={dismissTour}>
            Just explore the desktop
          </button>
          <small>
            Press <kbd>Alt M</kbd> to open her grimoire.
          </small>
        </aside>
      )}
    </div>
  );
}

function showDesktop() {
  for (const w of useWorkspace.getState().windows)
    useWorkspace.getState().move(w.id, { minimized: true });
  useInteraction.setState({ canvas: false, menu: false });
}

export function DesktopFiles() {
  const materials = useDocuments((s) => s.materials);
  const blocked = useInteraction(
    (s) =>
      !!(
        s.draft ||
        s.batchDraft ||
        s.watchDraft ||
        s.jointDraft ||
        s.cauldron ||
        s.book
      ),
  );
  const importOccupied = useCauldronImport((s) => s.occupied);
  const lastDrag = useRef(0);
  const files = ["proposal", "venue", CHECKLIST_ID]
    .map((id) => materials.find((m) => m.id === id))
    .filter((m): m is Material => !!m);
  return (
    <div className="desktop-files" aria-label="Desktop files">
      {files.map((m) => (
        <button
          key={m.id}
          draggable
          aria-label={"Desktop file " + desktopApp(m).file}
          onClick={() => {
            if (Date.now() - lastDrag.current > 400) openMaterial(m.id);
          }}
          onDragStart={(e) => {
            lastDrag.current = Date.now();
            try {
              startDocumentDrag(m.id, e.dataTransfer);
            } catch (error) {
              e.preventDefault();
              reportImportError(error);
            }
          }}
          onDragEnd={() => {
            lastDrag.current = Date.now();
            endDocumentDrag();
          }}
        >
          <OsIcon name={desktopApp(m).icon} />
          <span>{desktopApp(m).file}</span>
        </button>
      ))}
      <button
        aria-label="Desktop file Mistport.board"
        disabled={blocked || importOccupied}
        onClick={() => useInteraction.setState({ canvas: true, menu: false })}
      >
        <OsIcon name="squares-four" />
        <span>Mistport.board</span>
      </button>
    </div>
  );
}

export function WorkspaceDock() {
  const materials = useDocuments((s) => s.materials);
  const windows = useWorkspace((s) => s.windows);
  const active = useWorkspace((s) => s.active);
  const state = useInteraction();
  const importOccupied = useCauldronImport((s) => s.occupied);
  const blocked = !!(
    state.draft ||
    state.batchDraft ||
    state.book ||
    state.cauldron ||
    state.watchDraft ||
    state.jointDraft ||
    importOccupied
  );
  const docs = ["proposal", "venue", CHECKLIST_ID]
    .map((id) => materials.find((m) => m.id === id))
    .filter((m): m is Material => !!m);
  return (
    <nav
      className="dock desktop-dock app-switcher"
      aria-label="Workspace tools"
    >
      {docs.map((m) => {
        const app = desktopApp(m);
        const w = windows.find((w) => w.materialId === m.id);
        return (
          <button
            key={m.id}
            className={`${w && !w.closed ? "is-open" : ""} ${w?.minimized ? "is-minimized" : ""}`}
            aria-label={"Open " + m.title}
            aria-pressed={active === w?.id && !w?.minimized}
            onClick={() => openMaterial(m.id)}
          >
            <span className={"dock-icon " + app.tone + "-icon"}>
              <OsIcon name={app.icon} />
            </span>
            <span>{app.name}</span>
          </button>
        );
      })}
      <button
        aria-label="Open Canvas board"
        disabled={blocked}
        aria-pressed={state.canvas}
        onClick={() => useInteraction.setState({ canvas: true, menu: false })}
      >
        <span className="dock-icon canvas-icon">
          <OsIcon name="squares-four" />
        </span>
        <span>Canvas</span>
      </button>
      <span className="dock-divider" />
      <button
        aria-label="Show desktop files"
        disabled={blocked || state.canvas}
        onClick={showDesktop}
      >
        <span className="dock-icon files-icon">
          <OsIcon name="folder" />
        </span>
        <span>Files</span>
      </button>
    </nav>
  );
}

export function DesktopHint() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <aside className="demo-hint">
      <img src="/assets/prototype/witch_idle.png" alt="" />
      <span>
        <strong>Wisp follows your cursor.</strong>Secondary-click anywhere for
        spells. <kbd>Alt M</kbd> opens her grimoire.
      </span>
      <button
        aria-label="Dismiss desktop hint"
        onClick={() => setVisible(false)}
      >
        <OsIcon name="x" />
      </button>
    </aside>
  );
}

export function DesktopFooter() {
  const status = useDocuments((s) => s.status);
  const panelOpen = useInteraction(
    (s) =>
      !!(
        s.draft ||
        s.batchDraft ||
        s.jointDraft ||
        s.watchDraft ||
        s.cauldron ||
        s.canvas ||
        s.book
      ),
  );
  const importOccupied = useCauldronImport((s) => s.occupied);
  const blocked = panelOpen || importOccupied;
  const save = Object.values(status).includes("failed")
    ? "A material needs your attention"
    : Object.values(status).some((s) => s !== "saved")
      ? "Saving on this device…"
      : "Saved on this device";
  return (
    <footer className="desktop-footer">
      <span>{save}</span>
      <button
        aria-label="Open core abilities"
        disabled={blocked}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (e.detail > 0) rememberPointer(e);
          useInteraction.setState((s) => ({ menu: !s.menu }));
        }}
      >
        Spells <kbd>Q</kbd>
      </button>
      <span>Browser workspace · Gemini only after confirmation</span>
    </footer>
  );
}
