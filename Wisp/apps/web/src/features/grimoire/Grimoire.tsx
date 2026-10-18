import { AboutYou } from "../proposals/Proposal";
import { TaskList } from "../delegation/TaskList";

import { useInteraction } from "../../state/stores";
import { Dialog } from "../../shared/Dialog";
import { Sprite } from "../companion/Sprite";
import "./grimoire.css";

const chapters = [
  { name: "Getting started", label: "Getting started", title: "Meet your companion" },
  { name: "Familiars", label: "Familiars and replies", title: "A page for familiars" },
  { name: "About you", label: "About your preferences", title: "A little about you" },
  { name: "Settings", label: "Companion settings", title: "Make the magic yours" },
];

export function Grimoire() {
  const tab = useInteraction((s) => s.bookTab);
  const setTab = (bookTab: string) => useInteraction.setState({ bookTab });
  const settings = useInteraction((s) => s.settings);
  const update = useInteraction((s) => s.updateSettings);
  const status = useInteraction((s) => s.settingsStatus);
  const chapter = chapters.find((item) => item.name === tab) ?? chapters[0];
  return (
    <Dialog
      title="Grimoire"
      close={() => useInteraction.setState({ book: false })}
      className="grimoire-dialog"
    >
      <div className="grimoire-binding" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      {["top-left", "top-right", "bottom-left", "bottom-right"].map(
        (corner) => (
          <span
            key={corner}
            className={`grimoire-corner ${corner}`}
            aria-hidden="true"
          />
        ),
      )}
      <button
        className="grimoire-close"
        aria-label="Close Grimoire"
        onClick={() => useInteraction.setState({ book: false })}
      >
        <span aria-hidden="true">×</span>
        <kbd>Esc</kbd>
      </button>
      <div className="grimoire-spread">
        <div className="grimoire-leaf grimoire-index">
          <header className="grimoire-title">
            <p className="grimoire-caption">Grimoire</p>
            <h2>A little work magic</h2>
            <p>A place for your thoughts to land.</p>
          </header>
          <nav className="grimoire-chapters" aria-label="Grimoire chapters">
            {chapters.map((item, index) => (
              <button
                key={item.name}
                aria-label={item.name}
                aria-pressed={tab === item.name}
                onClick={() => setTab(item.name)}
              >
                <span className="grimoire-chapter-number" aria-hidden="true">
                  {["I", "II", "III", "IV"][index]}
                </span>
                <span className="grimoire-chapter-name">
                  <strong>{item.name}</strong>
                  <small aria-hidden="true">{item.label}</small>
                </span>
                <span className="grimoire-bookmark" aria-hidden="true" />
              </button>
            ))}
          </nav>
          <div className="grimoire-note">
            <Sprite name="witch" />
            <p>
              Your text, your choice.
              <br />
              Every bit of magic starts with confirmation.
            </p>
          </div>
        </div>
        <section className="grimoire-leaf grimoire-reading">
          <header className="grimoire-chapter-heading">
            <p className="grimoire-caption">{chapter.name}</p>
            <h3>{chapter.title}</h3>
          </header>
          <div
            key={tab}
            className="grimoire-content"
            role="region"
            aria-label={chapter.name}
            tabIndex={0}
          >
            {tab === "Getting started" && (
              <div className="book-page">
                <h3>Give your thoughts a place to land.</h3>
                <p>
                  Edit and select text in a document, then click Core abilities at the bottom to open the magic ring. Without a selection, the current document’s full text is used.
                </p>
                <p>
                  Use Understand to explore your text, Check to review it, Create to draft something new, and Summon to delegate a task.
                  The three abilities use local processing by default; you can select Gemini explicitly.
                  Local mode provides source excerpts, limited rule checks, and an event-introduction template.
                  Gemini provides cited summaries, checks, and creative drafts for human review.
                  Results are saved in “Run history”. All three familiars support one-time Gemini tasks and replies; continuous watching uses local rules.
                </p>
                <p>
                  <kbd>Q</kbd> Open Core abilities when not typing · <kbd>Alt / Option + M</kbd>{" "}
                  Open Grimoire · <kbd>Esc</kbd> Close
                </p>
                <p>
                  Drag the window title bar; resize from the bottom-right; use the document button at the bottom to restore it. Text and settings are saved only in this browser.
                </p>
                <p>
                  Right-click an empty desktop area or press Q to open Core abilities. The witch stays in place while the magic ring is open and follows the pointer again when it closes. In document text, use Shift + right-click to open the browser menu.
                </p>
              </div>
            )}
            {tab === "Familiars" && <TaskList />}
            {tab === "About you" && <AboutYou />}
            {tab === "Settings" && (
              <div className="book-page settings">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.characterVisible}
                    onChange={(e) =>
                      update({ characterVisible: e.target.checked })
                    }
                  />{" "}
                  Show the witch
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) =>
                      update({ reducedMotion: e.target.checked })
                    }
                  />{" "}
                  Reduce motion
                </label>
                <label>
                  Character size
                  <input
                    type="range"
                    min="32"
                    max="72"
                    value={settings.characterSize}
                    onChange={(e) =>
                      update({ characterSize: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Idle rhythm
                  <select
                    value={settings.idleRhythm}
                    aria-describedby="idle-rhythm-help"
                    onChange={(e) =>
                      update({
                        idleRhythm:
                          e.target.value === "lively" ? "lively" : "default",
                      })
                    }
                  >
                    <option value="default">Default</option>
                    <option value="lively">Lively</option>
                  </select>
                </label>
                <p id="idle-rhythm-help" className="subtle">
                  After the pointer pauses for half a second, the witch begins to float. Small gestures start after about 1.2 seconds with the default rhythm or 0.65 seconds with Lively. Gestures stop while moving and stay still when reduced motion is on.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.helpfulProposals}
                    onChange={(e) =>
                      update({ helpfulProposals: e.target.checked })
                    }
                  />{" "}
                  Helpful proposals (local suggestions)
                </label>
                <p role="status">{status}</p>
              </div>
            )}
          </div>
          <footer className="grimoire-page-footer">
            <span>Wisp · the witch</span>
            <span>
              {String(chapters.indexOf(chapter) + 1).padStart(2, "0")} / 04
            </span>
          </footer>
        </section>
      </div>
    </Dialog>
  );
}
