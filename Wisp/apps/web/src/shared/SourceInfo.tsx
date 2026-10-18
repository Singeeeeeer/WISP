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
          加入于 {new Date(o.addedAt).toLocaleString()}
          {o.kind === "pasted_text" && o.note
            ? " · 来源备注由用户填写，未核实出处"
            : ""}
        </p>
      )}
      {o?.kind.endsWith("_file") && (
        <p>
          {o.encoding ? `${o.encoding} · ` : "文字提取副本 · "}
          {o.byteSize?.toLocaleString()} bytes · 原文件修改于{" "}
          {o.lastModified === undefined
            ? "未记录"
            : new Date(o.lastModified).toLocaleString()}
          。这是导入副本，不监控或写回磁盘文件。
          {o.kind !== "txt_file" && "图片、版式和交互内容不包含在文字副本中。"}
        </p>
      )}
    </div>
  );
}
