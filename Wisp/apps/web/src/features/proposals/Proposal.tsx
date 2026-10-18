import { useEffect, useState } from "react";
import { useDocuments, useInteraction } from "../../state/stores";
import { pointer } from "../companion/pointer";
import {
  acceptInvitation,
  acceptWatchInvitation,
  finishWatchInvitation,
  acceptJointInvitation,
  finishJointInvitation,
  dismissInvitation,
  forgetExcerptPreference,
  loadExcerptPreference,
  reconcile,
  saveExcerptPreference,
  useProposals,
} from "../../services/proposal-runtime";
import type { ExcerptLimit } from "../../domain/model";
import "./proposal.css";
export function ProposalHost({ blocked }: { blocked: boolean }) {
  const proposal = useProposals((s) => s.session.proposal);
  const joint = useProposals((s) => s.joint.proposal);
  const watch = useProposals((s) => s.watch.proposal);
  const materials = useDocuments((s) => s.materials);
  const enabled = useProposals((s) => s.enabled);
  const preference = useProposals((s) => s.preference);
  const visible =
    enabled && !preference && !blocked && proposal?.status === "visible";
  useEffect(() => {
    reconcile(blocked, materials);
    const timer = setInterval(() => reconcile(blocked, materials), 1000);
    return () => clearInterval(timer);
  }, [
    blocked,
    enabled,
    preference,
    proposal?.status,
    joint?.status,
    watch?.status,
    materials,
  ]);
  if (visible) return <Invitation key={proposal.id} />;
  if (enabled && !blocked && watch?.status === "visible")
    return <Invitation key={watch.id} watch />;
  return enabled && !blocked && joint?.status === "visible" ? (
    <Invitation key={joint.id} joint />
  ) : null;
}
function Invitation({
  joint = false,
  watch = false,
}: {
  joint?: boolean;
  watch?: boolean;
}) {
  const watched = useProposals((s) => s.watch.proposal);
  const sources = useProposals((s) => s.joint.proposal?.sources);
  const [anchor] = useState(() => ({ x: pointer.x + 40, y: pointer.y + 24 }));
  return (
    <aside
      className="proposal-card"
      aria-label="主动提议"
      style={{
        left: Math.max(12, Math.min(innerWidth - 344, anchor.x)),
        top: Math.max(56, Math.min(innerHeight - 440, anchor.y)),
      }}
    >
      <div className="eyebrow">WISP · 一个小提议</div>
      <p role="status">
        {watch
          ? "这次检查已完成。要让 Scout Bat 在本页打开期间关注这份文本的后续变化吗？"
          : joint
            ? "你在两份文本之间来回切换。要按来源分别整理它们的摘录吗？"
            : "你最近多次使用摘录整理。要把之后的摘录默认设得更简短吗？"}
      </p>
      <small>
        {watch
          ? watched?.title + "。先确认全文范围，尚未开始持续关注。"
          : joint
            ? sources?.map((s) => s.title).join(" ＋ ") +
              "。仅根据本页切换提出，尚未处理材料。"
            : "根据本页开启提议后的 3 次成功整理提出，尚未记住任何偏好。"}
      </small>
      <div className="panel-actions">
        <button
          onClick={() => {
            if (watch) {
              const watchDraft = acceptWatchInvitation(
                useDocuments.getState().materials,
              );
              if (watchDraft)
                useInteraction.setState({
                  watchDraft,
                  menu: false,
                  book: false,
                });
              return;
            }
            if (joint) {
              const jointDraft = acceptJointInvitation(
                useDocuments.getState().materials,
              );
              if (jointDraft)
                useInteraction.setState({
                  jointDraft,
                  menu: false,
                  book: false,
                });
              return;
            }
            if (acceptInvitation())
              useInteraction.setState({
                book: true,
                bookTab: "About you",
                menu: false,
              });
          }}
        >
          {watch ? "查看关注范围" : joint ? "查看两份材料" : "查看设置"}
        </button>
        <button
          onClick={() =>
            watch
              ? finishWatchInvitation()
              : joint
                ? finishJointInvitation()
                : dismissInvitation()
          }
        >
          暂时不用
        </button>
      </div>
    </aside>
  );
}
export function AboutYou() {
  const preference = useProposals((s) => s.preference);
  const proposal = useProposals((s) => s.session.proposal);
  const busy = useProposals((s) => s.busy);
  const error = useProposals((s) => s.error);
  const [value, setValue] = useState<ExcerptLimit>(3);
  useEffect(
    () => () => {
      if (
        useProposals.getState().session.proposal?.status === "accepted" &&
        !useProposals.getState().busy
      )
        dismissInvitation();
    },
    [],
  );
  return (
    <div className="book-page">
      {error && (
        <p role="alert">
          {error}{" "}
          <button disabled={busy} onClick={() => void loadExcerptPreference()}>
            重试读取偏好
          </button>
        </p>
      )}
      {proposal?.status === "accepted" && !preference ? (
        <>
          <h3>确认摘录偏好</h3>
          <p>
            只改变之后 Understand 和 Page Sprite
            的默认摘录行数。保留原文顺序，不生成语义摘要；历史结果不变，每次处理前仍可调整。
          </p>
          <label>
            默认摘录长度{" "}
            <select
              disabled={busy}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) as ExcerptLimit)}
            >
              <option value={3}>简短摘录 · 最多 3 个非空行</option>
              <option value={8}>标准摘录 · 最多 8 个非空行</option>
            </select>
          </label>
          <div className="panel-actions">
            <button
              disabled={busy}
              onClick={() => void saveExcerptPreference(value)}
            >
              {busy ? "正在保存…" : "保存偏好"}
            </button>
            <button disabled={busy} onClick={dismissInvitation}>
              取消偏好确认
            </button>
          </div>
        </>
      ) : preference ? (
        <>
          <h3>你确认过的偏好</h3>
          <p>
            已确认：{preference.excerptLimit === 3 ? "简短" : "标准"}摘录（最多{" "}
            {preference.excerptLimit} 个非空行）
          </p>
          <p>
            来源：你接受主动提议后明确保存 ·{" "}
            {new Date(preference.confirmedAt).toLocaleString()}
          </p>
          <p>
            仅保存在当前浏览器。忘记后，新请求恢复标准摘录，历史结果和已确认任务不变。
          </p>
          <button
            disabled={busy}
            onClick={() => void forgetExcerptPreference()}
          >
            忘记摘录偏好
          </button>
        </>
      ) : (
        <>
          <h3>还没有记录偏好</h3>
          <p>
            只有经过你确认的偏好才会出现在这里。多次使用某项能力不代表你已经同意保存偏好。
          </p>
          {error && (
            <button
              disabled={busy}
              onClick={() => void forgetExcerptPreference()}
            >
              忘记摘录偏好
            </button>
          )}
        </>
      )}
    </div>
  );
}
