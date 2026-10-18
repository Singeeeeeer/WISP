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
    throw Error("Operation does not match the summary settings.");
  if (
    !text(id, 200) ||
    !validBatchSnapshots(snapshots) ||
    typeof instruction !== "string" ||
    instruction.length > 4000
  )
    throw Error(
      "Choose 2–12 distinct, non-empty materials totaling no more than 60,000 UTF-16 units. Additional instructions may contain up to 4,000 units.",
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
      (code && geminiErrors[code]) ||
        "Gemini request failed. Check the local service status, then retry manually.",
    );
  }
  if (signal?.aborted) throw Error("Waiting stopped. A late result was not accepted.");
  if (
    !validateBatch(data) ||
    data.id !== id ||
    data.operation !== frozenOptions.operation ||
    (data.operation === "understand" &&
      data.summaryStyle !== frozenOptions.summaryStyle) ||
    !sameValue(data.snapshots, frozen) ||
    data.instruction !== instruction
  )
    throw Error("Gemini multi-material result validation or source binding failed. The result was not saved.");
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
        if (signal?.aborted) throw Error("Waiting stopped.");
        result ??= await requestBatchGemini(
          id,
          frozen,
          instruction,
          frozenOptions,
          signal,
        );
        if (signal?.aborted) throw Error("Waiting stopped. The result was not saved.");
        return save(result);
      })().finally(() => {
        pending = undefined;
      }));
    },
  };
}
