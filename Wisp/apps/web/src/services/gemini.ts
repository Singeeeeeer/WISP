import type { MaterialSnapshot, SummaryStyle } from "../domain/model";
import {
  sameValue,
  validateProcessing,
  type GeminiRecord,
} from "../domain/processing";
export type GeminiOptions =
  | { operation: "check" | "create"; summaryStyle?: never }
  | { operation: "understand"; summaryStyle: SummaryStyle };
export const geminiErrors: Record<string, string> = {
  MODEL_AUTH_FAILED: "Gemini 鉴权失败，请检查服务端配置。",
  MODEL_QUOTA_EXCEEDED: "Gemini 额度或速率受限，请稍后手动重试。",
  MODEL_NOT_FOUND: "配置的 Gemini 模型不可用，请检查型号和权限。",
  MODEL_UNAVAILABLE: "Gemini 服务暂时不可用。",
  MODEL_TIMEOUT: "Gemini 请求超时，供应商可能已处理；重试可能再次计费。",
  MODEL_CONNECTION_CLOSED: "Gemini 网络连接中断；重试可能再次计费。",
  MODEL_NETWORK_ERROR: "Gemini 网络连接中断；重试可能再次计费。",
  MODEL_OUTPUT_INVALID: "Gemini 输出未通过校验，未保存结果。",
  MODEL_NOT_CONFIGURED: "Gemini 尚未配置，请配置本地服务端。",
  NOT_CONFIGURED: "Gemini 尚未配置，请配置本地服务端。",
  INVALID_REQUEST: "材料或补充要求不符合请求契约。",
  REQUEST_IN_PROGRESS: "本次请求仍在处理中，请勿重复提交。",
  REQUEST_CONFLICT: "提交标识已对应不同内容，请重新确认材料。",
};
export async function requestGemini(
  snapshot: MaterialSnapshot,
  instruction: string,
  options: GeminiOptions,
  signal?: AbortSignal,
): Promise<GeminiRecord> {
  if (
    !["check", "understand", "create"].includes(options.operation) ||
    (options.operation === "understand"
      ? !["brief", "standard"].includes(options.summaryStyle)
      : options.summaryStyle !== undefined)
  )
    throw Error("操作与摘要参数不匹配。");
  if (
    !snapshot.text.trim() ||
    snapshot.text.length > 60000 ||
    instruction.length > 4000
  )
    throw Error(
      "材料必须非空且不超过60,000个UTF-16单元，补充要求最多4,000个。",
    );
  let response: Response;
  try {
    response = await fetch("/api/" + options.operation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snapshot,
        instruction,
        ...(options.operation === "understand"
          ? { summaryStyle: options.summaryStyle }
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
      (code && geminiErrors[code]) || "Gemini 请求失败，请检查服务端状态后手动重试。",
    );
  }
  if (
    !validateProcessing(data) ||
    data.execution !== "gemini" ||
    data.operation !== options.operation ||
    (data.operation === "understand" &&
      data.summaryStyle !== options.summaryStyle) ||
    !sameValue(data.snapshot, snapshot) ||
    data.instruction !== instruction
  )
    throw Error("Gemini 结果校验或材料绑定失败，未保存。");
  return data;
}
export function createGeminiSubmission(
  snapshot: MaterialSnapshot,
  instruction: string,
  options: GeminiOptions,
  save: (r: GeminiRecord) => Promise<GeminiRecord>,
) {
  const frozen = structuredClone(snapshot),
    frozenOptions = structuredClone(options);
  let result: GeminiRecord | undefined;
  let pending: Promise<GeminiRecord> | undefined;
  return {
    hasResult: () => !!result,
    run(signal?: AbortSignal): Promise<GeminiRecord> {
      return (pending ??= (async () => {
        result ??= await requestGemini(
          frozen,
          instruction,
          frozenOptions,
          signal,
        );
        return save(result);
      })().finally(() => {
        pending = undefined;
      }));
    },
  };
}
