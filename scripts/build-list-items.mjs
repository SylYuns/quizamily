#!/usr/bin/env node
// Génère une migration Supabase à partir des fichiers texte des listes de référence.
//
// Usage : node scripts/build-list-items.mjs
//
// Sources : data/listes/<liste>.txt (ex : sports.txt) et, pour une liste découpée en
// catégories, data/listes/<liste>/<catégorie>.txt (ex : personnalites/musique.txt).
// Format : une valeur par ligne ; lignes vides et lignes commençant par # ignorées.
// Un fichier « .ajouts.txt » (ex : films.ajouts.txt, personnalites/musique.ajouts.txt) va dans
// la même liste ou catégorie : il sert aux ajouts à la main dans les listes générées par
// scripts/wikidata-listes.mjs, qui écrase les fichiers principaux.
//
// Le script écrit supabase/migrations/<horodatage>_list_items_data.sql, qui insère toutes les
// valeurs comme valeurs validées (liste globale). Il est idempotent : une valeur déjà
// présente n'est pas réinsérée, donc on peut le relancer après chaque modification des
// fichiers et appliquer la nouvelle migration (npx supabase db push). Retirer une valeur
// d'un fichier ne la supprime pas de la base (à faire à la main si besoin).

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const listsDir = join(root, "data", "listes");
// Doit correspondre à la contrainte de list_items.list_name (migration init_schema).
const KNOWN_LISTS = ["animaux", "sports", "voitures", "metiers", "films", "personnalites"];

// Même normalisation que normalize_answer_text() côté base, pour repérer les doublons.
const normalize = (v) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s\-']/g, "");

function readValues(file) {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

const entries = []; // { list, category, value }
const problems = [];
for (const name of readdirSync(listsDir).sort()) {
  const path = join(listsDir, name);
  if (statSync(path).isDirectory()) {
    if (!KNOWN_LISTS.includes(name)) problems.push(`dossier inconnu : ${name}`);
    for (const file of readdirSync(path).sort()) {
      if (!file.endsWith(".txt")) continue;
      const category = basename(file).split(".")[0]; // musique.ajouts.txt -> musique
      for (const value of readValues(join(path, file))) entries.push({ list: name, category, value });
    }
  } else if (name.endsWith(".txt")) {
    const list = name.split(".")[0]; // films.ajouts.txt -> films
    if (!KNOWN_LISTS.includes(list)) problems.push(`fichier inconnu : ${name}`);
    for (const value of readValues(path)) entries.push({ list, category: null, value });
  }
}

// Doublons (après normalisation) dans une même liste et catégorie : on garde le premier.
const seen = new Map();
const unique = [];
for (const e of entries) {
  const key = `${e.list}|${e.category ?? ""}|${normalize(e.value)}`;
  if (seen.has(key)) {
    problems.push(`doublon ignoré dans ${e.list}${e.category ? "/" + e.category : ""} : « ${e.value} » (déjà « ${seen.get(key)} »)`);
    continue;
  }
  seen.set(key, e.value);
  unique.push(e);
}

const sql = (v) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);
const counts = {};
for (const e of unique) {
  const k = e.category ? `${e.list}/${e.category}` : e.list;
  counts[k] = (counts[k] ?? 0) + 1;
}

// Horodatage : maintenant, mais toujours après la dernière migration existante (la table doit
// déjà avoir ses colonnes category/search_key quand cette migration s'applique).
const migrationsDir = join(root, "supabase", "migrations");
const latest = readdirSync(migrationsDir)
  .map((f) => f.match(/^(\d{14})_/)?.[1])
  .filter(Boolean)
  .sort()
  .pop();
let stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
if (latest && stamp <= latest) stamp = String(BigInt(latest) + 1n);
const out = join(migrationsDir, `${stamp}_list_items_data.sql`);
if (existsSync(out)) throw new Error(`${out} existe déjà`);

const lines = [
  "-- Valeurs des listes de référence, générées par scripts/build-list-items.mjs",
  "-- à partir de data/listes/. Ne pas modifier à la main : modifier les fichiers texte et",
  "-- relancer le script. Idempotent : les valeurs déjà présentes ne sont pas réinsérées.",
  "--",
  ...Object.entries(counts).map(([k, n]) => `-- ${k} : ${n} valeur(s)`),
  "",
  "insert into list_items (list_name, category, value, status, family_id, created_by_person_id)",
  "values",
  unique.map((e) => `  (${sql(e.list)}, ${sql(e.category)}, ${sql(e.value)}, 'approved', null, null)`).join(",\n"),
  "on conflict (list_name, coalesce(category, ''), lower(value)) where status = 'approved' do nothing;",
  "",
];
writeFileSync(out, lines.join("\n"));

console.log(`Migration écrite : ${out.replace(root + "/", "")}`);
for (const [k, n] of Object.entries(counts)) console.log(`  ${k} : ${n}`);
if (problems.length) {
  console.log(`\n${problems.length} remarque(s) :`);
  for (const p of problems) console.log(`  - ${p}`);
}
