# Roadmap

## État actuel (2026-11-18)

Le MVP fonctionne de bout en bout en version simple, testé avec des comptes jetables et avec un deuxième vrai compte. Construit : auth, création/rejoindre une famille (avec « réclamer un profil existant »), ajout de faits (32/32 templates, y compris personne liée `<conjoint>` et élément choisi `<pays>`), « Mes faits » (modifier/supprimer, statut posé/révélé correct), nouvel accueil (écran 4, charte visuelle Fredoka/Nunito, 8 états du bouton quiz), mini arbre familial (lecture + ajout de relations, nouvelle charte, panneau de récapitulatif inline par personne — écrans 10/11), pioche (manuelle + automatique hebdomadaire, jamais repiocher tant qu'il reste du neuf), réponse, validation des réponses libres (anonyme), révélation (manuelle + automatique à la deadline, non-réponses non bloquantes), correction d'un fait avec recalcul rétroactif des scores, accord au féminin/masculin des questions et du récapitulatif (2026-11-18), bonnes réponses illisibles par requête directe (2026-11-10), et archives en version simple — étapes 1 à 6, 8, 9, 11 et 12 (version simple) de la liste ci-dessous. Pas commencé : étapes 7, 10, 13. **Ce qui reste, dans l'ordre : voir « Feuille de route » en bas de page.**

**Depuis le 2026-11-19** : listes de référence préparées (recherche au fil de la frappe, voitures, métiers, sports, animaux ; films et personnalités à générer depuis Wikidata) — **à lancer et envoyer dans Supabase**, voir juste en dessous.

**Pour reprendre le travail (ex. depuis un autre ordinateur)** : voir « À faire sur l'ordinateur avec Supabase » juste en dessous, puis « Points à décider » et « Feuille de route » plus bas sur cette page.

## À faire sur l'ordinateur avec Supabase

**À faire (2026-11-19)** — listes de référence. Préparé depuis un environnement sans Supabase ni accès à Wikidata : les migrations ont été testées sur une copie locale de la base (PostgreSQL avec les droits de Supabase), mais le script Wikidata n'a **jamais été lancé**. Mode d'emploi détaillé (ce que fait chaque commande, ce qu'elle affiche, comment régler les quantités, problèmes possibles) : **[`data/listes/LISEZMOI.md`](../data/listes/LISEZMOI.md)**.

- [ ] **Récupérer les derniers commits** : `git pull`.
- [ ] **Générer films et personnalités depuis Wikidata** : `node scripts/wikidata-listes.mjs` (Node 18 ou plus récent, internet, pas de compte nécessaire, quelques minutes). Écrit `data/listes/films.txt` (« Titre (année) ») et `data/listes/personnalites/<catégorie>.txt` pour les 8 catégories : musique, politique, sport, cinema, television, litterature, arts, sciences. Affiche le nombre de valeurs par fichier.
  - En cas d'erreur : copier le message à Claude (les listes réussies sont quand même écrites).
  - Ouvrir quelques fichiers produits : quantités raisonnables ? noms attendus présents (Johnny Hallyday, Charles de Gaulle, « La Grande Vadrouille (1966) »…) ? valeurs bizarres ?
  - Trop ou pas assez de valeurs : régler `CONFIG` en tête du script (`minLinks` = nombre minimum de Wikipédias qui parlent du film ou de la personne, `max` = nombre gardé), puis relancer seulement la liste concernée (ex : `node scripts/wikidata-listes.mjs musique`).
- [ ] **Transformer les fichiers en migration** : `node scripts/build-list-items.mjs`. Écrit une nouvelle migration `supabase/migrations/<date et heure>_list_items_data.sql` qui contient toutes les listes (y compris animaux, sports, métiers, voitures). Affiche le nombre de valeurs par liste et les doublons ignorés. La migration `20261119093355_list_items_data.sql` déjà présente reste en place : la nouvelle ne réinsère pas ce qui existe.
- [ ] **Envoyer dans Supabase** : `npx supabase db push`. Applique `20261119090000_list_items_search.sql` (colonnes `category` et `search_key` de `list_items`, fonction de recherche `search_list_items`, champ `list_category` des templates réglé à `musique` pour le premier concert), puis les migrations de valeurs. Vérifier ensuite dans Supabase que la table `list_items` contient le nombre de lignes annoncé par l'étape précédente.
- [ ] **Vérifier le code** : `npx tsc --noEmit` et `npx expo lint`. Fichiers modifiés, jamais compilés pour de vrai (pas de `node_modules` dans l'environnement de Claude, seulement une vérification de syntaxe) : `src/components/answer-input.tsx`, `src/lib/list-items.ts`, `src/app/add-fact.tsx`, `src/types/question-template.ts`.
- [ ] **Vérifier à l'écran** :
  - ajout d'un fait « première voiture » : taper « reno » propose « Renault », puis des modèles ; taper « 4l » trouve « Renault 4L » ; une voiture absente (ex : « Renault Nervasport ») est acceptée et réapparaît dans les propositions pour un autre fait de la même famille ;
  - réponse à une question à liste : seules les valeurs de la liste commune sont proposées (pas la valeur ajoutée par l'auteur) ; on peut taper sa réponse en entier, et elle est comptée juste si elle correspond (accents et majuscules ignorés) ;
  - question du premier concert : seuls des artistes de musique sont proposés (pas Charles de Gaulle).

**Fait le 2026-11-18** (revu et exécuté par Claude depuis l'ordinateur relié à Supabase) — accord au féminin dans les questions :

- [x] **Récupérer les derniers commits** : `git pull` (8cd8b63, 8bb1506, 9ae3f4f), avance rapide propre.
- [x] **Appliquer la migration** `20261118100000_gendered_question_texts.sql` : `npx supabase db push`. Met à jour les textes des 19 questions concernées, ajoute `apply_gender_tokens()` et fait passer le genre du sujet à `substitute_question_text()` (utilisée par `get_revealed_question` et `get_archive_summary`). Vérifié présente en base après coup.
- [x] **Vérifié l'app** : `npx tsc --noEmit` propre, `npx expo lint` ne révèle que l'ancienne erreur préexistante et sans rapport (`use-color-scheme.web.ts`), `npm run test:gender` (6/6), `npm run test:layout` (19/19), `npm run test:pioche` (6/6) tous verts.
- [ ] **Pas encore vérifié à l'écran** (pas demandé cette fois), avec une personne centrale femme et une homme : le texte des questions accordé dans le choix d'une question (ajout d'un fait), l'écran de réponse, « Ma question », « Mes faits », la révélation et les archives (ex : « À quel âge Marie a-t-elle appris à nager ? »).

**Fait le 2026-11-11** (revu et exécuté par Claude depuis l'ordinateur relié à Supabase) :

- [x] **Récupérer les derniers commits** : `git pull` (874152d, puis un correctif de lint en c0eaf91 — voir plus bas).
- [x] **Appliquer les migrations en attente** : les 5 migrations du 2026-11-10 sont poussées (`20261110100000` à `20261110140000`).
- [x] **Redéployer l'Edge Function de la pioche** : `create-quiz-session` redéployée avec la règle « jamais posé d'abord ».
- [x] **Tâches planifiées désactivées pendant la phase de test** (décision prise le 2026-11-11) : `auto-create-quiz-sessions` et `auto-reveal-expired-sessions` retirées de `cron.job`. Pour les réactiver, voir les commandes `cron.schedule` dans la migration `20261109240000_automatic_triggering.sql`.
- [x] **Vérifié l'app** : `npx tsc --noEmit` propre, `npx expo lint` a révélé 3 nouvelles erreurs sur `family-tree.tsx` (`react-hooks/refs` sur `pan`/`PanResponder` — faux positif : l'API `Animated` de React Native est conçue pour être lue/mutée hors du rendu React), corrigées avec un commentaire explicatif (commit `c0eaf91`). Seule l'ancienne erreur préexistante et sans rapport (`use-color-scheme.web.ts`) subsiste.
- [x] **Lancé les tests** : `npm run test:layout` (19/19) et `npm run test:pioche` (6/6), tous verts.
- [x] **Vérifié en conditions réelles (comptes jetables, nettoyés ensuite)** :
  - une question en saisie libre avec une réponse en attente de validation ne se révèle pas automatiquement à la deadline (`auto_reveal_expired_sessions` refuse) ; une fois la dernière validation faite après la deadline, `validate_pending_answers` révèle immédiatement (`revealed: true`) ;
  - un joueur qui n'a jamais répondu ne bloque pas la révélation et compte faux ;
  - la lecture directe de `facts.answer_value` est bien rejetée (`permission denied`) même après révélation ; `get_fact_answer`/`get_my_fact_answers` renvoient la bonne valeur au bon moment ;
  - le nouvel écran de l'arbre (`family-tree.tsx`) s'affiche correctement (couple centré, traits à angle droit, compteurs, étoile sur la personne centrale) ; mode Modifier testé : ajout d'un frère/sœur sans parents connus (`sibling_of`), bien positionné sur la ligne de la personne ;
  - **panneau de récapitulatif (écrans 10/11, fait le 2026-11-11)** : toucher une personne ouvre le panneau latéral sans navigation (arbre réduit à ~20 % de l'écran), avec 2 personnes centrales jetables (une femme, un homme, catégories multiples, fait avec `<conjoint>`) ; texte assemblé correct dans les deux genres, regroupé par catégorie dans l'ordre du catalogue, substitution `<conjoint>` correcte ; fermeture du panneau et passage en mode Modifier re-affichent l'arbre plein écran.
- [ ] **Gestes de l'arbre** : glissements gauche/droite/haut/bas avec les crans **testés rapidement à la main sur ordinateur par Sylvain le 2026-11-18, semblent fonctionner** (l'automatisation ne sait pas simuler un vrai glissement). **Reste à tester** : sur téléphone, et avec une grande fratrie (8-9 enfants avec conjoints et enfants).

## Étapes de réalisation

1. Setup Expo + Supabase, schéma DB + RLS.
2. Auth + création famille + désignation des personnes centrales + relations de départ.
3. Invitations (lien) + flux de rejoindre une famille.
4. Catalogue de templates + formulaire d'ajout de fait (champs guidés par type) + « Mes faits ». *(fait — 32/32 templates, y compris la résolution d'une personne liée (`<conjoint>` : détection automatique si déjà connue, sinon choix parmi les personnes existantes ou création à la volée) et le choix d'un élément (`<pays>`), voir migration `20261109250000_linked_person_and_slot_templates.sql` ; section « Mes faits » avec modifier/supprimer et statut posé/révélé correct)*
5. Mini arbre familial (vue simple des personnes + relations). *(fait — `src/app/family-tree.tsx` : une carte par personne centrale avec conjoint·e/parents/frères et sœurs/enfants, liste des autres membres, formulaire pour lier deux personnes (conjoint ou parent-enfant), et création d'une personne manquante à la volée dans ce formulaire (ex : la génération intermédiaire entre une personne centrale et ses petits-enfants, si eux seuls ont un compte) ; reste : vraie capture par paire du lien de parenté du créateur avec chaque personne centrale, voir écran 2 dans `docs/ecrans.md`)*
6. Logique de pioche pondérée (fraîcheur + répartition auteurs) + Edge Function de création de session. *(fait : `supabase/functions/create-quiz-session` pour le déclenchement manuel, plus `auto_create_quiz_sessions()` + tâche `pg_cron` hebdomadaire (lundi 8h) pour le déclenchement automatique — voir étape 9 pour le détail du cron)*
7. Emails (nouvelle session, rappel, résultats).
8. Écran de réponse au quiz + logique du seuil de déclenchement du premier quiz. *(écran de réponse fait en version simple — `src/app/respond.tsx` ; seuil appliqué : la pioche automatique ne se déclenche que pour une famille ayant au moins 3 joueurs, voir « Décisions déjà prises » ; réponses refusées après la deadline ou la révélation, et réponses libres verrouillées une fois validées : fait le 2026-11-10, migration `20261110100000`)*
9. Révélation automatique à la deadline, calcul des scores (4 états) + validation des réponses libres par l'auteur (notifications, révélation différée, prise de main). *(fait en version simple — `src/app/reveal.tsx` + `src/app/validate.tsx` pour le déclenchement manuel par l'auteur, plus `auto_reveal_expired_sessions()` + tâche `pg_cron` horaire pour clôturer automatiquement toute session dont la deadline est dépassée (réponses manquantes comptées fausses ; pas de révélation automatique tant qu'une réponse libre attend sa validation, révélation immédiate à la dernière validation si la deadline est passée — 2026-11-10) — reste : prise de main, notifications/relances ; le score cumulé inter-sessions est traité avec l'Historique, écran 12)*
10. Réactions/commentaires sur les faits révélés.
11. Mécanisme de correction + recalcul rétroactif des scores. *(fait — `propose_correction`/`validate_correction`, voir `docs/ecrans.md` écran 8 ; accessible aussi depuis les archives, qui réutilisent l'écran de révélation pour le détail d'une question au-delà de la dernière révélation)*
12. Archive familiale enrichie (catégories, filtres, recherche) + score de contribution + relances. *(fait en version simple — `src/app/archive.tsx`, choix de la personne centrale puis liste des questions révélées la concernant, détail via `src/app/reveal.tsx` ; depuis le 2026-11-11, les connaissances se consultent par l'arbre et le récapitulatif d'une personne (écrans 10 et 11, regroupement par catégorie fait) ; reste : Historique (écran 12, avec taux de bonnes réponses et scores), recherche, frise chronologique, score de contribution, relances)*
13. Polish, puis phase 2 : push notifications + builds iOS/Android.

## Scope du premier MVP partageable (test avec 2-3 personnes)

Volontairement réduit par rapport à la liste complète ci-dessus :

**Inclus** : auth + création famille + invite, création des personnes centrales (relations simplifiées), un catalogue réduit de ~15-20 templates codés en dur (pas de back-office d'édition), ajout de faits, pioche + session de quiz (version simple au début, pas besoin du roulement pondéré sophistiqué dès le jour 1), réponse, validation des réponses libres par l'auteur (écran de validation + emails de rappel à l'auteur et d'attente aux joueurs ; la prise de main peut attendre), révélation (scores + contexte), emails (nouvelle question + résultats), archives en version simple (liste des questions révélées concernant une personne centrale).

**Reporté après le premier test** : réactions/commentaires, relances de contribution, pièces jointes (photo/audio) sur les faits, notifications push, builds natifs iOS/Android (le web suffit pour tester avec 2-3 personnes). *(mécanisme de correction et vue arbre familial, listés ici à l'origine, sont finalement déjà construits — voir « État actuel » en haut de page.)*

## Estimation de charge (solo, ~1-2 jours/semaine, dev généraliste mais nouveau sur Expo/Supabase)

| Étape | Heures |
|---|---|
| Montée en compétence (petit projet-test Expo + Supabase) | 15-20h |
| Setup réel (projet, schéma, RLS, déploiement) | 4-6h |
| Auth + famille + invite | 8-12h |
| Personnes centrales (simplifié) | 6-10h |
| Catalogue de faits + formulaire guidé | 14-20h |
| Logique de session/pioche (version simple) | 10-14h |
| Flow de réponse | 8-12h |
| Écran de révélation | 8-12h |
| Emails | 8-12h |
| Déploiement web partageable | 2-4h |
| Marge debug/imprévu | 25-35h |
| **Total** | **~110 à 155h, soit ~11 à 16 semaines (3-4 mois)** |

Conseil : commencer par un mini projet jetable (pas le vrai modèle de données) pour apprendre les bases d'Expo + Supabase avant d'attaquer le vrai schéma.

## Validation / audience

Un pilote manuel sans code (Google Form + pioche manuelle + WhatsApp) avait été envisagé pour tester la boucle de jeu avant de coder, mais cette étape a été écartée — on part directement sur la réalisation technique.

Pistes de validation gardées en tête pour plus tard : discuter avec des personnes ayant des parents/grands-parents âgés, sonder des communautés de généalogie, et surtout suivre le **taux de rétention des familles testeuses** (pas juste l'enthousiasme initial) une fois le MVP partageable.

## Points à décider

Décisions de produit ou de sécurité pas encore tranchées — à trancher avant d'avancer sur le sujet concerné, ou à accepter explicitement comme compromis pour l'instant :

- **Emails/notifications** : aucune vraie notification n'existe encore (nouvelle session, rappel, relance de validation, résultats) — le calcul de timing ("24h avant la deadline") existe déjà côté logique (réutilisé pour débloquer la validation anonyme), mais rien n'envoie d'email. Fournisseur : Resend reste actif, en sandbox (pas de domaine vérifié — décision déjà prise de ne pas en acheter un pour l'instant, voir ci-dessous).
- **« Prise de main »** : un joueur reprenant la validation des réponses libres à la place de l'auteur après 7 jours (prévu dans `concept.md`) — pas construit, dépend des notifications ci-dessus.
- ~~**Accord grammatical féminin/masculin**~~ : **fait le 2026-11-18** pour les questions posées aux joueurs (19 des 32 textes accordés, notation `{forme_homme|forme_femme}` commune avec le récapitulatif, module `src/lib/gender.ts` côté app et `apply_gender_tokens()` côté base, rendus identiques vérifiés sur les 32 textes × 3 genres) ; masculin si le genre est inconnu. Migration à appliquer (voir « À faire sur l'ordinateur avec Supabase »). Reste : la 2e personne quand le sujet répond lui-même (« avez-vous… »), souhaitable mais pas prioritaire.
- ~~**Fuite résiduelle, type `list`**~~ : **corrigée le 2026-11-10**. Sur l'écran de réponse, le champ ne propose plus que les valeurs validées de la liste globale, pas celles ajoutées par la famille (dont celle que l'auteur vient d'ajouter en créant le fait) ; le joueur peut toujours taper une valeur. Reste théorique : la liste des valeurs ajoutées par la famille est lisible par une requête directe sur `list_items`, mais sans lien avec un fait.
- ~~**Fuite résiduelle, `facts.answer_value`**~~ : **corrigée le 2026-11-10** (migration `20261110140000_hide_answers_from_direct_reads.sql`). Les colonnes `facts.answer_value`, `answer_history`, `pending_correction` et `quiz_questions.answer_value_snapshot` ne sont plus lisibles par requête directe ; l'appli passe par `get_fact_answer` (auteur, ou tout membre après révélation) et `get_my_fact_answers` (« Mes faits »).
- **Direction visuelle** (coloré/chaleureux, bleu-blanc-rouge — charte dans `docs/design.md`) : **appliquée à l'accueil, à l'arbre et au panneau de récapitulatif** (2026-11-10/11). Reste à l'appliquer aux autres écrans (réponse, validation, révélation, ajout d'un fait, Mes faits, archives, connexion, création de famille), qui gardent un style minimal.
- **Panneau de récapitulatif sur petit écran** : l'arbre est réduit à ~20 % de la largeur quand le panneau est ouvert (valeur choisie au hasard). Sur un téléphone de 390 px, il ne resterait qu'environ 80 px d'arbre, moins d'une carte. À revoir avant de tester sur téléphone : largeur minimale de l'arbre, ou autre présentation sur petit écran (panneau qui monte du bas, plein écran avec retour à l'arbre…).
- **`relationship_label` pas encore un vrai lien par paire** : reste un champ texte simple posé par le créateur de la famille sur sa propre perception (ex: "Grand-mère" = grand-mère du créateur), pas une relation stockée dans `relationships` entre le créateur et chaque personne centrale — contrairement aux liens que l'arbre familial (étape 5) sait maintenant capturer pour tout le monde. Pas bloquant, juste incohérent avec le reste du modèle.
- **Repiocher un fait déjà posé** : autorisé seulement quand il ne reste plus aucun fait jamais posé, en prévenant les joueurs. Forme de l'avertissement à définir (message dans la question, sur l'accueil, par email ?).
- **Resend en mode test (sandbox)** : en mode test, Resend n'envoie qu'à l'adresse du propriétaire du compte. Pour un vrai test avec 2-3 familles, il faudra probablement un domaine vérifié — à rediscuter le moment venu, malgré la décision de ne pas en acheter pour l'instant (voir « Décisions déjà prises »).
- **Validation des ajouts aux listes de référence** : une valeur ajoutée par une famille (`list_items`, statut `pending`) doit passer dans la liste globale après validation par nous (`concept.md`). Aucun moyen de le faire n'existe : back-office, simple requête SQL documentée, ou écran réservé ? **Principe validé le 2026-11-19, à travailler plus tard.** Conséquence en attendant : un joueur qui répond ne voit pas les valeurs ajoutées par sa famille (pour ne pas trahir la réponse), il doit donc taper la réponse en entier quand elle n'est pas dans la liste commune.
- **Monétisation** (piste ouverte le 2026-11-10, rien de décidé) : voir « Monétisation » dans `concept.md`. À trancher après le premier test, en observant ce que les familles utilisent vraiment.

## Décisions déjà prises (pour éviter de les re-discuter)

- Une session de quiz = **une seule question** (pas un lot), avec une semaine pour y répondre (clarifié le 2026-11-09, voir `concept.md`).
- Terminologie retenue : **« personne centrale »** (pas « personne fondatrice », « vedette », etc.).
- Pas de QCM en V1 : les joueurs répondent avec le même champ guidé que l'auteur du fait.
- Seuil du quiz automatique : au moins 3 joueurs dans la famille, sinon la pioche automatique hebdomadaire ne se déclenche pas pour cette famille (`auto_create_quiz_sessions()`, voir migration `20261109240000_automatic_triggering.sql`).
- Déclenchement automatique (2026-11-10) : pioche hebdomadaire (lundi 8h) et révélation à la deadline (vérifiée toutes les heures, réponses manquantes comptées fausses ; **pas de révélation automatique tant qu'il reste une réponse libre à valider** — décision du 2026-11-10, corrigé par la migration `20261110100000_reveal_waits_validation_and_answer_lock.sql`, qui bloque aussi les réponses après la deadline ou la révélation) tournent via `pg_cron`. Pendant la phase de test, ces tâches sont à désactiver (voir « À faire sur l'ordinateur avec Supabase ») et on utilise les boutons manuels (pioche immédiate, révélation par l'auteur). **La révélation manuelle n'existe que pour la phase de test**, et n'est pas bloquée par les joueurs qui n'ont pas répondu (comptés faux). Saisie libre : validations faites avant la deadline → révélation à la deadline ; faites après → révélation immédiate à la dernière validation (`20261110110000_reveal_timing_rules.sql`).
- Pas de choix entre plusieurs conjoints en cas de remariage (2026-11-10) : `<conjoint>` se résout sur la première relation `spouse_of` trouvée pour la personne centrale. Suffisant pour le MVP, à revoir si un cas réel de remariage se présente.
- Arbre familial en lecture + ajout de relations et de personnes, pas de suppression/modification (2026-11-10) : une relation ou une personne ajoutée par erreur se corrige directement en base pour l'instant. Toute personne créée depuis cet écran est non centrale (`is_central = false`, `kind = 'profile'`) - devenir centrale reste un choix fait ailleurs (pas d'UI pour ça aujourd'hui).
- Resend reste l'envoyeur d'email (sandbox, pas de domaine acheté) — ne pas reproposer de le désactiver.
- Catalogue de templates géré par nous, pas par les familles, en V1.
- Pas de maximum technique sur le nombre de personnes centrales (recommandation UI : 1 à 4). Une nouvelle personne centrale peut être ajoutée à tout moment, sans gatekeeper.

## Feuille de route (mise à jour le 2026-11-18)

Ce qui reste à faire, dans un ordre logique. Le détail de chaque point est dans `docs/ecrans.md`, `docs/concept.md` ou plus haut dans cette page.

### Étape 0 — Sur l'ordinateur relié à Supabase

- La checklist du 2026-11-18 en haut de cette page (migration de l'accord au féminin, `tsc`, lint, tests, vérification à l'écran).
- Tests manuels jamais faits :
  - gestes de l'arbre sur téléphone, et avec une grande fratrie (8-9 enfants avec conjoints et enfants) ;
  - questions avec personne liée (`<conjoint>`), élément choisi (`<pays>`), commune ou lieu, en conditions réelles (écran 5) ;
  - bouton « Ajouter » d'une valeur de liste côté réponse : noté « à vérifier/activer » (écran 6).

### Étape 1 — Finir la refonte de la navigation (en cours)

1. **Historique (écran 12)** : questions déjà posées et tableau des scores ; demande le **score cumulé** inter-sessions (agrégation en base, pas encore construite). La tuile « Historique » de l'accueil ne fait rien pour l'instant.
2. **Récapitulatif (écran 11) : toucher une phrase** → détail de la question (réponses de chacun, anecdote, proposer une correction).
3. **Supprimer l'ancien écran Archives** (`src/app/archive.tsx`), une fois les points 1 et 2 faits (il reste le seul accès au détail d'une question ancienne et aux corrections).
4. **Panneau de récapitulatif sur petit écran** : à décider puis faire (voir « Points à décider »).

### Étape 2 — Rendre le jeu jouable par de vraies familles

5. **Constituer les listes de référence** *(préparé le 2026-11-19, reste à lancer et appliquer : voir « À faire sur l'ordinateur avec Supabase »)* : fichiers texte dans `data/listes/` (mode d'emploi : `data/listes/LISEZMOI.md`), transformés en migration par `scripts/build-list-items.mjs`. À la main : animaux (42), sports (97), métiers (325, forme « masculin / féminin », métiers anciens compris), voitures (248 : marques seules + « Marque Modèle »). Depuis Wikidata (`scripts/wikidata-listes.mjs`, à lancer) : films (« Titre (année) ») et personnalités par catégorie (musique, politique, sport, cinema, television, litterature, arts, sciences). Champ de saisie : recherche au fil de la frappe côté serveur (`search_list_items`, insensible aux accents, espaces, tirets, apostrophes), 8 propositions, les plus proches d'abord ; une question peut limiter la recherche à une catégorie (`list_category`, ex : premier concert → musique).
6. **Validation des ajouts des familles vers les listes globales** : rien n'existe (voir « Points à décider »). Principe validé le 2026-11-19, à travailler plus tard.
7. **Appliquer la charte visuelle aux autres écrans** (réponse, validation, révélation, ajout d'un fait, Mes faits, connexion, création de famille ; l'arbre utilise encore les polices système) et remplacer les symboles (★, ✎, ⚠, ‹) par de vraies icônes.

### Étape 3 — Notifications (pour que le jeu tourne sans intervention)

8. **Emails** : nouvelle question ; rappels à l'auteur pour valider (quand tout le monde a répondu ou 24 h avant la deadline, puis 24 h après, puis 6 jours après) ; message aux joueurs 1 h après la deadline si la révélation attend ; résultats ; correction proposée sur un de ses faits.
9. **Ce qui en dépend** : prise de main au bout de 7 jours (`concept.md`) ; passage automatique d'une correction restée sans réponse en note (écran 8) ; avertissement en cas de repioche (forme à décider).
10. **Resend** : mode test limité à l'adresse du propriétaire du compte (voir « Points à décider »).
11. **Réactiver les tâches planifiées** (désactivées pour la phase de test), après avoir revu le jour et l'heure de la pioche (lundi 8 h aujourd'hui, écran 4).

### Étape 4 — Premier test avec des familles

12. Choisir 2-3 familles testeuses et définir ce qui comptera comme un succès (par exemple la rétention au bout de 4 semaines, voir « Validation / audience »).

### Étape 5 — Après le premier test

- Réactions et commentaires sur les faits révélés (étape 10).
- Score de contribution et relances des membres qui n'ont rien ajouté.
- 2e personne quand le sujet répond lui-même (« avez-vous… »).
- Récapitulatif enrichi : frise chronologique, photos et enregistrements audio (`fact_attachments`, déjà prévu dans le modèle).
- Famille et arbre : inviter directement une personne centrale qui a un compte (écran 2), vrai lien de parenté créateur ↔ personnes centrales (`relationship_label`, voir « Points à décider »), remariage, modifier/supprimer une personne ou une relation depuis l'arbre.
- Monétisation, décidée d'après l'usage réel (`concept.md`).
- Phase 2 : notifications push, builds natifs iOS/Android (étape 13).

### Détail de la refonte de la navigation (décidée le 2026-11-10)

Détail dans `docs/ecrans.md` (règles communes, écrans 4, 9 à 12) :
  1. ~~**Corriger la pioche**~~ : **fait le 2026-11-10** (`pioche.ts` + migration `20261110130000_pioche_never_posed_first.sql`, testés).
  2. ~~**Écran d'accueil (écran 4)**~~ : **fait le 2026-11-11** (`src/app/home.tsx` réécrit, polices Fredoka/Nunito ajoutées au projet, voir `docs/ecrans.md` écran 4). Testé avec des comptes jetables sur 5 des 8 états (démarrage, question, répondu, auteur, révélation, pas-de-prochain-quiz) ; « valider » et « entre-deux » couvrent le même code que des états déjà testés (`get_pending_validations`, déjà vérifié ailleurs) mais pas revérifiés à l'écran. Reste : écran 3 (choix de famille) simplifié en menu déroulant plutôt qu'un vrai écran dédié ; tuile « Historique » sans action tant que l'écran 12 n'existe pas ; vraies icônes vectorielles (glyphes en caractères/Views pour l'instant, comme l'arbre).
  3. **Arbre familial (écran 10)** : **maquette validée le 2026-11-10** (règles complètes dans `docs/ecrans.md`, écran 10). Navigation par générations avec crans verticaux et horizontaux, traits à angle droit pour toutes les familles visibles, amorces, mode consultation à l'arrivée et bouton « Modifier » ; nouveaux types de relation « enfant » et « frère / sœur » (`sibling_of`, migration nécessaire). Module de placement **fait** (`src/lib/family-tree-layout.ts`, `npm run test:layout`), **écran réécrit** (`src/app/family-tree.tsx`) et migration `sibling_of` écrite, le 2026-11-10. **Toucher une personne (fait le 2026-11-11)** : plus de navigation vers `/archive`, panneau latéral inline (arbre poussé à ~20 % de l'écran) — voir écran 11.
  4. **Récapitulatif d'une personne (écran 11)** : **fait le 2026-11-11** — phrase `recap` écrite pour les 32 templates (`question-templates.toml`, `sort_order` ajouté), assemblage par catégorie dans `src/lib/recap.ts`, accord au féminin/masculin et substitution pronom→prénom pour la 1ère phrase. Testé avec des comptes jetables (2 personnes centrales, féminin et masculin, catégories multiples, `<conjoint>`), nettoyés ensuite. Reste : l'action « toucher une phrase → détail de la question » (encore seulement via `archive.tsx`).
  5. **Historique (écran 12)** : questions déjà posées + tableau des scores. Demande le **score cumulé** inter-sessions (agrégation en base, pas encore construite).
  6. Supprimer l'écran Archives (`src/app/archive.tsx`) une fois remplacé par les écrans 10 à 12 : **pas encore** — c'est aujourd'hui le seul accès au détail d'une question/proposition de correction au-delà de la dernière révélation (voir écran 9 et 11 dans `ecrans.md`), à reprendre avec l'écran 12.
  7. Propositions de correction : badge sur « Mes faits », email en attendant les notifications push (phase 2).
