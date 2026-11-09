export function formatAnswerDisplay(kind: string, value: string | number): string {
  if (kind === "date" && typeof value === "string") {
    const [y, m, d] = value.split("-");
    if (y && m && d) return `${d}/${m}/${y}`;
  }
  return String(value);
}
