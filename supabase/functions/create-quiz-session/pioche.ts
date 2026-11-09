// Logique de pioche pondérée : voir "Pioche des questions" dans docs/concept.md.
//
// Une session = une seule question (pas un lot). Priorité : jamais posé > posé il y a
// longtemps > posé récemment (fraîcheur), avec une priorité (pas une exclusivité) pour les
// faits sur une personne centrale. La répartition entre auteurs se fait naturellement dans
// le temps (la fraîcheur d'un fait retombe une fois posé) : pas besoin d'y ajouter une
// pénalité explicite puisqu'une seule question est tirée par pioche.

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

function freshnessWeight(lastPosedAt: string | null, now: Date): number {
  if (!lastPosedAt) return NEVER_POSED_WEIGHT;
  const daysSince = (now.getTime() - new Date(lastPosedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(MIN_FRESHNESS_WEIGHT, Math.min(MAX_FRESHNESS_WEIGHT, daysSince));
}

function weightOf(candidate: FactCandidate, now: Date): number {
  const freshness = freshnessWeight(candidate.lastPosedAt, now);
  const centralBonus = candidate.isCentralSubject ? CENTRAL_SUBJECT_BONUS : 1;
  return freshness * centralBonus;
}

export function pickWeightedFact(candidates: FactCandidate[], now: Date = new Date()): FactCandidate | null {
  if (candidates.length === 0) return null;

  const weighted = candidates.map((candidate) => ({ candidate, weight: weightOf(candidate, now) }));
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.candidate;
  }
  return weighted[weighted.length - 1].candidate;
}
