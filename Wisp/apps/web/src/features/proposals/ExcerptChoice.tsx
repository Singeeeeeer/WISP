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
      本次摘录长度
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) as ExcerptLimit)}
      >
        <option value={8}>标准摘录 · 最多 8 个非空行</option>
        <option value={3}>简短摘录 · 最多 3 个非空行</option>
      </select>
      <small>只影响本次处理，不改写已确认偏好。</small>
    </label>
  );
}
