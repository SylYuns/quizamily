// Forme de la réponse au choix de l'auteur (décidé le 2026-11-24, voir docs/ecrans.md, écran 5,
// et docs/question-templates.toml). Un type a été choisi — par défaut celui de answer_input_kind,
// mémorisé sur le fait (facts.answer_kind) ou son instantané de pioche
// (quiz_questions.answer_kind_snapshot) — détermine le texte de la question, le récapitulatif et
// le champ de saisie à afficher (src/components/answer-input.tsx, qui se base sur kind).
import type { Template } from "@/types/question-template";

export const FORME_LABELS: Record<string, string> = {
  date: "Date complète",
  year: "Année",
  age: "Âge",
  city: "Commune",
  country: "Pays",
  free_text: "Texte libre",
};

export function formeLabel(kind: string): string {
  return FORME_LABELS[kind] ?? kind;
}

/** Texte, récapitulatif et type de saisie pour une forme donnée (null = celle par défaut). */
export function resolveFormeText(template: Template, kind: string | null): { text: string; recap: string; inputKind: string } {
  if (!kind || kind === template.answer_input_kind || !template.form_texts) {
    return { text: template.template_text, recap: template.recap ?? "", inputKind: template.answer_input_kind };
  }
  const forme = template.form_texts[kind];
  if (!forme) {
    return { text: template.template_text, recap: template.recap ?? "", inputKind: template.answer_input_kind };
  }
  return { text: forme.text, recap: forme.recap, inputKind: kind };
}

/**
 * Coupe le texte d'une forme juste avant <sujet> : la partie qui précède (« En quelle année »,
 * « À quelle date », « À quel âge »…) est le repère interrogatif propre à la forme choisie —
 * c'est cette partie, et seulement elle, qui est soulignée en pointillés et cliquable dans la
 * tuile ouverte (docs/maquettes/soleil/Fait.dc.html, état "forme" : qPhrase/qAfter). Chaque
 * template du catalogue est rédigé sous la forme "<repère> <sujet> ...", ce qui rend la coupe
 * générique plutôt que propre à chaque template.
 */
export function splitLeadIn(text: string): { leadIn: string; rest: string } {
  const idx = text.indexOf("<sujet>");
  if (idx <= 0) return { leadIn: "", rest: text };
  return { leadIn: text.slice(0, idx).trim(), rest: text.slice(idx) };
}
