import { validateLocal, type LocalRecord } from "./local-text";
import { validateGemini, type GeminiCheckRecord } from "./gemini-check";
import { validateGeminiText, type GeminiTextRecord } from "./gemini-text";
import { object } from "./gemini-common";
export type GeminiRecord = GeminiCheckRecord | GeminiTextRecord;
export type ProcessingRecord = LocalRecord | GeminiRecord;
export { sameValue } from "./gemini-common";
export function validateProcessing(r: unknown): r is ProcessingRecord {
  try {
    if (!object(r)) return false;
    return r.execution === "gemini"
      ? r.operation === "check"
        ? validateGemini(r)
        : validateGeminiText(r)
      : validateLocal(r as unknown as LocalRecord);
  } catch {
    return false;
  }
}
