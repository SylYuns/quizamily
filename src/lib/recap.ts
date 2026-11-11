// Récapitulatif d'une personne (écran 11, voir docs/ecrans.md) : assemble les phrases `recap`
// des faits révélés d'une personne, groupées par catégorie, pour une mini-biographie rédigée
// plutôt qu'une liste de questions/réponses. Syntaxe de `recap` documentée dans
// docs/question-templates.toml : {forme_homme|forme_femme}, {Sujet}/{sujet} (pronom, remplacé
// par le prénom pour la toute première phrase de la bio), {réponse}, <conjoint>/<pays>.
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/constants/categories";
import { formatAnswerDisplay } from "@/lib/format-answer";

export type RecapFact = {
  category: string;
  recap: string | null;
  relatedRole: string | null;
  answerInputKind: string;
  answer: string | number;
  relatedName: string | null;
  slotValues: Record<string, string> | null;
};

export type RecapCategory = { category: string; label: string; text: string };

function resolveGenderedTokens(text: string, gender: "homme" | "femme" | null): string {
  const isFemme = gender === "femme";
  let result = text.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, (_match, homme: string, femme: string) =>
    isFemme ? femme : homme,
  );
  result = result.replace(/\{Sujet\}/g, isFemme ? "Elle" : "Il");
  result = result.replace(/\{sujet\}/g, isFemme ? "elle" : "il");
  return result;
}

function resolveFactSentence(fact: RecapFact, gender: "homme" | "femme" | null): string | null {
  if (!fact.recap) return null;
  let text = resolveGenderedTokens(fact.recap, gender);
  text = text.replace("{réponse}", String(formatAnswerDisplay(fact.answerInputKind, fact.answer)));
  if (fact.relatedRole) {
    text = text.replace(`<${fact.relatedRole}>`, fact.relatedName ?? "son/sa conjoint·e");
  }
  for (const [slot, value] of Object.entries(fact.slotValues ?? {})) {
    text = text.replace(`<${slot}>`, value);
  }
  return text;
}

// `facts` doit déjà être dans l'ordre du catalogue (catégorie puis position du template) :
// cette fonction ne fait qu'assembler, pas trier.
export function buildRecapByCategory(
  facts: RecapFact[],
  gender: "homme" | "femme" | null,
  firstName: string,
): RecapCategory[] {
  const sentencesByCategory = new Map<string, string[]>();
  for (const fact of facts) {
    const sentence = resolveFactSentence(fact, gender);
    if (!sentence) continue;
    const list = sentencesByCategory.get(fact.category) ?? [];
    list.push(sentence);
    sentencesByCategory.set(fact.category, list);
  }

  let firstSentenceReplaced = false;
  const result: RecapCategory[] = [];
  for (const category of CATEGORY_ORDER) {
    const sentences = sentencesByCategory.get(category);
    if (!sentences || sentences.length === 0) continue;
    const adjusted = sentences.map((sentence) => {
      if (firstSentenceReplaced) return sentence;
      firstSentenceReplaced = true;
      // Les phrases recap commencent par {Sujet}/{sujet} quand elles portent sur la personne
      // elle-même ; on ne remplace que si c'est bien le cas (certaines, ex: le nom de jeune
      // fille de la mère, portent sur quelqu'un d'autre et n'ont pas à être renommées).
      return sentence.replace(/^(Il|Elle)\b/, firstName);
    });
    result.push({ category, label: CATEGORY_LABELS[category] ?? category, text: adjusted.join(" ") });
  }
  return result;
}
