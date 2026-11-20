// Répartition des questions du catalogue pour l'écran « Ajouter un souvenir » (écran 5, voir
// docs/ecrans.md), par thème : à renseigner / mes questions modifiables / déjà renseignées.
//
// Module pur (zéro import à l'exécution, comme family-tree-layout.ts/home-profiles.ts), testé
// par add-fact-catalog.test.ts (npm run test:add-fact-catalog, exécuté directement par Node,
// sans l'alias @/ configuré pour Metro/tsc). L'ordre des catégories est fourni par l'appelant
// (CATEGORY_ORDER, voir src/constants/categories.ts) plutôt qu'importé ici, pour éviter un
// import relatif que Node ne saurait pas résoudre. `Template` est un import de type seul, effacé
// à l'exécution : il ne pose pas ce problème.
import type { Template } from "../types/question-template";

export type FactStatus = "not_posed" | "open" | "revealed";

export type SubjectFact = {
  id: string;
  template_id: string;
  author_person_id: string;
  related_person_id: string | null;
  slot_values: Record<string, string> | null;
  status: FactStatus;
};

// Générique sur le type de fait (F) : l'appelant peut passer un type plus riche que SubjectFact
// (ex : avec context_text) et le retrouve intact dans mine/others, sans perte de typage.
export type CategoryBucket<F extends SubjectFact = SubjectFact> = {
  category: string;
  /** Templates pas encore épuisés pour ce sujet : à proposer. */
  available: Template[];
  /** Mes faits pas encore posés : modifiables. */
  mine: F[];
  /** Faits créés par d'autres, ou déjà posés/révélés : affichage seul. */
  others: F[];
  /** Plus aucune question disponible dans ce thème pour ce sujet. */
  isComplete: boolean;
};

export type AddFactCatalog<F extends SubjectFact = SubjectFact> = {
  /** Souvenirs connus (révélés) et en réserve (créés, pas encore posés, par n'importe qui). */
  counts: { revealed: number; reserve: number };
  /** Thèmes à afficher, dans l'ordre (thèmes complets en fin de liste). */
  categories: CategoryBucket<F>[];
};

export function matchesCondition(
  condition: string | null,
  subject: { gender: "homme" | "femme" | null; is_deceased: boolean },
  hasSibling: boolean,
): boolean {
  if (!condition) return true;
  if (condition === "femme") return subject.gender === "femme";
  if (condition === "homme") return subject.gender === "homme";
  if (condition === "vivant") return !subject.is_deceased;
  if (condition === "a des frères ou sœurs") return hasSibling;
  return true;
}

// Une question à slot (<pays>) ou à personne liée (<conjoint>) peut être recréée pour une autre
// valeur/personne (voyage par pays, remariage) : elle reste toujours proposée (décision du
// 2026-11-20, voir ecrans.md écran 5). Une question simple disparaît dès qu'un fait existe.
function isRepeatable(t: Template): boolean {
  return (t.slots?.length ?? 0) > 0 || !!t.related_role;
}

export function buildAddFactCatalog<F extends SubjectFact>(params: {
  templates: Template[];
  facts: F[];
  subject: { gender: "homme" | "femme" | null; is_deceased: boolean };
  hasSibling: boolean;
  myPersonId: string;
  /** categoryOrder (src/constants/categories.ts), fourni par l'appelant. */
  categoryOrder: readonly string[];
}): AddFactCatalog<F> {
  const { templates, facts, subject, hasSibling, myPersonId, categoryOrder } = params;

  const revealed = facts.filter((f) => f.status === "revealed").length;
  const reserve = facts.filter((f) => f.status === "not_posed").length;

  const factsByTemplate = new Map<string, F[]>();
  for (const f of facts) {
    const list = factsByTemplate.get(f.template_id) ?? [];
    list.push(f);
    factsByTemplate.set(f.template_id, list);
  }

  const eligible = templates.filter((t) => matchesCondition(t.condition, subject, hasSibling));

  const buckets = new Map<string, CategoryBucket<F>>();
  for (const category of categoryOrder) {
    buckets.set(category, { category, available: [], mine: [], others: [], isComplete: false });
  }

  for (const t of eligible) {
    const bucket = buckets.get(t.category);
    if (!bucket) continue;
    const existing = factsByTemplate.get(t.id) ?? [];
    if (isRepeatable(t) || existing.length === 0) {
      bucket.available.push(t);
    }
    for (const f of existing) {
      if (f.author_person_id === myPersonId && f.status === "not_posed") bucket.mine.push(f);
      else bucket.others.push(f);
    }
  }

  const hasAnyEligible = new Set(eligible.map((t) => t.category));
  const nonEmpty = categoryOrder.map((c) => buckets.get(c)!).filter((b) => hasAnyEligible.has(b.category));
  for (const b of nonEmpty) b.isComplete = b.available.length === 0;

  const ordered = [...nonEmpty.filter((b) => !b.isComplete), ...nonEmpty.filter((b) => b.isComplete)];

  return { counts: { revealed, reserve }, categories: ordered };
}
