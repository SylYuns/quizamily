// Accord au féminin/masculin des textes du catalogue (questions et phrases de récapitulatif).
//
// Notation, dans `template_text` et `recap` (docs/question-templates.toml) :
// - {forme_homme|forme_femme} : ex. « a-t-{il|elle} appris », « est-{il|elle} {allé|allée} » ;
// - {Sujet} / {sujet} : pronom en début / en cours de phrase (« Il »/« il » ou « Elle »/« elle »),
//   utilisé par les phrases de récapitulatif.
// Genre inconnu : masculin (décision du 2026-11-18).
//
// La même règle est appliquée côté serveur par la fonction SQL apply_gender_tokens()
// (migration 20261118100000_gendered_question_texts.sql), pour les textes de question
// assemblés par get_revealed_question et get_archive_summary : garder les deux alignées.
// Tests : gender.test.ts (`npm run test:gender`).

export type Gender = "homme" | "femme" | null | undefined;

const ALTERNATIVE = /\{([^{}|]+)\|([^{}|]+)\}/g;

export function resolveGenderedTokens(text: string, gender: Gender): string {
  const isFemme = gender === "femme";
  return text
    .replace(ALTERNATIVE, (_match, homme: string, femme: string) => (isFemme ? femme : homme))
    .replace(/\{Sujet\}/g, isFemme ? "Elle" : "Il")
    .replace(/\{sujet\}/g, isFemme ? "elle" : "il");
}
