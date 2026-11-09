const NUMERIC_KINDS = ["year", "age", "number"];

export type ParsedAnswer = { ok: true; value: string | number } | { ok: false; error: string };

export function parseAnswerValue(kind: string, raw: string): ParsedAnswer {
  const trimmed = raw.trim();
  if (NUMERIC_KINDS.includes(kind)) {
    const n = Number(trimmed);
    if (trimmed === "" || Number.isNaN(n)) return { ok: false, error: "Merci de saisir un nombre valide." };
    return { ok: true, value: n };
  }
  if (trimmed === "") return { ok: false, error: "Merci de renseigner une réponse." };
  return { ok: true, value: trimmed };
}
