import { AboutYou } from "../proposals/Proposal";
import { TaskList } from "../delegation/TaskList";

import { useInteraction } from "../../state/stores";
import { Dialog } from "../../shared/Dialog";
export function Grimoire() {
  const tab = useInteraction((s) => s.bookTab);
  const setTab = (bookTab: string) => useInteraction.setState({ bookTab });
  const settings = useInteraction((s) => s.settings);
  const update = useInteraction((s) => s.updateSettings);
  const status = useInteraction((s) => s.settingsStatus);
  return (
    <Dialog
      title="魔法书"
      close={() => useInteraction.setState({ book: false })}
    >
      <div className="eyebrow">THE LITTLE GRIMOIRE</div>
      <div className="panel-heading">
        <h2>一点工作的魔法</h2>
        <button
          aria-label="关闭魔法书"
          onClick={() => useInteraction.setState({ book: false })}
        >
          ×
        </button>
      </div>
      <nav className="book-tabs">
        {["Getting started", "Familiars", "About you", "Settings"].map((x) => (
          <button key={x} aria-pressed={tab === x} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </nav>
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
              onChange={(e) => update({ characterVisible: e.target.checked })}
            />{" "}
            显示小魔女
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => update({ reducedMotion: e.target.checked })}
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
            <input
              type="checkbox"
              checked={settings.helpfulProposals}
              onChange={(e) => update({ helpfulProposals: e.target.checked })}
            />{" "}
            Helpful proposals（本地主动提议）
          </label>
          <p role="status">{status}</p>
        </div>
      )}
    </Dialog>
  );
}
