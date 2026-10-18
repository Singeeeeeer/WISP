import type { ExcerptLimit } from "../../domain/model";
export function ExcerptChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: ExcerptLimit;
  onChange: (value: ExcerptLimit) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field-label">
      Excerpt length for this run
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) as ExcerptLimit)}
      >
        <option value={8}>Standard excerpt · up to 8 non-empty lines</option>
        <option value={3}>Brief excerpt · up to 3 non-empty lines</option>
      </select>
      <small>Applies only to this run and does not change your saved preference.</small>
    </label>
  );
}
