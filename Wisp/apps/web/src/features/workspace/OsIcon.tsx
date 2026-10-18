export function OsIcon({ name }: { name: string }) {
  return (
    <img
      className="os-icon"
      src={`/assets/prototype/os-icons/${name}.svg`}
      alt=""
      aria-hidden="true"
    />
  );
}
