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
      Summary length for this run
      <select
        aria-label="Summary length for this run"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SummaryStyle)}
      >
        <option value="standard">Standard summary · up to 8 key points</option>
        <option value="brief">Brief summary · up to 3 key points</option>
      </select>
      <small>Only for this Gemini Understand run; does not change the local excerpt preference.</small>
    </label>
  );
}
