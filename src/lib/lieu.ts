// Préposition de lieu française (décidé le 2026-11-24, voir docs/question-templates.toml,
// {réponse_lieu} et <pays_lieu>) : « à Lyon » pour une commune, « en Italie » / « au Portugal »
// / « aux États-Unis » pour un pays. Table explicite par pays (liste fermée et courte,
// src/constants/countries.ts) plutôt qu'une règle de genre déduite du nom : trop d'exceptions
// en français (Mexique, Cambodge… masculins malgré leur -e final) pour un heuristique fiable.

// Valeur = la phrase complète (préposition + article éventuel + nom), pas seulement un préfixe :
// quelques territoires ont leur propre article (« à La Réunion »).
const COUNTRY_PHRASES: Record<string, string> = {
  France: "en France",
  Allemagne: "en Allemagne",
  Belgique: "en Belgique",
  Suisse: "en Suisse",
  Italie: "en Italie",
  Espagne: "en Espagne",
  Portugal: "au Portugal",
  "Royaume-Uni": "au Royaume-Uni",
  Irlande: "en Irlande",
  "Pays-Bas": "aux Pays-Bas",
  Luxembourg: "au Luxembourg",
  Autriche: "en Autriche",
  Grèce: "en Grèce",
  Pologne: "en Pologne",
  "République tchèque": "en République tchèque",
  Hongrie: "en Hongrie",
  Roumanie: "en Roumanie",
  Bulgarie: "en Bulgarie",
  Croatie: "en Croatie",
  Suède: "en Suède",
  Norvège: "en Norvège",
  Danemark: "au Danemark",
  Finlande: "en Finlande",
  Islande: "en Islande",
  Russie: "en Russie",
  Ukraine: "en Ukraine",
  Turquie: "en Turquie",
  Maroc: "au Maroc",
  Algérie: "en Algérie",
  Tunisie: "en Tunisie",
  Égypte: "en Égypte",
  Sénégal: "au Sénégal",
  "Côte d'Ivoire": "en Côte d'Ivoire",
  Mali: "au Mali",
  Cameroun: "au Cameroun",
  Madagascar: "à Madagascar",
  Liban: "au Liban",
  Israël: "en Israël",
  "États-Unis": "aux États-Unis",
  Canada: "au Canada",
  Mexique: "au Mexique",
  Brésil: "au Brésil",
  Argentine: "en Argentine",
  Chili: "au Chili",
  Pérou: "au Pérou",
  Chine: "en Chine",
  Japon: "au Japon",
  "Corée du Sud": "en Corée du Sud",
  Inde: "en Inde",
  Thaïlande: "en Thaïlande",
  Vietnam: "au Vietnam",
  Indonésie: "en Indonésie",
  Australie: "en Australie",
  "Nouvelle-Zélande": "en Nouvelle-Zélande",
  Maurice: "à Maurice",
  Réunion: "à La Réunion",
  Guadeloupe: "en Guadeloupe",
  Martinique: "en Martinique",
  "Polynésie française": "en Polynésie française",
  "Nouvelle-Calédonie": "en Nouvelle-Calédonie",
};

/** « en Italie », « au Portugal », « aux États-Unis »… Repli « en <pays> » si le pays n'est pas
 * dans la liste fermée (réponse libre tapée telle quelle, voir SearchableDropdown). */
export function lieuPourPays(pays: string): string {
  return COUNTRY_PHRASES[pays] ?? `en ${pays}`;
}

/** « à Lyon ». Simplification assumée : quelques communes ont leur propre article (« au Mans »,
 * « à La Rochelle »), pas pris en compte tant qu'il n'y a pas de liste de référence des
 * communes (étape 6 quater, « point à décider » dans la roadmap). */
export function lieuPourVille(ville: string): string {
  return `à ${ville}`;
}

/** Préposition de lieu selon le type de réponse (country | city | place…). */
export function reponseLieu(kind: string, valeur: string): string {
  return kind === "country" ? lieuPourPays(valeur) : lieuPourVille(valeur);
}
