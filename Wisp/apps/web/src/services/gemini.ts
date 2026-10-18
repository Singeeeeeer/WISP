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
  MODEL_AUTH_FAILED: "Gemini authentication failed. Check the local service configuration.",
  MODEL_QUOTA_EXCEEDED: "Gemini quota or rate limit reached. Please retry manually later.",
  MODEL_NOT_FOUND: "The configured Gemini model is unavailable. Check the model name and permissions.",
  MODEL_UNAVAILABLE: "Gemini is temporarily unavailable.",
  MODEL_TIMEOUT: "The Gemini request timed out. The provider may have processed it; retrying may incur another charge.",
  MODEL_CONNECTION_CLOSED: "The connection to Gemini was interrupted. Retrying may incur another charge.",
  MODEL_NETWORK_ERROR: "The connection to Gemini was interrupted. Retrying may incur another charge.",
  MODEL_OUTPUT_INVALID: "Gemini output failed validation. The result was not saved.",
  MODEL_NOT_CONFIGURED: "Gemini is not configured. Configure the local service first.",
  NOT_CONFIGURED: "Gemini is not configured. Configure the local service first.",
  INVALID_REQUEST: "The material or additional instructions do not meet the request requirements.",
  REQUEST_IN_PROGRESS: "This request is still being processed. Do not submit it again.",
  REQUEST_CONFLICT: "This submission ID is already associated with different content. Confirm the materials again.",
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
    throw Error("Operation does not match the summary settings.");
  if (
    !snapshot.text.trim() ||
    snapshot.text.length > 60000 ||
    instruction.length > 4000
  )
    throw Error(
      "The material must be non-empty and no longer than 60,000 UTF-16 units. Additional instructions may contain up to 4,000 units.",
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
        ? "Waiting stopped. The provider may still be processing the request and may charge for it."
        : "The request was interrupted or timed out. The provider may have processed it; a manual retry may incur another charge.",
    );
  }
  let data: unknown;
  try {
    const raw = await response.text();
    if (raw.length > 2 * 1024 * 1024) throw Error();
    data = JSON.parse(raw);
  } catch {
    throw Error("The service returned an invalid response. The result was not saved.");
  }
  if (!response.ok) {
    const code = (data as { error?: { code?: string } })?.error?.code;
    throw Error(
      (code && geminiErrors[code]) || "Gemini request failed. Check the local service status, then retry manually.",
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
    throw Error("Gemini result validation or source binding failed. The result was not saved.");
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
