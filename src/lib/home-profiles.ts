// Choix des profils affichés sur la tuile « Consulter les connaissances » de l'accueil
// (docs/ecrans.md, écran 4, décision du 2026-11-19/20).
//
// Règle : jusqu'à `count` personnes (4 par défaut), tirées au hasard ; en priorité celles qui
// ont au moins un souvenir révélé, avec un poids ×1,5 pour les personnes centrales (comme la
// pioche). S'il y en a moins que `count`, on complète avec les autres personnes, avec la même
// pondération. Une petite famille affiche donc 1, 2 ou 3 profils.
//
// Module pur (pas de React ni de Supabase) : testé par src/lib/home-profiles.test.ts.

export type ProfileCandidate = {
  id: string;
  firstName: string;
  isCentral: boolean;
  revealedCount: number;
};

export const CENTRAL_PROFILE_WEIGHT = 1.5;

// Tirage pondéré sans remise. `random` renvoie un nombre dans [0, 1) (Math.random par défaut,
// remplaçable pour les tests).
function weightedSample<T>(items: T[], weight: (item: T) => number, n: number, random: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < n && pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + weight(item), 0);
    let r = random() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= weight(pool[i]);
      if (r < 0) {
        index = i;
        break;
      }
    }
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

export function pickHomeProfiles(
  candidates: ProfileCandidate[],
  count = 4,
  random: () => number = Math.random,
): ProfileCandidate[] {
  const weight = (c: ProfileCandidate) => (c.isCentral ? CENTRAL_PROFILE_WEIGHT : 1);
  const withMemories = candidates.filter((c) => c.revealedCount > 0);
  const others = candidates.filter((c) => c.revealedCount === 0);
  const first = weightedSample(withMemories, weight, count, random);
  const rest = weightedSample(others, weight, count - first.length, random);
  return [...first, ...rest];
}
