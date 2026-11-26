#!/usr/bin/env node
// Connexion de test à plusieurs comptes, sans aucune modification de l'appli ni porte
// dérobée en production (voir docs/roadmap.md, « Étape 0 »).
//
// Usage :
//   node scripts/test-login.mjs <nom>              crée le compte test-<nom>@quizamily.test
//                                                   s'il n'existe pas, et affiche un lien de
//                                                   connexion (sans envoyer d'e-mail)
//   node scripts/test-login.mjs --list              liste les comptes de test
//   node scripts/test-login.mjs --delete <nom>       supprime un compte de test
//   node scripts/test-login.mjs --liberer <nom>      remet les profils réclamés par ce compte
//                                                     à l'état « profil sans compte »
//   option --url <redirectTo>                        défaut : http://localhost:8081
//
// Un compte de test se reconnaît à son adresse test-<nom>@quizamily.test : le domaine
// .test est réservé (RFC 2606) et ne reçoit jamais d'e-mail.
//
// Clé « service_role » : lue depuis travail/.env.secrets (SUPABASE_SERVICE_ROLE_KEY) et
// l'URL du projet depuis .env (EXPO_PUBLIC_SUPABASE_URL, ou SUPABASE_URL si présent) —
// jamais dans l'appli, jamais dans le dépôt (les deux fichiers sont dans .gitignore). Le
// script refuse de tourner si la clé manque.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(root, "travail", ".env.secrets"));
loadEnvFile(join(root, ".env"));

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Clé manquante : il faut EXPO_PUBLIC_SUPABASE_URL (.env) et SUPABASE_SERVICE_ROLE_KEY (travail/.env.secrets)."
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function emailFor(name) {
  return `test-${name}@quizamily.test`;
}

function nameFor(email) {
  const m = /^test-(.+)@quizamily\.test$/.exec(email);
  return m ? m[1] : null;
}

async function findUserByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

async function listTestUsers() {
  const result = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    result.push(...data.users.filter((u) => nameFor(u.email ?? "")));
    if (data.users.length < 200) return result;
  }
}

async function ensureUser(email) {
  const existing = await findUserByEmail(email);
  if (existing) return { user: existing, created: false };
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return { user: data.user, created: true };
}

// generateLink renvoie un lien qui passe par le serveur de vérification de Supabase avant
// de rediriger vers l'appli ; on suit cette redirection nous-mêmes pour afficher directement
// le lien final (avec le jeton de session), plus fiable à l'usage que de faire ouvrir le
// premier lien par un navigateur.
function followRedirect(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "quizamily-test-login" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(res.headers.location);
        } else {
          reject(new Error(`Pas de redirection, statut ${res.statusCode}`));
        }
        res.resume();
      })
      .on("error", reject);
  });
}

async function magicLinkUrl(email, redirectTo) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error) throw error;
  return followRedirect(data.properties.action_link);
}

function parseArgs(argv) {
  const args = { url: "http://localhost:8081" };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--list") args.list = true;
    else if (a === "--delete") args.delete = argv[++i];
    else if (a === "--liberer") args.liberer = argv[++i];
    else rest.push(a);
  }
  args.name = rest[0];
  return args;
}

async function cmdList() {
  const users = await listTestUsers();
  if (users.length === 0) {
    console.log("Aucun compte de test.");
    return;
  }
  for (const u of users) {
    console.log(`${nameFor(u.email)}\t${u.email}\t${u.id}\tcréé le ${u.created_at}`);
  }
}

async function cmdDelete(name) {
  const email = emailFor(name);
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`Aucun compte de test « ${name} ».`);
    process.exit(1);
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(
      `Suppression refusée pour « ${name} » : ${error.message}\n` +
        "C'est attendu si ce compte a créé une famille, une personne, un fait… : les clés " +
        "étrangères vers auth.users n'ont pas de règle de suppression (voir docs/rgpd.md, " +
        "point 3 bis). Utiliser --liberer pour défaire une réclamation de profil, ou nettoyer " +
        "les données créées par ce compte avant de réessayer."
    );
    process.exit(1);
  }
  console.log(`Compte « ${name} » supprimé.`);
}

async function cmdLiberer(name) {
  const email = emailFor(name);
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`Aucun compte de test « ${name} ».`);
    process.exit(1);
  }
  const { data, error } = await admin
    .from("persons")
    .update({ kind: "profile", user_id: null })
    .eq("user_id", user.id)
    .eq("kind", "player")
    .select("id, display_name, family_id");
  if (error) throw error;
  if (!data || data.length === 0) {
    console.log(`Aucun profil réclamé par « ${name} ».`);
    return;
  }
  for (const p of data) console.log(`Profil libéré : ${p.display_name} (${p.id}, famille ${p.family_id})`);
}

async function cmdLogin(name, redirectTo) {
  const email = emailFor(name);
  const { user, created } = await ensureUser(email);
  const link = await magicLinkUrl(email, redirectTo);
  console.log(JSON.stringify({ name, email, userId: user.id, created, link }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) return cmdList();
  if (args.delete) return cmdDelete(args.delete);
  if (args.liberer) return cmdLiberer(args.liberer);
  if (!args.name) {
    console.error(
      "Usage : node scripts/test-login.mjs <nom> | --list | --delete <nom> | --liberer <nom> [--url <redirectTo>]"
    );
    process.exit(1);
  }
  return cmdLogin(args.name, args.url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
