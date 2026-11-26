#!/usr/bin/env node
// Génère la migration Supabase qui pose les colonnes de la « forme de la réponse » sur
// question_templates et les remplit à partir de docs/question-templates.toml (décidé le
// 2026-11-24, voir docs/data-model.md et docs/roadmap.md, étape 6 quater).
//
// Usage : node scripts/build-question-templates.mjs
//
// Lit uniquement les champs formes / text_neutre / [template.forme.<type>] du catalogue (pas
// un analyseur TOML complet : le format du fichier est simple et régulier, voir son en-tête).
// Écrit supabase/migrations/<horodatage>_question_templates_formes.sql ; à relancer et à
// appliquer (npx supabase db push) si le catalogue change ces champs.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tomlPath = join(root, "docs", "question-templates.toml");

function unquote(raw) {
  return raw.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c));
}

function findField(block, name) {
  const m = new RegExp(`^${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(block);
  return m ? unquote(m[1]) : null;
}

function findArray(block, name) {
  const m = new RegExp(`^${name}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(block);
  if (!m) return null;
  const items = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => unquote(x[1]));
  return items.length > 0 ? items : null;
}

const text = readFileSync(tomlPath, "utf8");
// Un bloc = de [[template]] à la prochaine occurrence de [[template]] ou la fin du fichier ;
// les sous-sections [template.forme.<type>] restent donc incluses dans le bloc du template.
const blocks = text.split(/^\[\[template\]\]\s*$/m).slice(1);

const templates = [];
for (const block of blocks) {
  const id = findField(block, "id");
  const formes = findArray(block, "formes");
  if (!id || !formes) continue;
  const textNeutre = findField(block, "text_neutre");
  if (!textNeutre) throw new Error(`${id} a "formes" mais pas "text_neutre"`);

  const formTexts = {};
  const formeSectionRe = /^\[template\.forme\.(\w+)\]\s*$([\s\S]*?)(?=^\[template\.forme\.|(?![\s\S]))/gm;
  let m;
  while ((m = formeSectionRe.exec(block))) {
    const [, forme, section] = m;
    const formeText = findField(section, "text");
    const formeRecap = findField(section, "recap");
    if (!formeText || !formeRecap) throw new Error(`${id}, forme ${forme} : text/recap manquant`);
    formTexts[forme] = { text: formeText, recap: formeRecap };
  }

  // Chaque forme autre que la première (par défaut, déjà dans template_text/recap) doit avoir
  // son entrée — sinon le catalogue a "formes" sans le [template.forme.<type>] correspondant.
  for (const forme of formes.slice(1)) {
    if (!formTexts[forme]) throw new Error(`${id} : [template.forme.${forme}] manquant`);
  }

  templates.push({ id, formes, textNeutre, formTexts });
}

if (templates.length === 0) throw new Error("aucun template avec \"formes\" trouvé");

function sqlString(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlTextArray(items) {
  return `array[${items.map(sqlString).join(", ")}]`;
}

function sqlJsonb(formTexts) {
  return `${sqlString(JSON.stringify(formTexts))}::jsonb`;
}

const lines = [];
lines.push(
  "-- Forme de la réponse au choix de l'auteur (décidé le 2026-11-24, voir docs/ecrans.md, écran 5,",
  "-- et docs/data-model.md). Colonnes posées une fois, puis remplies pour les 17 templates du",
  "-- catalogue qui ont \"formes\" (docs/question-templates.toml) — générée par",
  "-- scripts/build-question-templates.mjs, à relancer si le catalogue change.",
  "",
  "alter table question_templates add column if not exists answer_forms text[];",
  "alter table question_templates add column if not exists template_text_neutral text;",
  "alter table question_templates add column if not exists form_texts jsonb;",
  "",
  "alter table facts add column if not exists answer_kind text;",
  "-- Modifiable tant que le fait n'est pas posé (comme la réponse) : aucune contrainte de",
  "-- clôture ici, la policy \"the author can edit their not-yet-posed facts\" s'en charge déjà.",
  "",
  "alter table quiz_questions add column if not exists answer_kind_snapshot text;",
  "",
);

for (const t of templates) {
  lines.push(
    `update question_templates set`,
    `  answer_forms = ${sqlTextArray(t.formes)},`,
    `  template_text_neutral = ${sqlString(t.textNeutre)},`,
    `  form_texts = ${sqlJsonb(t.formTexts)}`,
    `where id = ${sqlString(t.id)};`,
    "",
  );
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace("T", "")
  .slice(0, 14);
const outPath = join(root, "supabase", "migrations", `${stamp}_question_templates_formes.sql`);
writeFileSync(outPath, lines.join("\n") + "\n");
console.log(`${templates.length} templates : ${outPath}`);
