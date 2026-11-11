// Catégories du catalogue de templates (docs/question-templates.toml), dans l'ordre
// d'affichage utilisé partout (formulaire d'ajout, récapitulatif d'une personne).
export const CATEGORY_LABELS: Record<string, string> = {
  "naissance-enfance": "Naissance et enfance",
  jeunesse: "Jeunesse",
  "couple-installation": "Couple et installation",
  "culture-premieres-fois": "Culture et premières fois",
  "retraite-voyages-loisirs": "Retraite, voyages et loisirs",
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
