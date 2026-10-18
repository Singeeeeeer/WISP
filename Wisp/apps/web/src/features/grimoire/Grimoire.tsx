import { AboutYou } from "../proposals/Proposal";
import { TaskList } from "../delegation/TaskList";

import { useInteraction } from "../../state/stores";
import { Dialog } from "../../shared/Dialog";
import { Sprite } from "../companion/Sprite";
import "./grimoire.css";

const chapters = [
  { name: "Getting started", label: "入门说明", title: "认识你的随行伙伴" },
  { name: "Familiars", label: "使魔与回信", title: "留给使魔的这一页" },
  { name: "About you", label: "关于你的偏好", title: "一点点，了解你" },
  { name: "Settings", label: "随行设置", title: "让魔法合你心意" },
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
      title="魔法书"
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
        aria-label="关闭魔法书"
        onClick={() => useInteraction.setState({ book: false })}
      >
        <span aria-hidden="true">×</span>
        <kbd>Esc</kbd>
      </button>
      <div className="grimoire-spread">
        <div className="grimoire-leaf grimoire-index">
          <header className="grimoire-title">
            <p className="grimoire-caption">The little grimoire</p>
            <h2>一点工作的魔法</h2>
            <p>给思绪一个停靠的地方。</p>
          </header>
          <nav className="grimoire-chapters" aria-label="魔法书章节">
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
              你的文字，你来决定。
              <br />
              每一点魔法，都从确认开始。
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
                <h3>让思绪有一个停靠的地方。</h3>
                <p>
                  在文档中编辑、选择文字，再用底部按钮打开随行魔法环。没有选区时使用当前文档全文。
                </p>
                <p>
                  Understand 理解，Check 核对，Create 构思，Summon
                  委托。三能力默认本地，可显式选择 Gemini。
                  本地支持原文摘录、有限规则核对与活动介绍模板；Gemini
                  支持带依据的摘要、核对与待人工确认的创作草稿。
                  结果保存在“处理记录”。三种使魔均支持一次性 Gemini
                  委托和回信；持续关注保持本地。
                </p>
                <p>
                  <kbd>Q</kbd> 非输入状态打开法阵　<kbd>Alt / Option + M</kbd>{" "}
                  魔法书　<kbd>Esc</kbd> 收起
                </p>
                <p>
                  拖动窗口标题栏；右下角调整大小；底部文档按钮恢复窗口。正文和设置仅保存在当前浏览器。
                </p>
                <p>
                  小魔女和四种法器使用你提供的像素素材。右键桌面空白处或按 Q
                  唤起魔法环；展开时停在原位，收起后继续跟随。正文内保留浏览器右键菜单。
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
                  显示小魔女
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) =>
                      update({ reducedMotion: e.target.checked })
                    }
                  />{" "}
                  减少动态效果
                </label>
                <label>
                  角色大小
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
                  待机节奏
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
                    <option value="default">默认</option>
                    <option value="lively">活泼</option>
                  </select>
                </label>
                <p id="idle-rhythm-help" className="subtle">
                  停留半秒后仍开始轻浮；小动作在默认约 1.2 秒、活泼约 0.65
                  秒后开始。 移动时停止小动作，减少动态时静态展示。
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.helpfulProposals}
                    onChange={(e) =>
                      update({ helpfulProposals: e.target.checked })
                    }
                  />{" "}
                  Helpful proposals（本地主动提议）
                </label>
                <p role="status">{status}</p>
              </div>
            )}
          </div>
          <footer className="grimoire-page-footer">
            <span>Wisp · 小魔女</span>
            <span>
              {String(chapters.indexOf(chapter) + 1).padStart(2, "0")} / 04
            </span>
          </footer>
        </section>
      </div>
    </Dialog>
  );
}
