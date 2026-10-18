import { runLocal } from "../domain/local-text";
import type { SingleTask } from "../domain/task";
self.onmessage = (event: MessageEvent<SingleTask>) => {
  try {
    const t = event.data;
    self.postMessage({
      result: runLocal(t.operation, t.snapshot, t.instruction, t.excerptLimit),
    });
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "本地处理失败",
    });
  }
};
