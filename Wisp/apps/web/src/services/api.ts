export async function checkHealth(): Promise<string> {
  try {
    const response = await fetch("/api/health", {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    if (data.service !== "wisp" || data.jobs_enabled !== false)
      return "API 状态不符合 Wisp 契约";
    if (data.model_status === "verified")
      return "API 在线 · Gemini 本次服务运行期间曾调用成功";
    if (data.model_status === "configured")
      return "API 在线 · Gemini 已配置，尚未验证";
    return data.model_connected === false
      ? "API 在线 · AI 未接通"
      : "API 状态不符合 Wisp 契约";
  } catch {
    return "API 未连接 · 本地编辑可用";
  }
}
