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
      Execution mode
      <select
        aria-label="Execution mode"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as "local" | "gemini")}
      >
        <option value="local">Local rules · not sent to a model</option>
        <option value="gemini">Gemini · send this material through the local service</option>
      </select>
    </label>
  );
}
