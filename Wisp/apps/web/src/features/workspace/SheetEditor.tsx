import { useState } from "react";
import { selectText, type Material } from "../../domain/model";
import { useDocuments, useInteraction } from "../../state/stores";

/** A tab-separated text material, displayed as an editable local demo sheet. */
export function SheetEditor({ material }: { material: Material }) {
  const edit = useDocuments((s) => s.edit);
  const [raw, setRaw] = useState(false);
  const lines = material.text.split("\n");
  const rows = lines.map((line) => line.split("\t"));
  const hasHeader =
    rows[0]?.join("\t") ===
    "Beat\tOwner\tPlayer action\tNarrative effect\tStatus";
  function select(el: HTMLTextAreaElement, start = 0) {
    try {
      useInteraction.setState({
        selection:
          el.selectionStart === el.selectionEnd
            ? undefined
            : selectText(
                material,
                start + el.selectionStart,
                start + el.selectionEnd,
              ),
        selectionError: undefined,
      });
    } catch {
      useInteraction.setState({
        selection: undefined,
        selectionError: {
          materialId: material.id,
          message:
            "Selection is invalid. Select complete text again; it will not expand to the full text automatically.",
        },
      });
    }
  }
  return (
    <div
      className="sheet-editor"
      onPointerDown={(e) => {
        if (e.button === 2 && !e.shiftKey) e.preventDefault();
      }}
    >
      {raw ? (
        <textarea
          className="document-body sheet-source"
          aria-label={material.title + " text"}
          value={material.text}
          spellCheck={false}
          onSelect={(e) => select(e.currentTarget)}
          onChange={(e) => edit(material.id, "text", e.target.value)}
        />
      ) : (
        <div className="sheet-scroll">
          <table className="task-table">
            <thead>
              <tr>
                {(hasHeader
                  ? rows[0]
                  : ["Beat", "Owner", "Player action", "Narrative effect", "Status"]
                ).map((name, i) => (
                  <th key={i}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(hasHeader ? 1 : 0).map((row, i) => {
                const rowIndex = i + (hasHeader ? 1 : 0);
                const rowStart = lines
                  .slice(0, rowIndex)
                  .reduce((length, line) => length + line.length + 1, 0);
                return (
                  <tr key={rowIndex}>
                    {row.map((cell, j) => {
                      const start =
                        rowStart +
                        row
                          .slice(0, j)
                          .reduce(
                            (length, text) => length + text.length + 1,
                            0,
                          );
                      return (
                        <td key={j}>
                          <textarea
                            aria-label={`Row ${i + 1} ${["beat", "owner", "player action", "narrative effect", "status"][j] ?? "column " + (j + 1)}`}
                            data-source-start={start}
                            rows={1}
                            value={cell}
                            spellCheck={false}
                            onSelect={(e) => select(e.currentTarget, start)}
                            onChange={(e) => {
                              const next = rows.map((current) => [...current]);
                              next[rowIndex][j] = e.target.value.replace(
                                /[\r\n\t]/g,
                                " ",
                              );
                              edit(
                                material.id,
                                "text",
                                next
                                  .map((current) => current.join("\t"))
                                  .join("\n"),
                              );
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="sheet-tools">
        <button
          className="table-add"
          onClick={() =>
            edit(
              material.id,
              "text",
              material.text +
                "\nNew beat\tUnassigned\tPlayer action\tNarrative consequence\tNot started",
            )
          }
        >
          ＋ Add a beat
        </button>
        <button
          aria-pressed={raw}
          onClick={() => {
            setRaw(!raw);
            useInteraction.setState({
              selection: undefined,
              selectionError: undefined,
            });
          }}
        >
          {raw ? "Table view" : "Text view"}
        </button>
      </div>
    </div>
  );
}
