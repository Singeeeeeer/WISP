export function ExecutionChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: "local" | "gemini";
  onChange: (value: "local" | "gemini") => void;
  disabled?: boolean;
}) {
  return (
    <label className="field-label">
      执行方式
      <select
        aria-label="执行方式"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as "local" | "gemini")}
      >
        <option value="local">本地规则 · 不发送到模型</option>
        <option value="gemini">Gemini · 通过本地服务端发送本次材料</option>
      </select>
    </label>
  );
}
