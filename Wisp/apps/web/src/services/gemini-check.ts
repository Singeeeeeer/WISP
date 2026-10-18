import type { MaterialSnapshot } from "../domain/model";
import type { GeminiCheckRecord } from "../domain/gemini-check";
import { requestGemini, createGeminiSubmission } from "./gemini";
export { requestGemini, createGeminiSubmission } from "./gemini";
export async function requestGeminiCheck(
  snapshot: MaterialSnapshot,
  instruction: string,
  signal?: AbortSignal,
): Promise<GeminiCheckRecord> {
  return (await requestGemini(
    snapshot,
    instruction,
    { operation: "check" },
    signal,
  )) as GeminiCheckRecord;
}
export function createCheckSubmission(
  snapshot: MaterialSnapshot,
  instruction: string,
  save: (r: GeminiCheckRecord) => Promise<GeminiCheckRecord>,
) {
  const submission = createGeminiSubmission(
    snapshot,
    instruction,
    { operation: "check" },
    (r) => save(r as GeminiCheckRecord),
  );
  return {
    hasResult: submission.hasResult,
    run: (signal?: AbortSignal): Promise<GeminiCheckRecord> =>
      submission.run(signal) as Promise<GeminiCheckRecord>,
  };
}
