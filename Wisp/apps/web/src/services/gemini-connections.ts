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
        ? "Waiting stopped. The provider may still be processing the request and may charge for it."
        : "The request was interrupted or timed out. The provider may have processed it; a manual retry may incur another charge.",
    );
  }
  let data: unknown;
  try {
    const raw = await response.text();
    if (raw.length > 2 * 1024 * 1024) throw new Error();
    data = JSON.parse(raw);
  } catch {
    throw new Error("The service returned an invalid response. The result was not saved.");
  }
  if (!response.ok) {
    const code = (data as { error?: { code?: string } })?.error?.code;
    throw new Error(
      (code && geminiErrors[code]) ||
        "Gemini request failed. Check the local service status, then retry manually.",
    );
  }
  return validateConnectionResult(data, frozen);
}
