import type { MaterialSnapshot } from "../domain/model";
import {
  validateBatch,
  validBatchSnapshots,
  type BatchRecord,
} from "../domain/batch";
import { sameValue, text } from "../domain/gemini-common";
import { geminiErrors, type GeminiOptions } from "./gemini";

export async function requestBatchGemini(
  id: string,
  snapshots: MaterialSnapshot[],
  instruction: string,
  options: GeminiOptions,
  signal?: AbortSignal,
): Promise<BatchRecord> {
  if (
    !["check", "understand", "create"].includes(options.operation) ||
    (options.operation === "understand"
      ? !["brief", "standard"].includes(options.summaryStyle)
      : options.summaryStyle !== undefined)
  )
    throw Error("操作与摘要参数不匹配。");
  if (
    !text(id, 200) ||
    !validBatchSnapshots(snapshots) ||
    typeof instruction !== "string" ||
    instruction.length > 4000
  )
    throw Error(
      "需要 2～12 份独立非空材料，总量最多 60,000 个 UTF-16 单元；补充要求最多 4,000 个。",
    );
  const frozen = structuredClone(snapshots),
    frozenOptions = structuredClone(options);
  let response: Response;
  try {
    response = await fetch("/api/batch/" + frozenOptions.operation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        snapshots: frozen,
        instruction,
        ...(frozenOptions.operation === "understand"
          ? { summaryStyle: frozenOptions.summaryStyle }
          : {}),
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(195000)])
        : AbortSignal.timeout(195000),
    });
  } catch {
    throw Error(
      signal?.aborted
        ? "已停止等待，供应商可能仍在处理并计费。"
        : "请求中断或超时；供应商可能已处理，手动重试可能再次计费。",
    );
  }
  let data: unknown;
  try {
    const raw = await response.text();
    if (raw.length > 2 * 1024 * 1024) throw Error();
    data = JSON.parse(raw);
  } catch {
    throw Error("服务返回无效响应，未保存结果。");
  }
  if (!response.ok) {
    const code = (data as { error?: { code?: string } })?.error?.code;
    throw Error(
      (code && geminiErrors[code]) ||
        "Gemini 请求失败，请检查服务端状态后手动重试。",
    );
  }
  if (signal?.aborted) throw Error("已停止等待，未接受迟到结果。");
  if (
    !validateBatch(data) ||
    data.id !== id ||
    data.operation !== frozenOptions.operation ||
    (data.operation === "understand" &&
      data.summaryStyle !== frozenOptions.summaryStyle) ||
    !sameValue(data.snapshots, frozen) ||
    data.instruction !== instruction
  )
    throw Error("Gemini 多材料结果校验或材料绑定失败，未保存。");
  return data;
}
export function createBatchSubmission(
  id: string,
  snapshots: MaterialSnapshot[],
  instruction: string,
  options: GeminiOptions,
  save: (r: BatchRecord) => Promise<BatchRecord>,
) {
  const frozen = structuredClone(snapshots),
    frozenOptions = structuredClone(options);
  let result: BatchRecord | undefined;
  let pending: Promise<BatchRecord> | undefined;
  return {
    hasResult: () => !!result,
    run(signal?: AbortSignal): Promise<BatchRecord> {
      return (pending ??= (async () => {
        if (signal?.aborted) throw Error("已停止等待。");
        result ??= await requestBatchGemini(
          id,
          frozen,
          instruction,
          frozenOptions,
          signal,
        );
        if (signal?.aborted) throw Error("已停止等待，未保存结果。");
        return save(result);
      })().finally(() => {
        pending = undefined;
      }));
    },
  };
}
