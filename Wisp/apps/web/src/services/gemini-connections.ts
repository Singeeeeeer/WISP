import {
  validateConnectionRequest,
  validateConnectionResult,
  type ConnectionRequest,
  type ConnectionResult,
} from "../domain/canvas";
import { geminiErrors } from "./gemini";

export async function requestConnection(
  request: ConnectionRequest,
  signal: AbortSignal,
): Promise<ConnectionResult> {
  const frozen = structuredClone(request);
  validateConnectionRequest(frozen);
  let response: Response;
  try {
    response = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(frozen),
      signal: AbortSignal.any([signal, AbortSignal.timeout(195000)]),
    });
  } catch {
    throw new Error(
      signal.aborted
        ? "已停止等待，供应商可能仍在处理并计费。"
        : "请求中断或超时；供应商可能已处理，手动重试可能再次计费。",
    );
  }
  let data: unknown;
  try {
    const raw = await response.text();
    if (raw.length > 2 * 1024 * 1024) throw new Error();
    data = JSON.parse(raw);
  } catch {
    throw new Error("服务返回无效响应，未保存结果。");
  }
  if (!response.ok) {
    const code = (data as { error?: { code?: string } })?.error?.code;
    throw new Error(
      (code && geminiErrors[code]) ||
        "Gemini 请求失败，请检查服务端状态后手动重试。",
    );
  }
  return validateConnectionResult(data, frozen);
}
