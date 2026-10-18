import { SourceInfo } from "../../shared/SourceInfo";
import { useRef, useState } from "react";
import { snapshot, type MaterialSnapshot } from "../../domain/model";
import { CHECK_LIMIT } from "../../domain/check";
import { useDocuments, useInteraction } from "../../state/stores";
import { finishWatchInvitation } from "../../services/proposal-runtime";
import {
  startWatching,
  stopWatching,
  recoverWatches,
  useWatches,
} from "../../services/watch-runtime";
import { Dialog } from "../../shared/Dialog";
export function WatchPanel({ source }: { source: MaterialSnapshot }) {
  const current = useDocuments((s) => s.materials).find(
    (m) => m.id === source.materialId,
  );
  const ready = useWatches((s) => s.ready);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const close = () => {
    if (!lock.current) {
      finishWatchInvitation();
      useInteraction.setState({ watchDraft: undefined });
    }
  };
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await startWatching(source);
      finishWatchInvitation("completed");
      useInteraction.setState({ watchDraft: undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "关注保存失败，请重试");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title="持续关注确认" close={close}>
      <h2>让 Scout Bat 关注这份文本</h2>
      <p className="notice">
        范围是这份文本的全文，不沿用 Check 的局部选区。确认后以版本{" "}
        {source.materialVersion}{" "}
        为起点，只检查之后已保存的新版本，不立即重复检查。
      </p>
      <section className="scope">
        <strong>{source.title}</strong>
        <SourceInfo value={source} />
        <p>
          来源 ID：{source.materialId} · 全文 UTF-16 范围 [0, {source.end})
        </p>
        <pre>{source.text}</pre>
      </section>
      <p>
        仅在发起关注的本页打开期间运行；其他 Wisp
        标签页可查看或停止。关闭或刷新后会中断，不自动恢复。连续编辑会合并，单次检查完成后再处理较新的已保存版本。可在魔法书
        Familiars 随时停止关注。
      </p>
      <p className="notice">{CHECK_LIMIT}</p>
      {current?.version !== source.materialVersion && (
        <p className="notice">
          材料已变化，请更新范围后确认。
          {current && (
            <button
              disabled={busy}
              onClick={() =>
                useInteraction.setState({ watchDraft: snapshot(current) })
              }
            >
              更新关注全文
            </button>
          )}
        </p>
      )}
      <p>
        关闭 Helpful proposals
        只停止新提议；要撤销此授权，请使用“停止关注”。空白或超限版本会跳过并说明原因，检查失败不会对同版本无限重试。
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="panel-actions">
        <button
          disabled={
            busy || !ready || current?.version !== source.materialVersion
          }
          onClick={() => void confirm()}
        >
          {busy ? "正在保存关注…" : "确认开始关注"}
        </button>
        <button disabled={busy} onClick={close}>
          取消持续关注
        </button>
      </div>
    </Dialog>
  );
}
export function WatchList() {
  const watches = useWatches((s) => s.watches),
    error = useWatches((s) => s.error);
  const materials = useDocuments((s) => s.materials);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function stop(id: string) {
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      await stopWatching(id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "停止失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>持续关注</h3>
      {(error || failure) && (
        <p role="alert">
          {failure || error}
          <button onClick={() => void recoverWatches()}>刷新关注记录</button>
        </p>
      )}
      {!watches.length && <p>尚未授权持续关注。</p>}
      {watches.map((w) => (
        <section className="scope" key={w.id} data-testid="watch-card">
          <strong>Scout Bat · {w.title}</strong>
          <SourceInfo value={w.baseline} />
          <p>
            {w.status === "active"
              ? "关注中"
              : w.status === "stopped"
                ? "已停止"
                : "已中断"}{" "}
            · 全文 · 起点版本 {w.baseline.materialVersion} · 最近处理/跳过版本{" "}
            {w.lastVersion}
          </p>
          <p>{w.notice}</p>
          <small>
            关注 ID：{w.id} · 明确确认于{" "}
            {new Date(w.confirmedAt).toLocaleString()}
          </small>
          <div className="panel-actions">
            {w.status === "active" ? (
              <button disabled={busy} onClick={() => void stop(w.id)}>
                停止关注
              </button>
            ) : (
              <button
                disabled={
                  !materials.some((m) => m.id === w.materialId) ||
                  watches.some(
                    (x) =>
                      x.materialId === w.materialId && x.status === "active",
                  )
                }
                onClick={() => {
                  const m = useDocuments
                    .getState()
                    .materials.find((m) => m.id === w.materialId);
                  if (m)
                    useInteraction.setState({
                      book: false,
                      watchDraft: snapshot(m),
                    });
                }}
              >
                重新确认关注
              </button>
            )}
          </div>
        </section>
      ))}
    </section>
  );
}
