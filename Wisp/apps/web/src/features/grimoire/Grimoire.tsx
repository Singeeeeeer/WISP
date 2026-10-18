import { useLayoutEffect, useRef, useState } from "react";
import { NotebookActions } from "./NotebookActions";
import { AboutYou } from "../proposals/Proposal";
import { TaskList } from "../delegation/TaskList";

import { useInteraction } from "../../state/stores";
import { Dialog } from "../../shared/Dialog";
import { Sprite } from "../companion/Sprite";
import { pointer } from "../companion/pointer";
import "./grimoire.css";

const chapters = [
  {
    name: "Getting started",
    title: "Getting to know each other",
    kicker: "HOW WE GET ALONG",
  },
  {
    name: "Familiars",
    title: "Who is helping today",
    kicker: "THE FAMILIAR REGISTER",
  },
  {
    name: "About you",
    title: "The little things she remembers",
    kicker: "A FEW THINGS ABOUT YOU",
  },
  {
    name: "Settings",
    title: "A rhythm that feels right",
    kicker: "MAKE YOURSELF COMFORTABLE",
  },
];

export function Grimoire() {
  const [resetting, setResetting] = useState(false);
  const tab = useInteraction((s) => s.bookTab);
  const setTab = (bookTab: string) => useInteraction.setState({ bookTab });
  const settings = useInteraction((s) => s.settings);
  const update = useInteraction((s) => s.updateSettings);
  const status = useInteraction((s) => s.settingsStatus);
  const chapter = chapters.find((item) => item.name === tab) ?? chapters[0];
  const art = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const book = art.current?.closest<HTMLElement>(".grimoire-dialog");
    book?.style.setProperty("--book-from-x", `${pointer.x - innerWidth / 2}px`);
    book?.style.setProperty(
      "--book-from-y",
      `${pointer.y - innerHeight / 2}px`,
    );
  }, []);
  return (
    <Dialog
      title="Grimoire"
      close={() => { if (!resetting) useInteraction.setState({ book: false }); }}
      className={
        "grimoire-dialog" + (settings.reducedMotion ? " grimoire-reduced" : "")
      }
    >
      <img
        ref={art}
        className="grimoire-art"
        src="/assets/prototype/grimoire-spread.png"
        alt=""
        aria-hidden="true"
      />
      <button
        className="grimoire-close"
        disabled={resetting}
        aria-label="Close Grimoire"
        onClick={() => useInteraction.setState({ book: false })}
      >
        <span>Close</span>
        <kbd>Esc</kbd>
      </button>
      <div className="grimoire-spread">
        <div className="grimoire-leaf grimoire-index">
          <header className="grimoire-title">
            <p className="grimoire-caption">THE LITTLE GRIMOIRE</p>
            <h2>
              Notes of a <br />
              little companion
            </h2>
            <p>Learning your rhythm, a little at a time.</p>
          </header>
          <nav className="grimoire-chapters" aria-label="Grimoire chapters">
            {chapters.map((item) => (
              <button
                key={item.name}
                aria-label={item.name}
                aria-pressed={tab === item.name}
                disabled={resetting}
                onClick={() => setTab(item.name)}
              >
                <span className="grimoire-chapter-name">
                  <strong>{item.name}</strong>
                </span>
              </button>
            ))}
          </nav>
          <div className="grimoire-note">
            <img
              src="/assets/prototype/witch_book.png"
              alt=""
              aria-hidden="true"
            />
            <p>
              Your words, your decisions.
              <br />
              My magic stays where you invite it.
            </p>
          </div>
        </div>
        <section className="grimoire-leaf grimoire-reading">
          <header className="grimoire-chapter-heading">
            <p className="grimoire-caption">{chapter.kicker}</p>
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
                <div className="grimoire-guide-entry">
                  <Sprite name="witch" />
                  <div>
                    <strong>A little life between tasks</strong>
                    <p>
                      Pause for a moment. She adjusts her hat, sweeps up
                      stardust or naps. While a familiar works, she reads or
                      stirs a little inspiration.
                    </p>
                  </div>
                </div>
                <div className="grimoire-guide-entry">
                  <Sprite name="summon" />
                  <div>
                    <strong>Four basics, always at your fingertips</strong>
                    <p>
                      Understand explains. Check finds gaps. Create drafts.
                      Summon calls a familiar. Select a passage and open Core
                      abilities; without a selection, the current document’s
                      full text is used.
                    </p>
                  </div>
                </div>
                <div className="grimoire-guide-entry">
                  <Sprite name="book" />
                  <div>
                    <strong>Your grimoire, only when you need it</strong>
                    <p>
                      <kbd>Alt / Option + M</kbd> opens this book.{" "}
                      <kbd>Esc</kbd> closes it. Find the guide, familiar tasks,
                      confirmed preferences and settings here.
                    </p>
                  </div>
                </div>
                <div className="grimoire-guide-note">
                  Right-click for spells, or press <kbd>Q</kbd> when not typing.
                  In document text, use Shift + right-click for the browser
                  menu.
                </div>
                <div className="grimoire-guide-details">
                  <strong>About this workspace</strong>
                  <p>
                    Drag a window by its title bar, resize from the
                    bottom-right, and restore it from the Dock. Text and
                    settings are saved only in this browser.
                  </p>
                  <p>
                    The three abilities use local processing by default; you can
                    select Gemini explicitly. Local mode provides source
                    excerpts, limited rule checks, and an event-introduction
                    template. Gemini provides cited summaries, checks, and
                    creative drafts for human review.
                  </p>
                  <p>
                    Results are saved in Run history. All three familiars
                    support one-time Gemini tasks and replies; continuous
                    watching uses local rules.
                  </p>
                </div>
              </div>
            )}
            {tab === "Familiars" && <TaskList />}
            {tab === "About you" && <AboutYou />}
            {tab === "Settings" && (
              <div className="book-page settings">
                <fieldset disabled={resetting} className="book-settings-fields">
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
                  <input type="checkbox" checked={settings.idleAntics}
                    onChange={(e) => update({ idleAntics: e.target.checked })} />{" "}
                  Idle antics
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
                  After the pointer pauses for half a second, the witch begins
                  to float. Small gestures start after about 1.2 seconds with
                  the default rhythm or 0.65 seconds with Lively. Gestures stop
                  while moving and stay still when reduced motion is on.
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
                </fieldset>
                <NotebookActions onResetting={setResetting} />
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
