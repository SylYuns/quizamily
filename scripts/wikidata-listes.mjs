#!/usr/bin/env node
// Remplit les listes « films » et « personnalites » à partir de Wikidata.
//
// Usage (Node 18 ou plus, connexion internet) :
//   node scripts/wikidata-listes.mjs                 -> tout (films + toutes les catégories)
//   node scripts/wikidata-listes.mjs films musique   -> seulement ce qui est nommé
// puis : node scripts/build-list-items.mjs, et npx supabase db push.
//
// Fichiers écrits (écrasés à chaque lancement) :
//   data/listes/films.txt
//   data/listes/personnalites/<catégorie>.txt
// Pour ajouter des valeurs à la main sans qu'elles soient écrasées, les mettre dans un fichier
// « .ajouts.txt » à côté (ex : data/listes/films.ajouts.txt,
// data/listes/personnalites/musique.ajouts.txt) : build-list-items.mjs les lit aussi.
//
// Popularité : on classe par nombre de sitelinks (nombre de Wikipédias qui ont un article).
// Deux passes par liste : une mondiale (seuil haut) et une française (seuil bas), pour garder
// les films et personnalités connus en France mais peu ailleurs. Les seuils et les quantités
// se règlent dans CONFIG ci-dessous. Si Wikidata renvoie un dépassement de délai, monter
// minLinks de la passe concernée.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const listsDir = join(root, "data", "listes");
const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "Quizamily-listes/1.0 (https://github.com/SylYuns/quizamily)";
const FRANCE = "wd:Q142";

// world : passe mondiale ; france : passe limitée à la France (pays d'origine pour les films,
// nationalité pour les personnes). max = nombre gardé, par ordre de popularité.
const CONFIG = {
  films: {
    types: ["wd:Q11424", "wd:Q24869", "wd:Q202866"], // film, long métrage, film d'animation
    world: { minLinks: 30, max: 1200 },
    france: { minLinks: 8, max: 600 },
  },
  personnalites: {
    musique: {
      // chanteur, musicien, auteur-compositeur-interprète, rappeur, compositeur, chef d'orchestre
      occupations: ["wd:Q177220", "wd:Q639669", "wd:Q488205", "wd:Q2252262", "wd:Q36834", "wd:Q158852"],
      // groupes : groupe de musique, groupe de rock
      groups: ["wd:Q215380", "wd:Q5741069"],
      world: { minLinks: 40, max: 700 },
      france: { minLinks: 8, max: 500 },
    },
    politique: {
      occupations: ["wd:Q82955"], // personnalité politique
      world: { minLinks: 60, max: 300 },
      france: { minLinks: 15, max: 300 },
    },
    sport: {
      occupations: [
        "wd:Q937857", // footballeur
        "wd:Q2309784", // cycliste
        "wd:Q10833314", // joueur de tennis
        "wd:Q378622", // pilote automobile
        "wd:Q3665646", // basketteur
        "wd:Q14089670", // joueur de rugby à XV
        "wd:Q11338576", // boxeur
        "wd:Q4144610", // skieur alpin
        "wd:Q11513337", // athlète
        "wd:Q10843402", // nageur
        "wd:Q6665249", // judoka
        "wd:Q13381863", // escrimeur
        "wd:Q13219587", // patineur artistique
        "wd:Q12840545", // handballeur
      ],
      world: { minLinks: 50, max: 300 },
      france: { minLinks: 10, max: 400 },
    },
    cinema: {
      occupations: ["wd:Q33999", "wd:Q10800557", "wd:Q2526255"], // acteur, acteur de cinéma, réalisateur
      world: { minLinks: 50, max: 500 },
      france: { minLinks: 10, max: 400 },
    },
    television: {
      occupations: ["wd:Q947873", "wd:Q245068", "wd:Q1930187"], // animateur télé, humoriste, journaliste
      world: { minLinks: 40, max: 100 },
      france: { minLinks: 6, max: 300 },
    },
    litterature: {
      occupations: ["wd:Q36180", "wd:Q6625963", "wd:Q49757", "wd:Q1622272"], // écrivain, romancier, poète, auteur de BD
      world: { minLinks: 60, max: 300 },
      france: { minLinks: 15, max: 300 },
    },
    arts: {
      occupations: ["wd:Q1028181", "wd:Q1281618", "wd:Q33231", "wd:Q3501317"], // peintre, sculpteur, photographe, styliste
      world: { minLinks: 60, max: 150 },
      france: { minLinks: 15, max: 150 },
    },
    sciences: {
      occupations: ["wd:Q901", "wd:Q11900058", "wd:Q11631", "wd:Q205375"], // scientifique, explorateur, astronaute, inventeur
      world: { minLinks: 70, max: 150 },
      france: { minLinks: 20, max: 150 },
    },
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) return (await res.json()).results.bindings;
    const text = await res.text();
    const timeout = /TimeoutException|timeout/i.test(text);
    if (timeout) throw new Error(`${label} : délai dépassé côté Wikidata. Monter minLinks dans CONFIG.`);
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || attempt * 10000;
      console.log(`  ${label} : HTTP ${res.status}, nouvel essai dans ${wait / 1000} s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${label} : HTTP ${res.status}\n${text.slice(0, 500)}`);
  }
}

const isRealLabel = (s) => s && !/^Q\d+$/.test(s);

async function fetchFilms(pass, france) {
  const cfg = CONFIG.films;
  const query = `
SELECT ?f ?label (MIN(YEAR(?d)) AS ?year) (MAX(?l) AS ?links) WHERE {
  VALUES ?type { ${cfg.types.join(" ")} }
  ?f wdt:P31 ?type ; wikibase:sitelinks ?l .
  FILTER(?l >= ${pass.minLinks})
  ${france ? `?f wdt:P495 ${FRANCE} .` : ""}
  ?f rdfs:label ?label . FILTER(LANG(?label) = "fr")
  ?f wdt:P577 ?d .
}
GROUP BY ?f ?label
ORDER BY DESC(?links)
LIMIT ${pass.max}`;
  const rows = await sparql(query, `films (${france ? "France" : "monde"})`);
  return rows
    .filter((r) => isRealLabel(r.label?.value) && r.year?.value)
    .map((r) => ({ id: r.f.value, value: `${r.label.value} (${r.year.value})`, links: Number(r.links.value) }));
}

async function fetchPeople(category, pass, france) {
  const cfg = CONFIG.personnalites[category];
  const blocks = [
    `{ VALUES ?occ { ${cfg.occupations.join(" ")} }
       ?p wdt:P31 wd:Q5 ; wdt:P106 ?occ .
       ${france ? `?p wdt:P27 ${FRANCE} .` : ""} }`,
  ];
  if (cfg.groups) {
    blocks.push(`{ VALUES ?grp { ${cfg.groups.join(" ")} }
       ?p wdt:P31 ?grp .
       ${france ? `?p wdt:P495 ${FRANCE} .` : ""} }`);
  }
  const query = `
SELECT ?p ?pLabel ?links WHERE {
  { SELECT DISTINCT ?p ?links WHERE {
      ${blocks.join("\n      UNION\n      ")}
      ?p wikibase:sitelinks ?links .
      FILTER(?links >= ${pass.minLinks})
    }
    ORDER BY DESC(?links)
    LIMIT ${pass.max} }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,mul,en". }
}`;
  const rows = await sparql(query, `${category} (${france ? "France" : "monde"})`);
  return rows
    .filter((r) => isRealLabel(r.pLabel?.value))
    .map((r) => ({ id: r.p.value, value: r.pLabel.value, links: Number(r.links.value) }));
}

// Fusionne les deux passes, sans doublon (même entité ou même libellé).
function merge(...lists) {
  const byId = new Map();
  for (const item of lists.flat()) if (!byId.has(item.id)) byId.set(item.id, item);
  const seen = new Set();
  const out = [];
  for (const item of [...byId.values()].sort((a, b) => b.links - a.links)) {
    const key = item.value.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item.value);
  }
  return out.sort((a, b) => a.localeCompare(b, "fr"));
}

function write(relPath, header, values) {
  const path = join(listsDir, relPath);
  mkdirSync(dirname(path), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# ${header}`,
    `# Généré par scripts/wikidata-listes.mjs le ${date} : ne pas modifier, ce fichier est écrasé.`,
    "# Ajouts à la main : fichier « .ajouts.txt » à côté. Suppressions : relancer le script ou",
    "# régler CONFIG. Puis : node scripts/build-list-items.mjs",
    ...values,
    "",
  ];
  writeFileSync(path, lines.join("\n"));
  console.log(`  -> data/listes/${relPath} : ${values.length} valeurs`);
}

const wanted = process.argv.slice(2);
const want = (name) => wanted.length === 0 || wanted.includes(name);
const unknown = wanted.filter((w) => w !== "films" && !(w in CONFIG.personnalites));
if (unknown.length) {
  console.error(`Inconnu : ${unknown.join(", ")}. Possibles : films, ${Object.keys(CONFIG.personnalites).join(", ")}`);
  process.exit(1);
}

let failed = 0;
if (want("films")) {
  console.log("films…");
  try {
    const world = await fetchFilms(CONFIG.films.world, false);
    await sleep(2000);
    const france = await fetchFilms(CONFIG.films.france, true);
    write("films.txt", "Films (format « Titre (année) »)", merge(world, france));
  } catch (e) {
    failed++;
    console.error(`  ${e.message}`);
  }
}
for (const category of Object.keys(CONFIG.personnalites)) {
  if (!want(category)) continue;
  console.log(`${category}…`);
  try {
    const cfg = CONFIG.personnalites[category];
    await sleep(2000);
    const world = await fetchPeople(category, cfg.world, false);
    await sleep(2000);
    const france = await fetchPeople(category, cfg.france, true);
    write(`personnalites/${category}.txt`, `Personnalités : ${category}`, merge(world, france));
  } catch (e) {
    failed++;
    console.error(`  ${e.message}`);
  }
}
if (failed) {
  console.error(`\n${failed} liste(s) en échec (voir ci-dessus). Les autres fichiers sont écrits.`);
  process.exit(1);
}
console.log("\nTerminé. Étape suivante : node scripts/build-list-items.mjs");
