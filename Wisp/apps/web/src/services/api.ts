export async function checkHealth(): Promise<string> {
  try {
    const response = await fetch("/api/health", {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    if (data.service !== "wisp" || data.jobs_enabled !== false)
      return "API status does not match the Wisp contract";
    if (data.model_status === "verified")
      return "API online · Gemini has completed a call during this service run";
    if (data.model_status === "configured")
      return "API online · Gemini is configured but not yet verified";
    return data.model_connected === false
      ? "API online · AI is not connected"
      : "API status does not match the Wisp contract";
  } catch {
    return "API offline · local editing is available";
  }
}
