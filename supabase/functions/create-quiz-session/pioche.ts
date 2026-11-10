// Logique de pioche : voir "Pioche des questions" dans docs/concept.md.
//
// Une session = une seule question (pas un lot).
//
// Règle (décision du 2026-11-10) : la pioche ne repose JAMAIS un fait déjà posé tant qu'il
// reste des faits jamais posés. Parmi les faits jamais posés, tirage pondéré avec une
// priorité (pas une exclusivité) pour les faits sur une personne centrale (×1.5).
// Seulement s'il ne reste plus aucun fait jamais posé, on repioche un fait déjà posé, en
// privilégiant ceux posés il y a le plus longtemps ; le résultat est alors marqué
// `reused`, pour prévenir les joueurs (forme de l'avertissement à définir).
//
// La même règle est appliquée en SQL par create_quiz_session_for_family() pour la tâche
// planifiée (migration 20261110130000_pioche_never_posed_first.sql) : garder les deux
// alignées. Tests : pioche.test.ts (`npm run test:pioche`).

export type FactCandidate = {
  id: string;
  authorPersonId: string;
  isCentralSubject: boolean;
  lastPosedAt: string | null; // ISO, null si le fait n'a jamais été posé
};

export type PickResult = {
  candidate: FactCandidate;
  /** true si le fait avait déjà été posé (plus aucun fait jamais posé disponible). */
  reused: boolean;
};

const CENTRAL_SUBJECT_BONUS = 1.5;
const MAX_FRESHNESS_DAYS = 90; // au-delà, un fait déjà posé n'est pas plus prioritaire
const MIN_FRESHNESS_DAYS = 1; // un fait posé très récemment reste repiochable, juste très improbable

function centralBonus(candidate: FactCandidate): number {
  return candidate.isCentralSubject ? CENTRAL_SUBJECT_BONUS : 1;
}

function freshnessWeight(lastPosedAt: string, now: Date): number {
  const daysSince = (now.getTime() - new Date(lastPosedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(MIN_FRESHNESS_DAYS, Math.min(MAX_FRESHNESS_DAYS, daysSince));
}

function weightedPick<T>(items: T[], weightOf: (item: T) => number, random: () => number): T | null {
  if (items.length === 0) return null;
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;
  let roll = random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

/** Nombre de faits jamais posés parmi les candidats (alerte « réserve bientôt vide » sous 5). */
export function countNeverPosed(candidates: FactCandidate[]): number {
  return candidates.filter((c) => c.lastPosedAt === null).length;
}

export function pickFact(
  candidates: FactCandidate[],
  now: Date = new Date(),
  random: () => number = Math.random,
): PickResult | null {
  const neverPosed = candidates.filter((c) => c.lastPosedAt === null);
  if (neverPosed.length > 0) {
    const candidate = weightedPick(neverPosed, centralBonus, random);
    return candidate ? { candidate, reused: false } : null;
  }
  const alreadyPosed = candidates.filter((c) => c.lastPosedAt !== null);
  const candidate = weightedPick(
    alreadyPosed,
    (c) => freshnessWeight(c.lastPosedAt as string, now) * centralBonus(c),
    random,
  );
  return candidate ? { candidate, reused: true } : null;
}
