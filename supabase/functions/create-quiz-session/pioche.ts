// Logique de pioche pondérée : voir "Pioche des questions" dans docs/concept.md.
//
// Priorité : jamais posé > posé il y a longtemps > posé récemment (fraîcheur), avec
// répartition entre auteurs différents, et une priorité (pas une exclusivité) pour les
// faits sur une personne centrale.

export const QUESTIONS_PER_SESSION = 8;

export type FactCandidate = {
  id: string;
  authorPersonId: string;
  isCentralSubject: boolean;
  lastPosedAt: string | null; // ISO, null si le fait n'a jamais été posé
};

const NEVER_POSED_WEIGHT = 100;
const MAX_FRESHNESS_WEIGHT = 90; // un fait posé il y a longtemps approche ce plafond, sans jamais dépasser "jamais posé"
const MIN_FRESHNESS_WEIGHT = 1; // un fait posé très récemment reste repiochable, juste très improbable
const CENTRAL_SUBJECT_BONUS = 1.5;
const AUTHOR_REPEAT_PENALTY = 0.3; // multiplicateur appliqué (en cascade) par pioche déjà faite du même auteur, dans ce tirage

function freshnessWeight(lastPosedAt: string | null, now: Date): number {
  if (!lastPosedAt) return NEVER_POSED_WEIGHT;
  const daysSince = (now.getTime() - new Date(lastPosedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(MIN_FRESHNESS_WEIGHT, Math.min(MAX_FRESHNESS_WEIGHT, daysSince));
}

function baseWeight(candidate: FactCandidate, now: Date): number {
  const freshness = freshnessWeight(candidate.lastPosedAt, now);
  const centralBonus = candidate.isCentralSubject ? CENTRAL_SUBJECT_BONUS : 1;
  return freshness * centralBonus;
}

export function pickWeightedFacts(
  candidates: FactCandidate[],
  count: number,
  now: Date = new Date(),
): FactCandidate[] {
  const pool = candidates.map((candidate) => ({ candidate, weight: baseWeight(candidate, now) }));
  const picked: FactCandidate[] = [];
  const authorPickCount = new Map<string, number>();

  while (picked.length < count && pool.length > 0) {
    const weighted = pool.map((entry) => {
      const timesPicked = authorPickCount.get(entry.candidate.authorPersonId) ?? 0;
      const authorPenalty = Math.pow(AUTHOR_REPEAT_PENALTY, timesPicked);
      return { ...entry, effectiveWeight: entry.weight * authorPenalty };
    });

    const totalWeight = weighted.reduce((sum, w) => sum + w.effectiveWeight, 0);
    if (totalWeight <= 0) break;

    let roll = Math.random() * totalWeight;
    let chosenIndex = weighted.length - 1;
    for (let i = 0; i < weighted.length; i++) {
      roll -= weighted[i].effectiveWeight;
      if (roll <= 0) {
        chosenIndex = i;
        break;
      }
    }

    const chosen = weighted[chosenIndex].candidate;
    picked.push(chosen);
    authorPickCount.set(chosen.authorPersonId, (authorPickCount.get(chosen.authorPersonId) ?? 0) + 1);
    pool.splice(
      pool.findIndex((entry) => entry.candidate.id === chosen.id),
      1,
    );
  }

  return picked;
}
