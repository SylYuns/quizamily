// Substitue <sujet>/<conjoint>/<pays> dans le texte d'un template par leurs valeurs connues,
// après l'accord au féminin/masculin selon le genre du sujet ({il|elle}, voir src/lib/gender.ts).
// Utilisé côté client pour les faits déjà entièrement résolus (related_person_id/slot_values
// toujours renseignés à la création depuis add-fact.tsx) - contrairement à add-fact.tsx qui a
// sa propre version avec un repli pour les valeurs pas encore choisies pendant la création.
import { resolveGenderedTokens, type Gender } from "@/lib/gender";

export function substituteQuestionText(
  templateText: string,
  relatedRole: string | null,
  subjectName: string,
  relatedName: string | null,
  slotValues: Record<string, string> | null,
  subjectGender: Gender = null,
): string {
  let text = resolveGenderedTokens(templateText, subjectGender).replace("<sujet>", subjectName);
  if (relatedRole && relatedName) {
    text = text.replace(`<${relatedRole}>`, relatedName);
  }
  for (const [slot, value] of Object.entries(slotValues ?? {})) {
    text = text.replace(`<${slot}>`, value);
  }
  return text;
}
