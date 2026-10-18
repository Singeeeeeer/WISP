import type { Material, MaterialSnapshot } from "../domain/model";
import { sourceDescription } from "../domain/cauldron";
export function SourceInfo({
  value,
}: {
  value: Pick<MaterialSnapshot, "source" | "origin"> | Material;
}) {
  const o = value.origin;
  return (
    <div className="source-info">
      <p>{sourceDescription(value)}</p>
      {o && (
        <p>
          Added {new Date(o.addedAt).toLocaleString("en-US")}
          {(o.kind === "pasted_text" || o.copy?.source === "pasted_text") &&
          o.note
            ? " · Source note supplied by the user; origin not verified"
            : ""}
        </p>
      )}
      {o?.copy && (
        <p>
          Frozen from source range [{o.copy.start}, {o.copy.end}) (UTF-16 units). This copy does not update when the source changes.
        </p>
      )}
      {(o?.kind.endsWith("_file") || o?.fileName) && (
        <p>
          {o.encoding ? `${o.encoding} · ` : "Extracted-text copy · "}
          {o.byteSize?.toLocaleString("en-US")} bytes · Original file modified{" "}
          {o.lastModified === undefined
            ? "Not recorded"
            : new Date(o.lastModified).toLocaleString("en-US")}
          . This is an imported copy; the disk file is not monitored or written back.
          {!o.encoding && " Images, layout, and interactive content are not included in the text copy."}
        </p>
      )}
    </div>
  );
}
