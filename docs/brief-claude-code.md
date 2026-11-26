# Brief pour Claude Code — reprise du code après la conception du 24 au 26 novembre 2026

Écrit le 2026-11-26 par Claude (conception), pour Claude Code (code, sur l'ordinateur de Sylvain relié à Supabase).

## 0. Avant de coder : prendre en compte tout le travail, pour optimiser les tests

**Demande explicite de Sylvain** : les tests sont souvent ce qui prend le plus de temps et de calcul. Il faut donc d'abord **lire et comprendre l'ensemble du travail à faire** (sections 1 et 3), puis **planifier les tests une fois pour toutes** avant d'écrire la première ligne :

- **Regrouper les vérifications à l'écran.** Coder plusieurs étapes proches, puis faire **un seul passage de vérification** qui les couvre toutes. Exemple : la forme de la réponse et le calendrier se vérifient dans le même parcours « Ajouter un souvenir → Répondre → Révélation ».
- **Préparer une seule fois les données de test**, puis les réutiliser : une famille de test durable, avec 4 ou 5 comptes créés par le script `test-login` (section 2). Pas de nouvelle famille jetable à chaque étape.
- **Préférer les vérifications automatiques et bon marché** : `npx tsc --noEmit`, `npx expo lint`, et des **tests unitaires sur la logique pure**. Candidats : la normalisation des réponses libres, la préposition des pays, l'accord au féminin, le choix de la forme de la réponse. Garder le navigateur pour ce qui ne peut se vérifier qu'à l'œil.
- **Vérifier côté serveur par des requêtes SQL** plutôt qu'en cliquant, quand c'est possible : règles d'accès, fonctions `security definer`, migrations.
- **Écrire la liste des cas à vérifier avant de coder** (dans la roadmap, sous l'étape), puis les cocher. Ce qui n'a pas pu être vérifié est noté « pas vérifié », comme jusqu'ici.

## 1. À lire en premier

1. `docs/roadmap.md` : le **récapitulatif en haut** (« Conçu du 2026-11-24 au 2026-11-26 ») donne l'ordre des chantiers, et les étapes 6 quater à 6 decies, plus l'étape 0, donnent le détail.
2. `docs/ecrans.md` :
   - « Règles communes » (en-tête avec l'emblème) ;
   - les écrans 1, 2 et 3 (arrivée) et 5 (forme de la réponse) ;
   - l'écran 7 (validation des réponses identiques) ;
   - l'écran 8 (réactions et discussion, « N'ont pas répondu » sans « compté faux ») ;
   - les écrans 12 (Historique) et 12 bis (Bilan du mois) ;
   - « Arriver en cours de route ».
3. `docs/data-model.md` : toutes les lignes marquées **« À AJOUTER »** et les notes de conception datées du 24 au 26 novembre.
4. `docs/design.md` : la charte « Coucher de soleil », l'emblème, l'arrivée, le choix de famille, l'Historique.
5. `docs/question-templates.toml` : l'en-tête (`formes`, `text_neutre`, `slot_options`) et les nouveaux modèles.
6. `docs/rgpd.md` (point 3 bis : suppression du compte) et `docs/deploiement-test.md` : du contexte, pas pour demain.
7. Les maquettes : `docs/maquettes/soleil/*.dc.html`, et `docs/maquettes/LISEZMOI.md` pour savoir quel fichier va avec quel écran. Elles se lisent comme du HTML : styles en ligne, données d'exemple dans le `<script>` en bas. `support.js` est absent, c'est normal. Les valeurs de style (couleurs, tailles, arrondis) sont à reprendre telles quelles.

## 2. Programme de demain (sans nom de domaine)

Sylvain n'aura **pas de nom de domaine** demain : ni Resend ni le déploiement web pour les testeurs ne sont possibles. Le programme est **organisé en lots**, avec **un passage de vérification à l'écran par lot** :

**Lot A : prérequis des tests**
1. **Étape 0 : `scripts/test-login.mjs`**, la connexion de test sans e-mail (spécification dans la roadmap, « Étape 0 »). Créer ensuite la famille de test durable : 4 ou 5 comptes, des personnes centrales, quelques souvenirs.

**Lot B : les écrans déjà codés passent aux nouvelles maquettes** (c'est la priorité de Sylvain : les changements d'écrans)
2. **Étape 6 quinquies : emblème de la famille et nouvel en-tête sur tous les écrans d'une famille** : accueil (titre = nom de la famille), arbre (emblème à droite de « Modifier »), ajouter un souvenir, répondre, révélation, valider, mes faits, archives tant qu'elles existent. Viennent avec :
   - le menu de la famille ;
   - le choix de l'emblème à la création (étape 1 de `FamilleEmbleme.dc.html`) ;
   - les symboles recolorables (vache, lézard, chien dans `Logo.dc.html`) ;
   - les colonnes de `families`, avec la modification réservée au créateur.

   Maquettes : `AccueilEmbleme`, `AccueilMenu`, `Fait`, `Revelation`, `FamilleEmbleme`, `Embleme`, `Logo`. Le bandeau partagé `src/components/family-header.tsx` est le point de départ.
3. **Retouches rapides sur les écrans existants** :
   - révélation : « N'ont pas répondu » **sans « compté faux »** ;
   - alerte de réserve sur l'accueil : « Plus que 3 questions en réserve. Et si tu passais voir Mamie ? » ;
   - accueil : le **bouton « Bilan du mois »** pleine largeur sous « Ajouter un souvenir ». Il peut mener provisoirement à une page vide si le bilan n'est pas encore codé, ou attendre le lot suivant : au choix, en le disant.

**Lot C : forme de la réponse**
4. **Réparer le calendrier** (type `date`), signalé comme ne fonctionnant pas.
5. **Étape 6 quater : forme de la réponse** au choix de l'auteur : catalogue, migration, choix dans la tuile, `submit_answer`, préposition des pays, liste des communes. Maquettes `FaitForme*`.
6. **Étape 6 decies : décisions de validation appliquées aux réponses identiques.** C'est petit et côté serveur. Vérifier d'abord la normalisation actuelle (`20261109200000_validate_free_text_answers.sql`).

**S'il reste du temps** : commencer l'**étape 6 sexies, parcours d'arrivée**, par la connexion (`ConnexionB.dc.html`) et son intro animée (`ConnexionIntro.dc.html`, chronologie dans `ecrans.md`, écran 1).

Les autres écrans redessinés suivent dans les jours d'après (section 3) :
- le reste de l'arrivée : rejoindre, créer, choix de famille ;
- le Bilan du mois et l'Historique ;
- les réactions et la discussion ;
- le rattrapage.

## 3. Ensuite, dans l'ordre (voir le récapitulatif de la roadmap)

6 sexies : parcours d'arrivée (connexion avec l'intro animée, rejoindre, créer, choix de famille) → Bilan du mois et Historique (`revealed_at`, tables d'archive) → 6 septies : réactions et discussion → 6 octies : nouvelles questions du catalogue → 6 undecies : arrivée des membres (lien qui expire en 48 h, réglages de l'admin « Qui peut inviter ? » et « Question d'entrée », alerte, retrait et blocage ; **pas de validation par l'admin**) → 6 nonies : arriver en cours de route.

Avant d'ouvrir l'appli au-delà des testeurs : sécurité et RGPD (`rgpd.md`), y compris **la suppression du compte à deux niveaux** et **les clés étrangères vers `auth.users` sans règle de suppression**.

## 4. Pièges connus

- Le **calendrier** (type `date`) ne fonctionne pas.
- **Les éléments choisis** n'existent dans le code que pour `<pays>` : `slot_options` (diplômes) demande de généraliser le mécanisme.
- **Normalisation des réponses libres** : une seule fonction, partagée entre la validation automatique, le regroupement à valider, l'application aux réponses identiques et les rattrapages. Elle ignore les majuscules, les accents, les espaces, la ponctuation et les articles en tête, mais **pas les fautes de frappe**.
- **Les clés étrangères vers `auth.users`** n'ont pas de règle de suppression : le `--delete` du script de test échouera sur un compte qui a créé quelque chose. C'est attendu, il faut l'expliquer.
- **La famille active** est explicite dans chaque lien (`src/lib/my-family.ts`) : ne pas réintroduire de requête qui devine la famille.
- Le texte des alertes de réserve devient « Plus que 3 questions en réserve. Et si tu passais voir Mamie ? ». Aucune mention de score dans les textes du rattrapage.

## 5. Règles de travail

- **Une étape = un commit** (ou quelques-uns), avec les lignes d'attribution habituelles.
- **Mettre à jour la doc à chaque étape** :
  - la roadmap (état, date, ce qui a été vérifié et ce qui ne l'a pas été) ;
  - `ecrans.md` et `data-model.md` si le code s'écarte de la spécification, en le signalant.
- **Ne pas trancher seul une question de conception** : la noter dans « Points à décider » et la poser à Sylvain.
- **La clé `service_role`** reste dans le `.env` local : jamais dans l'appli, jamais dans le dépôt.

## 6. Message à coller à Claude Code pour démarrer

> Bonjour ! Mets-toi à jour du GitHub, puis lis `docs/brief-claude-code.md` en entier et les documents qu'il cite. Avant d'écrire du code, fais-moi un plan pour la journée : les étapes, les migrations, et surtout **comment tu vas regrouper et optimiser les tests** (données de test communes, vérifications automatiques, un seul passage à l'écran par groupe d'étapes). Attends mon accord avant de commencer.
