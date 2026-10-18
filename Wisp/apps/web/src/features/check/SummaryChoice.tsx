import type { SummaryStyle } from "../../domain/model";
export function SummaryChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: SummaryStyle;
  onChange: (value: SummaryStyle) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field-label">
      本次摘要长度
      <select
        aria-label="本次摘要长度"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SummaryStyle)}
      >
        <option value="standard">标准摘要 · 最多 8 个要点</option>
        <option value="brief">简短摘要 · 最多 3 个要点</option>
      </select>
      <small>仅用于本次 Gemini 理解，不改变本地摘录偏好。</small>
    </label>
  );
}
