# Écrans du MVP

Description fonctionnelle : ce que chaque écran affiche et ce qu'on peut y faire. La charte visuelle (couleurs, polices, styles de boutons) et le lien vers les maquettes sont dans `design.md`. L'interface reste volontairement simple, elle sera enrichie au fur et à mesure.

Les points marqués **À décider** sont des questions ouvertes.

## Règles communes

- **Bandeau collé en haut de l'écran**, dans tous les écrans liés à une famille :
  - le **nom de la famille active**, sous forme de bouton : il ouvre le choix de famille (écran 3) si le joueur en a plusieurs, ou propose « Créer une autre famille » s'il n'en a qu'une ;
  - à côté, un **petit bouton « Inviter »** qui donne le lien à partager pour rejoindre la famille (copie ou partage) ;
  - dans un coin, un **menu burger** : déconnexion, « Créer une session maintenant » (outil de test), et plus tard profil et réglages des notifications.
- Un joueur peut appartenir à plusieurs familles (famille recomposée, belle-famille…). Il a une fiche par famille, avec un lien de parenté propre à chacune.
- **« Famille active » : bug critique corrigé le 2026-11-20, complété le 2026-11-23.** Chaque écran liée à une famille devait deviner la sienne (`persons.user_id` n'est pas unique : une ligne par famille) via une requête `.limit(1).maybeSingle()` sans tri — l'ordre renvoyé par Postgres sans `ORDER BY` n'est pas garanti, et rien ne reliait ce choix à la famille affichée ailleurs. Un joueur avec 2 familles pouvait cliquer depuis l'accueil de la famille A et atterrir sur les données de la famille B. Résolu par `src/lib/my-family.ts` : la famille active est explicite dans chaque lien de navigation (paramètre `?family=`) et mémorisée sur l'appareil (clé par compte) dès qu'elle est choisie ou déduite, pour que tous les écrans restent cohérents entre eux — y compris après création d'une famille supplémentaire ou jonction par invitation (`family-setup.tsx`, `join/[token].tsx`, corrigés le 2026-11-23 après une relecture complète de tous les liens et requêtes). **Jamais un risque de fuite entre comptes différents** : les fonctions serveur (`is_family_member()`, migration `20261106130000_rls_policies.sql`) vérifient toujours l'appartenance réelle à la famille, indépendamment de ce que devinait le client — voir `roadmap.md` pour le détail de la vérification.
- Les emails indiquent toujours la famille concernée dans l'objet (ex : « [Famille Chardaire] Nouvelle question »).
- **Champ de réponse guidé (`AnswerInput`, `src/components/answer-input.tsx`)**, partagé par Ajouter un souvenir, Répondre, Mes faits et les corrections sur la Révélation : une **liste déroulante saisissable** (`src/components/searchable-dropdown.tsx`, 8 lignes visibles avant de défiler) pour l'année (1800-2800, positionnée sur 2000 à l'ouverture si le champ est vide), l'âge (0-125), le pays, et les types liste (métiers, films… — recherche serveur `search_list_items`, suggestions affichées dès le focus, pas seulement après la première lettre). Taper une valeur filtre la liste ; une valeur absente reste saisissable telle quelle (comparée ailleurs après normalisation, ou ajoutée pour la famille pour un type liste). **Décidé et codé le 2026-11-23**, à la demande de l'utilisateur (remplace le champ texte brut pour année/âge, et les chips pour pays) ; demande aussi que `search_list_items` accepte une requête vide (migration `20261123150000_search_list_items_empty_query.sql`). Le même composant remplace aussi, dans `src/app/add-fact.tsx`, les chips de choix du pays pour les questions à élément choisi (ex. « voyage en `<pays>` ») — oublié au premier passage (signalé par l'utilisateur), et 5 lignes visibles (220 px) jugées trop peu, passées à 8.

## Parcours

```
Connexion
→ Accueil - choix de famille (seulement si le joueur a au moins 2 familles)
→ Accueil - famille
   → Participer au quiz : Répondre / Ma question / Valider des réponses / Voir la révélation
   → Consulter les connaissances : Arbre → Récapitulatif d'une personne
   → Ajouter un souvenir / Historique / Mes faits
```


## 1. Connexion

But : se connecter sans mot de passe.

Affiche :
- un champ email
- le message « Un lien de connexion vous a été envoyé » après envoi

Actions :
- Recevoir le lien → clic dans l'email → Accueil - famille (dernière famille consultée), ou Accueil - choix de famille s'il a des questions en attente dans une autre famille (voir écran 3)
- Arrivée par un lien d'invitation → connexion, puis rejoindre la famille (écran 2)
- Aucune famille → Création de famille (écran 2)

Une personne centrale qui a un compte passe par le même parcours que les autres joueurs.


## 2. Créer ou rejoindre une famille

But : démarrer une famille, ou rejoindre celle où l'on a été invité.

### Créer une famille

Étapes :
1. Nom de la famille
2. Ses propres infos de base (prénom, nom, genre — ajouté à l'implémentation, nécessaire pour les conditions femme/homme du catalogue). **Corrigé le 2026-11-20** : sautée si le joueur a déjà une famille — son identité ne change pas d'une famille à l'autre (voir `concept.md`), elle est reprise de sa fiche existante plutôt que redemandée (modifier son prénom/nom/genre attend un écran de profil séparé, pas encore conçu).
3. La ou les personnes centrales (1 à 4) : prénom, nom, genre, vivante ou décédée, lien de parenté avec soi (choisi dans une liste : grand-mère, petit-fils, gendre…)
4. Pour chaque personne centrale : créer un profil sans compte. (**Simplifié pour l'implémentation initiale** : l'option "l'inviter directement" est repoussée — elle demande un mécanisme de rattachement d'un compte à un profil déjà créé, pas encore conçu.)
5. Lien d'invitation à partager aux autres membres — un seul lien, réutilisable par plusieurs personnes (pas à usage unique)
→ Accueil - famille

### Rejoindre une famille (depuis un lien d'invitation)

Étapes :
1. « Vous êtes invité dans la famille X »
2. Ses infos de base (prénom, nom, genre)
→ Accueil - famille

**Simplifié pour l'implémentation initiale** : l'étape "son lien de parenté avec chaque personne centrale" est repoussée — `relationship_label` n'est aujourd'hui qu'un champ simple posé par le créateur de la famille (sa propre perception), pas une relation par paire (créateur, joueur, personne centrale). Une vraie capture par paire attend l'étape "mini arbre familial".


## 3. Accueil - choix de famille

But : choisir dans quelle famille aller. N'existe que si le joueur appartient à au moins 2 familles.

Affiche :
- la liste de ses familles
- mises en avant en tête de liste : les familles où il a des questions à répondre ou des réponses à valider, avec le nombre (« 2 questions à répondre »)

Actions :
- Choisir une famille → Accueil - famille
- Créer une nouvelle famille → écran 2

À la connexion :
- par défaut, le joueur arrive directement sur la dernière famille consultée ;
- s'il a des questions en attente de réponse dans une autre famille, il arrive sur cet écran de choix.


## 4. Accueil - famille

But : point d'entrée dans une famille. Le but de l'app est de proposer des quiz pour en apprendre plus sur sa famille : l'écran met donc en avant **jouer** et **apprendre**, puis contribuer.

### Organisation (refonte décidée le 2026-11-10)

Du haut vers le bas, par ordre d'importance :

1. **Bandeau** (voir Règles communes) : nom de la famille, bouton « Inviter », menu burger.
2. **Deux gros boutons centraux** :
   - **« Participer au quiz »** : mène à la bonne action selon la phase du jeu (voir États ci-dessous). Son libellé, une icône ou un badge indiquent l'état.
   - **« Consulter les connaissances »** (bouton blanc à liserés bleu et rouge, jamais rouge plein) : ouvre l'arbre familial en mode consultation (écran 10). En touchant une personne, on lit le récapitulatif de ce qu'on sait d'elle (écran 11).
     **Décidé le 2026-11-19, codé le 2026-11-20 (nouvelle charte « Coucher de soleil », voir `design.md` ; tirage dans `src/lib/home-profiles.ts`)** : la carte affiche aussi **4 profils** en carré 2 × 2 à gauche, le titre et le sous-titre à droite (ronds colorés avec l'initiale, sans prénom, étoile sur les personnes centrales), tirés au hasard à chaque affichage de l'accueil : **en priorité les personnes qui ont au moins un souvenir révélé**, poids ×1,5 pour les personnes centrales (comme la pioche), complétés par les autres personnes s'il en manque (une petite famille en affiche moins de 4). Toucher un profil ouvre directement l'arbre centré sur cette personne avec son récapitulatif ouvert (écran 10 + panneau de l'écran 11) ; toucher n'importe où ailleurs sur la tuile ouvre l'arbre normalement.
3. **« Ajouter un souvenir »** (écran 5) : moins important, mais mis en avant. **Alerte** quand il reste moins de 5 faits jamais posés dans la pioche (« Plus que 3 questions en réserve : ajoutez des souvenirs ! »).
4. **« Historique »** (écran 12) : les questions déjà posées et le tableau des scores.
5. **« Mes faits »** (écran 5, Mes faits), avec un **badge** quand une proposition de correction attend la décision du joueur sur l'un de ses faits.

### États du bouton « Participer au quiz »

Deux styles (détail dans `design.md`) : **bleu plein** quand une action t'attend, **blanc à liserés bleu et rouge** quand il n'y a rien à faire et qu'on attend. Chaque état est dessiné dans la maquette de l'accueil (lien dans `design.md`).

| État | Style | Ce que le bouton affiche | Où il mène |
|---|---|---|---|
| Une question t'attend | Bleu plein, badge « 1 » | « Une question t'attend » + deadline (« À répondre avant dimanche 15 novembre ») | Répondre (écran 6) |
| Tu as répondu, en attente de la révélation | Blanc à liserés | « Réponse envoyée » + date de la révélation, lien « Voir ou modifier ma réponse » | Répondre (consulter / modifier sa réponse jusqu'à la deadline) |
| Tu es l'auteur de la question en cours | Blanc à liserés | « Ta question est en jeu » + nombre de réponses reçues et date de la révélation, lien « Voir ma question » | Ma question (écran 6, vue de l'auteur) |
| Réponses à valider | Bleu plein, badge du nombre | « N réponses à valider » + rappel de la question | Valider (écran 7) |
| Révélation disponible | Bleu plein, badge « 1 » | « La révélation est là ! » + « Découvre qui avait trouvé » | Révélation (écran 8) |
| Entre deux quiz | Blanc à liserés | « Quiz terminé » + date du prochain quiz (« Prochaine question lundi 16 novembre ») ; en phase de test, sans tâche planifiée : « En attente du prochain quiz » ; lien « Revoir la dernière révélation » | Revoir la dernière révélation (écran 8) |
| Plus aucun fait à piocher | Blanc à liserés | « Pas de prochain quiz » + « Il n'y a plus de souvenirs à piocher », lien « Ajouter des souvenirs » | Ajouter un souvenir (écran 5) |

Le bouton n'a pas d'icône. L'étiquette « PARTICIPER AU QUIZ » est en première ligne, avec le badge éventuel aligné à droite.

Si plusieurs états s'appliquent en même temps (ex : l'auteur doit valider des réponses), le plus urgent l'emporte : valider > répondre > révélation disponible > en attente.

### Famille qui démarre (aucun quiz n'a encore eu lieu)

Le bouton « Participer au quiz » n'est pas affiché. Il est remplacé, au même endroit, par une carte **« Lancer votre premier quiz »** :
- les étapes à franchir, avec leur avancement (ex : « ✓ 2 joueurs sur 3 », « 1 souvenir ajouté ») ;
- deux boutons dans la carte : **« Inviter des membres »** et **« Ajouter un souvenir »**.

Dès le premier quiz, la carte laisse sa place au bouton « Participer au quiz ». « Consulter les connaissances » reste affiché : l'arbre sert aussi à construire la famille au démarrage.

### Existant (`src/app/home.tsx`)

**Fait le 2026-11-11**, d'après la maquette validée (charte dans `docs/design.md`, polices Fredoka/Nunito ajoutées au projet) :
- bandeau : nom de famille (menu déroulant pour changer de famille ou en créer une autre, bouton « Inviter » à côté de la famille courante), menu burger (« Créer une session maintenant » pour les tests, déconnexion) — **extrait le 2026-11-20 en composant partagé** `src/components/family-header.tsx` (lien d'invitation : `src/lib/use-invite-link.ts`), repris par l'écran « Ajouter un souvenir » ;
- bouton « Participer au quiz » avec ses 8 états (7 de la maquette + le cas rare « tu as rejoint après la pioche », en style atténué) ; distingue « La révélation est là ! » de « Quiz terminé » via un repère mémorisé sur l'appareil (`AsyncStorage`, posé par `reveal.tsx` à la consultation) — pas de notion de "vu" côté serveur ;
- carte « Lancer votre premier quiz » tant qu'aucune session n'a jamais eu lieu pour la famille ;
- « Consulter les connaissances » (ouvre l'arbre) avec le sous-titre « N souvenirs sur M personnes » ;
- « Ajouter un souvenir » avec l'alerte réserve bientôt vide (moins de 5 faits jamais posés) ;
- tuiles « Historique » (écran 12, pas encore construit — ne fait rien pour l'instant) et « Mes faits » (badge si une correction proposée sur l'un de mes faits attend ma décision, via `get_my_pending_corrections_count`).

**Pas d'icônes vectorielles** (comme pour l'arbre) : glyphes en caractères ou petites formes dessinées (View), en attendant de vraies icônes. Le choix de famille (écran 3) et « Créer une autre famille » sont une liste déroulante simplifiée dans le bandeau, pas un écran dédié.

### Pioche et création de session (`create-quiz-session`)

Edge Function (`supabase/functions/create-quiz-session`), appelée par un membre de la famille avec `{ family_id }`. Logique :

1. Vérifie que l'appelant est bien membre de la famille (sinon 403).
2. Refuse si une session est déjà `open` pour cette famille (sinon 409) — une seule session active à la fois.
3. Pioche **un seul fait** parmi ceux de la famille.
   - **Règle (décision du 2026-11-10)** : seuls les faits **jamais posés** sont piochés. Un fait déjà posé ne peut être repioché que s'il ne reste plus aucun fait jamais posé, et les joueurs en sont alors prévenus (forme à définir).
   - Pondération entre les faits jamais posés : bonus ×1.5 si le sujet est une personne centrale (priorité, pas exclusivité).
   - Un fait déjà posé dans une session encore `open` est exclu (pas de double-pioche concurrente).
   - **Corrigé le 2026-11-10** dans les deux implémentations, gardées alignées : `supabase/functions/create-quiz-session/pioche.ts` (testé par `pioche.test.ts`, `npm run test:pioche`) et `create_quiz_session_for_family()` (migration `20261110130000_pioche_never_posed_first.sql`, testée sur Postgres local). Le résultat renvoie aussi `reused` (fait déjà posé repioché, faute de faits jamais posés) et `neverPosedLeft` (faits jamais posés restants, pour l'alerte de l'accueil sous 5). En attendant la refonte de l'accueil, le message affiché après « Créer une session » le signale.
4. Crée la session (`opens_at` = maintenant, `closes_at` = +7 jours), une `quiz_questions` pour le fait retenu (avec `answer_value_snapshot`, et `validator_person_id` = auteur si le type est `free_text`), et les `question_recipients` associés : tous les joueurs de la famille sauf l'auteur du fait.

**Déclenchement** : deux voies coexistent.
- **Manuelle** (bouton dans l'app, Edge Function `create-quiz-session`) : c'est la voie utilisée pendant la phase de test.
- **Automatique** : `auto_create_quiz_sessions()`, programmée par `pg_cron` chaque lundi à 8 h (migration `20261109240000_automatic_triggering.sql`), ne pioche que pour les familles d'au moins 3 joueurs. La migration programme la tâche dès qu'elle est appliquée : si on veut rester en manuel, il faut la désactiver (`cron.unschedule`), et vérifier ce qui tourne avec `select * from cron.job;`.

**À revoir** : le timing de la tâche planifiée (jour et heure de la pioche).

L'Edge Function utilise la clé `service_role` (`ctx.supabaseAdmin`) pour écrire dans `quiz_sessions`/`quiz_questions`/`question_recipients`, qui n'ont pas de policy RLS d'écriture pour les joueurs (ces tables sont gérées par le système, voir `supabase/migrations/20261106130000_rls_policies.sql`).


## 5. Ajouter un fait

But : renseigner une information sur un membre de la famille, et retrouver les faits qu'on a déjà créés.

### Mes faits

Affiche la liste des faits créés par le joueur (les plus récents en premier), avec leur état : pas encore posé, posé dans la session en cours, révélé.

Pour chaque fait : la question (sujet inclus), la réponse donnée, l'anecdote si renseignée, et la date d'ajout.

**Propositions de correction** : quand quelqu'un propose une correction sur un de ses faits, le joueur la voit ici (badge sur le bouton « Mes faits » de l'accueil) et l'accepte ou la refuse. Notification par email en attendant les notifications push (phase 2, applis mobiles).

Actions :
- Modifier ou supprimer un fait **pas encore posé** (réponse, anecdote) — suppression avec confirmation
- Un fait posé ou révélé ne se modifie plus et ne se supprime plus : il passe par le mécanisme de correction (voir écran 8, Corrections)

**Simplifié pour l'implémentation initiale** : le statut (« pas encore posé » / « posé dans la session en cours » / « révélé ») est calculé en vérifiant l'existence d'une ligne `quiz_questions` liée et le statut de sa session — modifier/supprimer ne sont proposés que pour un fait « pas encore posé » (cohérent avec la RLS, qui bloque déjà l'écriture une fois posé). Modifier la **personne liée** ou l'**élément choisi** d'un fait n'est pas encore possible depuis « Mes faits » : ils sont affichés, mais seules la réponse et l'anecdote se modifient. L'UI de choix d'une personne liée existe maintenant à la création (voir Nouveau fait), elle pourrait être réutilisée ici.

**Refonte « Coucher de soleil » codée le 2026-11-23** (`src/app/my-facts.tsx`) — pas de maquette dédiée (comme pour l'écran 7) : bandeau famille partagé, une carte par fait avec une pastille de statut colorée, modifier/supprimer repris pour un fait pas encore posé.

**Trou comblé à cette occasion** : la ligne « Propositions de correction » ci-dessus décrivait une fonctionnalité jamais construite — l'accueil affichait déjà un badge sur « Mes faits » (`get_my_pending_corrections_count`), mais cet écran n'affichait rien du tout à son sujet, et aucune fonction ne renvoyait le détail d'une correction en attente (`facts.pending_correction` n'est plus lisible par une requête directe depuis la migration `20261110140000_hide_answers_from_direct_reads.sql`, qui a retiré ces colonnes des privilèges de lecture — le commentaire de `20261109220000_corrections.sql` affirmant le contraire est resté périmé). Ajouté : `get_my_pending_corrections(p_family_id)` (`security definer`, voir `supabase/migrations/20261123140000_my_pending_corrections_detail.sql`) renvoie la question, la réponse actuelle, la proposition et le commentaire ; affiché en haut de l'écran dans une carte brune par correction, avec « ✓ Accepter » / « ✗ Refuser » (`validate_correction`, inchangée).

**Vérifié à l'écran** (famille jetable, 1 auteur + 1 autre joueur, 3 faits dans les 3 statuts + 1 correction proposée par l'autre joueur sur le fait révélé) : affichage des 3 statuts avec leur pastille, modifier/annuler sur le fait pas encore posé, acceptation de la correction (la carte disparaît, le fait révélé affiche la nouvelle valeur).

### Nouveau fait

#### Forme de la réponse choisie par l'auteur (décidé le 2026-11-24, pas encore codé)

Pour certaines questions, c'est **l'auteur du fait qui choisit la forme de la réponse** : une date précise ou juste l'année, un âge ou une année, une commune ou un pays (ou une adresse ou une commune). Exemple : « Quand Marie a-t-elle pris sa retraite ? » → date précise, année ou âge, selon ce que l'auteur sait.

- **Catalogue** (`docs/question-templates.toml`, complété le 2026-11-24) : champ `formes` (types possibles, le premier = celui par défaut, égal à `kind`), `text_neutre`, et pour chaque autre type un bloc `[template.forme.<type>]` avec son `text` et son `recap`. 17 questions concernées :
  - **date / année / âge** : naissance (date, année), retraite (date, année, âge), mariage (date, année, âge), rencontre (année, date, âge), permis (année, âge, date), emménagement (année, date) ;
  - **âge / année** : fin de l'école, apprendre à nager, départ du domicile, premier ordinateur (âge, année) ; premier concert, premier avion, voyage dans un pays (année, âge) ;
  - **lieu** : mariage (commune, pays), voyage de noces (pays, ville), service militaire (ville, pays), adresse de naissance (adresse en saisie libre, commune).
  Ne changent pas : questions dont la forme découle de la question (âge de l'aîné à la naissance, télévision à la maison, pays étrangers, listes, saisie libre).
- **Deux formulations** (décision du 2026-11-24) :
  - **dans la liste** de « Ajouter un souvenir », tant que l'auteur n'a rien choisi : la question **neutre** (`text_neutre`), ex. « Quand Marie a-t-elle pris sa retraite ? », « Où s'est-elle mariée ? » ;
  - **une fois la forme choisie** (dans la tuile ouverte, dans « Mes questions », pour les joueurs, à la révélation) : la question **précise** de cette forme, ex. « À quelle date… », « En quelle année… », « À quel âge… », « Dans quel pays… » ;
  - **récapitulatif** : la phrase de la forme choisie (« … le 3 mars 2001 », « … en 2001 », « … à 62 ans »).
- **Dans la tuile ouverte** (« Ajouter un souvenir », et « Mes questions modifiables » tant que le fait n'est pas posé) : un **sélecteur à 2 ou 3 choix** au-dessus du champ de réponse, avec des libellés courts : « Date précise » / « Année » / « Âge », « Commune » / « Pays », « Adresse » / « Commune ». Choix initial : le type par défaut (premier de `formes`). Changer de forme change le champ de réponse (calendrier, liste des années, liste des âges, communes, pays) et le texte de la question affiché dans la tuile ; la valeur saisie est gardée quand elle se convertit sans ambiguïté (date → année : on garde l'année), sinon effacée. Choisir une forme ne compte pas comme « saisie commencée » (la tuile reste « ouverte pour voir » tant qu'aucune valeur n'est saisie).
- **Pour les joueurs** : ils répondent avec le **même type** que celui choisi par l'auteur (champ adapté dans « Répondre »), et la comparaison juste/faux se fait dans ce type. Pas d'écart affiché pour une date précise (décision du 2026-11-24 ; l'écart « à N ans près » reste pour les années, et les nombres/âges).
- **Préposition de lieu** : `{réponse_lieu}` (dans `recap`) et `<pays_lieu>` (dans `text` et `recap`) ajoutent la bonne préposition : « à Lyon » (commune ou ville), « en Italie », « au Portugal », « aux États-Unis » (pays). Il faut donc connaître la préposition de chaque pays de `src/constants/countries.ts` (féminin ou commençant par une voyelle → « en », masculin → « au », pluriel → « aux » ; quelques exceptions : « à Cuba », « à Malte », « à Singapour »…). Corrige au passage « en <pays> » de la question du voyage, faux pour « au Portugal ».
- **À faire côté serveur** (migration) :
  - `question_templates` : `answer_forms`, `template_text_neutral`, `form_texts` (voir `data-model.md`), remplis depuis le catalogue (et `supabase/seed.sql` à resynchroniser) ;
  - `facts.answer_kind` (null = type par défaut) ; `quiz_questions.answer_kind_snapshot` copié à la pioche ;
  - `submit_answer` compare avec le type du fait ; `get_revealed_question` (et ce qui affiche une question : Répondre, Ma question, Mes faits, récapitulatif) renvoie le type et le texte de la forme choisie ; `substitute_question_text` doit savoir prendre le texte d'une forme et gérer `<pays_lieu>` ;
  - vérifier que les faits déjà créés (sans `answer_kind`) gardent exactement leur comportement actuel.
- **Type « commune » (`city`) pas encore construit** : aujourd'hui, `city` et `place` retombent en saisie libre (texte comparé après normalisation). Pour le proposer comme forme, il faut au minimum un champ qui l'accepte ; idéalement une liste des communes françaises (ex. nouvelle liste de référence `communes`, depuis les données INSEE ou geo.api.gouv.fr) avec saisie libre possible pour une ville étrangère (« Venise »). À trancher au moment de coder : liste des communes tout de suite, ou saisie libre normalisée en attendant.
- `place` n'est plus utilisé par le catalogue (remplacé par `formes` : commune + pays) ; le type reste accepté par la base.

**Refonte décidée le 2026-11-20, codée le 2026-11-20** (`src/app/add-fact.tsx`, charte Soleil) — remplace la description « 4 zones » ci-dessous. Maquette : rangée « B · Créer un fait » du canvas « Quizamily – Pistes chaleureuses » (lien dans `design.md`), source dans `docs/maquettes/soleil/` (`Fait.dc.html`, paramètres `etat` et `repere`). Répartition des questions par thème calculée par `src/lib/add-fact-catalog.ts` (module pur, testé par `add-fact-catalog.test.ts`, `npm run test:add-fact-catalog`).

**Écarts avec la description ci-dessous, et simplifications** :
- la tuile s'agrandit sur place **sans animation de hauteur** (affichage conditionnel), dans l'esprit des autres écrans MVP (comme `respond.tsx`/`validate.tsx`) ;
- **corrigé le 2026-11-23** (signalé par l'utilisateur) : la tuile ouverte s'affiche **exactement à la place de la question touchée**, dans la liste où elle se trouvait (« à renseigner » ou « Mes questions modifiables ») — pas hissée en haut de la carte comme décrit plus bas. En étant scrollé plus bas dans la carte, la hisser en haut la faisait sortir de l'écran sans que le scroll suive, donnant l'impression qu'elle avait disparu ; et même avec un défilement automatique, revenir en arrière après avoir cliqué par erreur aurait demandé de redescendre dans la liste. Rester à sa place évite les deux ;
- **ajouté le 2026-11-23** (demandé par l'utilisateur), pour une question à élément choisi (conjoint, pays) : une fois choisi, l'élément s'affiche **souligné en pointillés dans le texte de la question** (en cours de création seulement, pas pour une question déjà créée via « Mes questions modifiables ») ; le toucher efface juste ce choix et rouvre son sélecteur, sans toucher au reste de la saisie (réponse, anecdote) — jusque-là, se tromper obligeait à « Annuler » toute la tuile. Nécessite un découpage du texte en segments (`buildQuestionSegments`, à côté de `previewQuestionText`) plutôt qu'une simple chaîne, pour isoler l'élément cliquable. **Corrige au passage** un effet de bord du sélecteur de pays saisissable (passé de chips à `SearchableDropdown` le même jour) : le sélecteur se refermait dès la première lettre tapée, la valeur devenant alors « non vide » — `onFocusChange` sur `SearchableDropdown` garde le sélecteur affiché tant qu'il a le focus, indépendamment du contenu tapé ;
- « toucher ailleurs referme la tuile » n'est implémenté que pour les actions qui changent explicitement de contexte (toucher une autre tuile, une autre personne, un autre thème) : il n'y a pas de zone de fond cliquable dédiée pour fermer une tuile « ouverte pour voir » en touchant un espace vide de la carte ;
- le bandeau famille (barre du haut) est le composant partagé `src/components/family-header.tsx`, extrait de l'accueil à cette occasion (voir aussi `src/lib/use-invite-link.ts`) ;
- **pas encore vérifié à l'écran** : le geste de glissement réel entre deux cartes de thème (l'automatisation ne sait pas simuler un vrai glissement, limitation déjà connue pour l'arbre) — vérifié en revanche par le repère des thèmes (saut direct) et par défilement à la souris/clic, qui empruntent le même code de positionnement.

- **Haut de page** : barre de la famille (comme l'accueil), puis flèche retour + titre « Ajouter un souvenir ».
- **Personnes** : rangée de ronds qui défile horizontalement ; la personne choisie est encadrée. Ordre de tri : à décider plus tard.
- **Récapitulatif rapide** de la personne choisie : « 12 souvenirs connus · 4 en réserve » (connus = révélés ; en réserve = faits créés pas encore posés, par n'importe qui).
- **Repère des thèmes** au-dessus de la carte, qu'on touche pour aller directement à un thème : doit rester discret mais immédiatement compréhensible. **Retenu le 2026-11-20 : une rangée de noms de thèmes qui défile** (thème actif en brun plein, les autres translucides ; pendant une recherche, un petit chiffre jaune sur les thèmes qui ont des résultats). La variante en points (`FaitPoints.dc.html`) n'est pas retenue. Les thèmes complets pour la personne vont en fin de liste.
- **Carte du thème** : une grande carte par thème, on glisse horizontalement pour passer au suivant (on voit le bord de la carte suivante). En-tête : nom du thème + bouton « Surprends-moi » (une question au hasard du thème). Dedans, défilement vertical :
  1. les questions **à renseigner** (sans intertitre) ; les questions qu'on peut renseigner plusieurs fois (voyage par pays, mariage par conjoint) y restent toujours ;
  2. **« Mes questions (modifiables) »** : mes faits pas encore posés, ouvrables pour modifier ma réponse ou supprimer le fait (avec confirmation). Tuile pleine (fond crème, bordure brune légère) : la question, puis une ligne avec « Ta réponse : … » dans une pastille (coupée par « … » si trop longue) et « ✎ Modifier » à droite ;
  3. **« Déjà renseignées »** : faits créés par d'autres ou déjà posés — la question seule, jamais la réponse, grisée et **désactivée** (pas cliquable). Voir les questions des autres ne pose pas de problème.
  Thème complet : un message « Tout est renseigné pour <personne> dans ce thème », puis les groupes 2 et 3.
- **Recherche** : champ fixe en bas de l'écran, filtre les questions du thème affiché. Si le thème affiché n'a aucun résultat mais que d'autres en ont : le repère des thèmes l'indique (nombre de résultats par thème) et la carte propose « N questions dans <thème> » pour y aller.
- **Choisir une question** : la tuile s'agrandit sur place (pas de changement d'écran) avec les champs (réponse, anecdote) et « Annuler » / « Enregistrer ». Si elle est trop haute, elle s'ouvre en haut de la liste et défile dans la carte. Deux états :
  - **ouverte pour voir** (juste touchée, rien de saisi) : toucher ailleurs, faire défiler, glisser ou changer de personne la referme aussitôt ; la recherche reste visible ;
  - **saisie en cours** (une valeur dans n'importe quel champ : réponse, anecdote, conjoint, pays…) : la question reste ouverte, **on ne peut plus glisser entre les thèmes ni changer de personne** jusqu'à « Enregistrer » ou « Annuler » ; la recherche est masquée et la tuile remonte au-dessus du clavier. Si on efface tout, elle redevient « ouverte pour voir ».
- **Après « Enregistrer »** : la tuile se referme et **disparaît des questions à renseigner** (son statut change) pour **réapparaître dans « Mes questions (modifiables) »**, avec un bref « Ajouté ! » ; le récapitulatif (« N en réserve ») se met à jour ; on reste sur l'écran (plus d'écran de confirmation). Exception : une question qu'on peut renseigner plusieurs fois (voyage par pays, mariage par conjoint) reste aussi dans les questions à renseigner.
- Plus tard : flèches gauche/droite sur ordinateur, ordre des personnes.

**Version actuelle (avant la refonte)** :

Un seul écran (pas un assistant multi-étapes), avec 4 zones :

1. **Choix du sujet** : des cases représentant des personnes (photo ou, par défaut, un placeholder — initiales/icône), les personnes centrales en premier. La première est présélectionnée à l'arrivée sur l'écran. Une dernière case "autre" ouvre la liste complète de la famille. Le sujet n'est plus limité aux personnes centrales (elles restent juste prioritaires, y compris pour la pioche plus tard — voir `concept.md`). Le dernier sujet et le dernier thème choisis sont mémorisés en local sur l'appareil (par joueur, pas partagé avec le reste de la famille), pour retrouver le même contexte à la prochaine ouverture de l'écran.
2. **Thèmes** : des chips filtrant le catalogue par catégorie, calculées dynamiquement à partir des questions encore disponibles pour le sujet choisi (pas un nombre figé) — les plus pertinentes affichées, un "+" pour voir les autres. Optionnel : sans thème choisi, la recherche porte sur tout le catalogue éligible.
3. **Recherche** : un champ de recherche textuelle dynamique (ex: taper "école" pour trouver les questions liées à l'école), qui filtre en direct la liste des questions (déjà filtrée par thème si un thème est choisi, et par les conditions du sujet : femme/homme/vivant/a des frères et sœurs — et par les questions déjà posées pour ce sujet, qu'on ne peut pas créer deux fois). Un lien « Réinitialiser les filtres » apparaît dès qu'un thème ou une recherche est actif. Un bouton « Surprends-moi » choisit une question au hasard parmi les résultats actuellement filtrés, pour réduire le temps de décision. Un compteur rappelle combien de faits ont déjà été ajoutés sur le sujet et combien de questions restent disponibles.
4. **Question + réponse** : une fois une question choisie, l'écran se réduit (sujet/thèmes/recherche se replient derrière un bouton « Modifier les filtres », qui les rouvre sans perdre la sélection en cours) pour mettre en avant la question, son champ de réponse adapté au type (y compris un vrai sélecteur calendrier pour les dates), et l'anecdote/contexte optionnelle juste en dessous (+ pièce jointe, hors MVP).
→ Confirmation, puis « Ajouter un autre fait » (le sujet et le thème restent sélectionnés) ou retour à l'accueil

Cas particuliers :
- Type liste : champ de recherche au fil de la frappe (8 propositions, insensible aux accents) ; si la valeur tapée n'est pas dans la liste, elle est ajoutée telle quelle pour la famille à l'enregistrement du fait (visible tout de suite dans la famille, base globale après validation). Une question peut limiter les propositions à une catégorie (premier concert → seulement des artistes de musique).
- Type lieu : choix entre pays et commune

**Unicité** : une question ne peut être créée qu'une fois pour la combinaison question + sujet + personne liée ou élément choisi. Par exemple, « voyage en <pays> » peut être créée une fois par pays, et « date de mariage » une fois par conjoint en cas de remariage.

**État de l'implémentation** : les 32 templates sont proposés, y compris ceux avec une personne liée (`<conjoint>` : détectée automatiquement si déjà connue, sinon choisie parmi les personnes existantes ou créée à la volée), avec un élément à choisir (`<pays>`) et les types commune et lieu (migration `20261109250000_linked_person_and_slot_templates.sql`).

**À tester** : les questions avec personne liée, élément à choisir, commune ou lieu n'ont pas encore été testées en conditions réelles.

Photos des personnes : placeholder pour l'instant, le vrai upload est un chantier séparé.


## 6. Répondre

But : répondre à une question de la session en cours.

**Refonte décidée le 2026-11-23, codée le 2026-11-23** (`src/app/respond.tsx`) — charte « Coucher de soleil ». Maquette : rangée « B · Répondre et révélation » du canvas (lien dans `design.md`), source `docs/maquettes/soleil/Repondre.dc.html` (paramètre `etat` : `question`, `envoyee`, `auteur` ; écrans `RepondreEnvoyee` et `MaQuestion` = mêmes avec un autre `etat`).

**Écarts avec la description ci-dessous, et implémentation** :
- bandeau famille partagé (`src/components/family-header.tsx`), comme les autres écrans repris dans cette charte ;
- l'avancement et l'anecdote modifiable demandent deux nouvelles fonctions `security definer` : `get_question_progress` (compteur + noms des retardataires seulement à partir de 65 % de réponses — `null` avant ce seuil, tableau vide une fois tout le monde répondu) et `update_fact_context` (l'auteur modifie son anecdote tant que la question est en jeu, sans toucher à sa réponse) — voir `supabase/migrations/20261123120000_respond_and_reveal_rpcs.sql` et le correctif `20261123130000_question_progress_everyone_answered.sql` (le premier jet renvoyait `null` au lieu d'un tableau vide une fois tout le monde répondu, trompeur à l'écran : repéré en testant avec un compte jetable) ;
- **vérifié à l'écran** (famille jetable à 1 auteur + 3 destinataires) : carte brune → prune après réponse, modification de sa réponse, compteur et seuil des 65 % (bascule de « les noms s'afficheront… » à la liste des retardataires avec « toi », puis à « Tout le monde a répondu ! »), vue de l'auteur (bonne réponse, anecdote modifiable via `update_fact_context`, grille « Qui a répondu ? », déclenchement de la révélation).

*Vue du joueur*
- **Haut de page** : bandeau famille partagé (`src/components/family-header.tsx`), puis flèche retour + titre « Question de la semaine ».
- **Carte de la question** (brun-orangé, décor de soleil, comme le bouton « action » de l'accueil) : rond de la personne concernée + « Une question sur <prénom> », la question en grand, pastille « Il reste N jours · jusqu'au <jour date> », puis sur fond crème le champ de réponse (même champ guidé qu'aujourd'hui, `AnswerInput`) et le bouton « Valider ma réponse ».
- **Réponse envoyée** : la carte passe en **prune** (décor de lune, comme l'état « attente » de l'accueil) : « Réponse envoyée », la question, « Ta réponse » en grand + bouton « Modifier », puis « Révélation <jour date> · modifiable jusque-là ». Règles de modification et de verrouillage inchangées (voir plus bas).
- **Teaser** sous la carte : « Qui a posé cette question ? Réponse à la révélation… ».
- **Avancement — compteur seulement** (décision du 2026-11-23) : « X ont répondu · Y attendus » + une barre d'autant de cases que de destinataires. **Jamais la liste de ceux qui ont répondu** : l'auteur ne reçoit pas sa propre question, il serait la seule personne absente de la liste, donc immédiatement identifié.
  - **Retardataires** : quand **au moins 65 % des destinataires** ont répondu (destinataires = joueurs qui ont reçu la question, donc sans l'auteur ; le joueur qui regarde compte), on affiche aussi **les noms des retardataires seulement** (« On attend encore : toi, Luc, Camille. N'hésite pas à les relancer ! » — « toi » si le joueur lui-même n'a pas répondu). Avant ce seuil : « Les noms des retardataires s'afficheront quand la plupart auront répondu. » Ça ne révèle pas l'auteur : il n'est ni parmi les répondants (jamais affichés) ni parmi les retardataires.
  - **Côté serveur, obligatoire** : ces informations doivent venir d'une nouvelle fonction `security definer` (ex. `get_question_progress(p_quiz_question_id)` → nombre de destinataires, nombre de réponses, et les noms des retardataires **seulement si** le seuil de 65 % est atteint, `null` sinon). Ne pas envoyer la liste complète au client pour filtrer côté app : elle serait lisible dans les outils réseau du navigateur. `get_question_participants` reste réservée à l'auteur.

*Vue de l'auteur (« Ma question »)*
- Même haut de page, titre « Ma question » ; carte **prune** « Ta question est en jeu » : la question, puis sur fond crème la **bonne réponse** et **ton anecdote**, avec un bouton **« Modifier l'anecdote »** et la phrase « Profite de la semaine pour enrichir ton souvenir : elle sera dévoilée à la révélation. (Photo et enregistrement : bientôt.) » — décision du 2026-11-23 : ça donne à l'auteur quelque chose à faire pendant la semaine de sa question. Photo et audio : plus tard (`fact_attachments`, prévu dans le modèle, hors MVP).
  - **Côté serveur** : la policy actuelle n'autorise l'auteur à modifier que ses faits **pas encore posés** ; il faut une fonction dédiée (ex. `update_fact_context(p_fact_id, p_context_text)`, `security definer`) qui ne touche **que** l'anecdote (`facts.context_text`), réservée à l'auteur, autorisée tant que la question est en cours. La révélation lit déjà `facts.context_text` en direct (pas de copie figée), la nouvelle version y apparaîtra donc.
  - **Après la révélation** : à revoir avec la future discussion entre membres sur une question révélée (étape 5 de la roadmap) ; pour l'instant, modification réservée à la semaine de la question.
- **« Qui a répondu ? »** (réservé à l'auteur) : les ronds des destinataires avec une coche pour ceux qui ont répondu, grisés sinon, « N sur M », « On attend encore : … », et une note « Ce détail n'est visible que par toi… ».
- « Valider les réponses (N) » quand il y en a (écran 7, inchangé, sa refonte est une étape à part), et « Révéler maintenant (test) » avec « Ceux qui n'ont pas répondu compteront faux. »

**Version actuelle (avant la refonte)** :

Affiche :
- le texte de la question (« En quelle année Mamie M a-t-elle pris l'avion pour la première fois ? »)
- le champ de réponse du type de la question
- la deadline (« Il reste 3 jours »)

L'auteur du fait n'est pas affiché : il n'est dévoilé qu'à la révélation.

Actions :
- Valider la réponse → question suivante de la session, ou retour à l'accueil
- Passer → la question reste « pas répondu » jusqu'à la deadline
- Modifier sa réponse jusqu'à la deadline. Exception : pour une question en saisie libre, si tout le monde a répondu avant la deadline et que l'auteur a validé les réponses, elles sont verrouillées.

Cas particuliers :
- Type liste : même champ de recherche que l'auteur, mais seulement les valeurs de la liste globale (pas les ajouts de la famille, pour ne pas révéler la réponse) ; si la réponse n'y est pas, le joueur la tape en entier (comparée après normalisation).
- Le joueur est le sujet de la question (personne centrale avec un compte) : dans l'idéal, la question est formulée à la 2e personne (« En quelle année avez-vous pris l'avion… »). Pas prioritaire, même chantier technique que l'accord au féminin.

**Simplifié pour l'implémentation initiale** (`src/app/respond.tsx`) : pas de notion de « question suivante » (une session n'a qu'une seule question, voir `concept.md`) — après validation, retour à l'accueil. Pas de notification. Pas de retour immédiat juste/faux : le résultat n'est connu qu'à la révélation (écran 8).

**Blocage des réponses** (corrigé le 2026-11-10, migration `20261110100000_reveal_waits_validation_and_answer_lock.sql`) : `submit_answer` refuse toute réponse une fois la deadline passée ou la session clôturée, et refuse la modification d'une réponse libre une fois que tout le monde a répondu et que l'auteur a validé (verrouillage prévu plus haut). Une réponse modifiée avant ce verrouillage repart de zéro : une validation précédente est effacée. Le message de refus du serveur s'affiche tel quel sur l'écran.

### Vue de l'auteur (« Ma question »)

L'auteur du fait posé n'est pas un destinataire (il ne répond jamais à sa propre question), mais accède depuis l'accueil à un lien « Voir ma question » (plutôt que « Répondre ») qui affiche :
- la question et sa réponse (lecture seule, pas de modification ni suppression possible une fois posée)
- l'anecdote, si renseignée
- **qui, dans la famille, a déjà répondu ou non** (juste le statut — jamais le contenu de la réponse de chacun, pour ne pas gâcher la révélation)

Implémenté via une fonction `get_question_participants(p_quiz_question_id)` (`security definer`, voir `supabase/migrations/20261109180000_question_participants_rpc.sql`) plutôt qu'un assouplissement de la policy RLS sur `question_recipients` — une policy plus large aurait aussi exposé `answer_given`/`result` de chacun.


## 7. Valider les réponses libres

But : pour l'auteur d'un fait en saisie libre (ou celui qui a pris la main), accepter ou refuser les réponses non identiques.

La validation est **anonyme** : le validateur ne voit pas qui a donné chaque réponse.

Affiche :
- la question et la bonne réponse
- les réponses à valider, **regroupées par valeur identique** (« Durant » : 3 réponses), pour ne valider qu'une fois
- les réponses déjà validées automatiquement, pour information

Actions :
- Accepter ou refuser chaque réponse (ou groupe de réponses)
- Une fois tout validé → la question sera révélée à la deadline, ou tout de suite si la deadline est passée

Implémenté (`src/app/validate.tsx`) via `get_pending_validations`/`validate_pending_answers` (`security definer`, voir `supabase/migrations/20261109200000_validate_free_text_answers.sql` et `20261109210000_gate_validation_anonymity.sql`) : ces fonctions ne renvoient jamais qui a donné quelle réponse (juste la valeur, son nombre d'occurrences, et les ids de ligne nécessaires pour appliquer la décision), pour respecter l'anonymat documenté ci-dessus. Accessible depuis « Ma question » (écran 6) via un lien « Valider les réponses (N en attente) » dès qu'il y en a ; `reveal_current_question` refuse maintenant explicitement de révéler tant qu'il en reste (plus d'auto-résolution silencieuse en "incorrect").

**Refonte « Coucher de soleil » codée le 2026-11-23** — pas de maquette dédiée (étape à part de celle de « Répondre »/« Révélation », voir `roadmap.md`) : bandeau famille partagé, panneau « À valider » (une carte par groupe, pilule du nombre de réponses, boutons « ✓ Accepter » plein / « ✗ Refuser » en liséré rouge), panneau « Déjà validées automatiquement » en lecture seule, carte « Tout est validé ! » quand il n'y a plus rien à faire, avec un bouton « Retourner à Ma question ». Comportement inchangé, aucun nom de joueur affiché (toujours anonyme). **Vérifié à l'écran** (famille jetable, 1 auteur + 3 destinataires, 1 réponse exacte + 2 variantes orthographiques) : 2 groupes à valider affichés une fois le seuil d'anonymat atteint, accepter et refuser chacun, retour à « Ma question » qui reflète l'état à jour.

**Anonymat contre la corrélation temporelle** (2026-11-09, repéré par l'utilisateur) : l'écran « Ma question » montre « qui a répondu » par nom, en temps réel. Si les groupes à valider apparaissaient eux aussi au fil de l'eau, un groupe de taille 1 apparaissant juste après qu'un ✓ s'affiche pour une personne lui serait trivialement attribuable — cassant l'anonymat malgré le regroupement par valeur. Solution retenue : les groupes (en attente **et** déjà auto-validés, même risque sur les deux) ne sont visibles qu'une fois que **plus des 2/3 des destinataires ont répondu**, ou que le moment de la première relance à l'auteur est atteint (pas de vraies notifications encore, mais le même calcul que `concept.md` : dès que tout le monde a répondu, ou au plus tard 24h avant la deadline). Avec un petit nombre de destinataires, les 2/3 arrondissent de fait à « tout le monde » (fuite fermée complètement) ; avec une famille plus nombreuse, la validation « au fil de l'eau » reste possible un peu plus tôt, sur un groupe assez grand pour rester anonyme.

**Simplifié pour l'implémentation initiale** : pas de « prise de main » (un autre joueur prenant le relais après 7 jours si l'auteur ne valide pas) — auteur uniquement pour l'instant. Pas de vraies notifications/relances (le calcul du seuil des 24h avant deadline est réutilisé pour le déblocage de la validation, mais aucun email n'est envoyé).


## 8. Révélation

But : découvrir la bonne réponse et les résultats d'une question.

**Refonte décidée le 2026-11-23, codée le 2026-11-23** (`src/app/reveal.tsx`) — charte « Coucher de soleil ». Maquette : `docs/maquettes/soleil/Revelation.dc.html` (paramètres `etat` : `suspense`, `trouve`, `rate` ; `exemple` : `annee` ou `artiste` pour une réponse longue) ; écrans `RevelationTrouve`, `RevelationRate`, `RevelationTexte`.

**Écarts avec la description ci-dessous, et implémentation** :
- `get_revealed_question` renvoie maintenant `personId` par participant (même migration que ci-dessus, `20261123120000_respond_and_reveal_rpcs.sql`) : sert à isoler « ma réponse » dans sa propre carte et à colorer chaque rond comme ailleurs dans l'app (`avatarColorFor`) ;
- les animations de la maquette (suspense qui scintille, bonne réponse qui surgit, confettis, tremblement) tournent en boucle sur le canvas pour qu'on les voie (voir `docs/maquettes/LISEZMOI.md`) ; dans l'app, elles ne jouent qu'une fois, au toucher de « Découvrir la réponse » — **codées le 2026-11-23** avec l'API `Animated` native (pas Reanimated, jamais utilisé dans le code existant — voir `src/app/family-tree.tsx` pour la même convention, pilote natif désactivé sur web via `USE_NATIVE_DRIVER`) : la bonne réponse surgit (spring avec léger dépassement), confettis si trouvé, tremblement de la carte si raté. Ne jouent que si le suspense a été affiché à cette ouverture (jamais en rouvrant une révélation déjà vue sur l'appareil, vérifié à l'écran) ;
- **vérifié à l'écran** (famille jetable, 1 auteur + 3 destinataires dont 1 juste et 1 faux) : suspense à la première consultation (sur l'appareil, pas par compte — comme documenté dans « Règles communes »), bonne réponse, carte « Bravo, tu as trouvé ! » et carte « Raté, de peu ! » (avec l'écart « à N ans près »), anecdote de l'auteur affichée en citation, résultats des autres groupés par résultat (sans répéter ma propre réponse), lien de correction (non-auteur) et absence de ce lien pour l'auteur.

- **Haut de page** : bandeau famille, flèche retour + titre « Révélation ».
- **Suspense** (seulement pour la **révélation de la semaine**, la première fois que le joueur l'ouvre) : carte prune « Révélation de la semaine » avec le rond de la personne et la question, un cadre en pointillés « ? ? ? ? » qui scintille, et un gros bouton jaune **« Découvrir la réponse »** qui pulse doucement ; dessous : « N joueurs ont tenté leur chance… et qui a posé la question ? ». Rouverte plus tard (accueil, archives, déjà vue sur cet appareil) : tout s'affiche directement, sans suspense ni animation. Le repère « déjà vue » peut réutiliser celui que l'accueil pose déjà (`AsyncStorage`, posé par `reveal.tsx`).
- **Au toucher de « Découvrir la réponse »** (animations jouées **une seule fois** ; sur le canvas elles tournent en boucle pour qu'on les voie) :
  - la **bonne réponse surgit** dans un cartouche crème (petit rebond : agrandissement puis retour à la taille normale avec une légère rotation) ; en grand pour une réponse courte (année), plus petit et sur plusieurs lignes pour une réponse longue (« Les Compagnons de la chanson ») ;
  - **trouvé** : pluie de **confettis** aux couleurs de la charte (jaune, brun, menthe, lavande, orange, rose, et une touche de bleu et rouge) ;
  - **raté** : pas de confettis, la carte de ma réponse **tremble** brièvement.
- **Ma réponse, à part et bien distincte** (décision du 2026-11-23), juste sous la question :
  - trouvé : carte jaune, coche dans un rond brun, « Bravo, tu as trouvé ! » + « Ta réponse : … » ;
  - raté : carte crème bordée de rouge, croix, « Raté, de peu ! » + « Tu avais dit … » ;
  - pour les réponses **année ou nombre** : l'écart avec la bonne réponse (« à 4 ans près », « à 3 près ») ; rien pour les autres types ;
  - l'auteur (qui n'a pas répondu) et un joueur qui n'a pas répondu n'ont pas cette carte (pour ce dernier : « Tu n'as pas répondu cette fois »).
- **« Question posée par <auteur> »** : son rond + son anecdote présentée comme une citation (guillemet orange, italique).
- **Résultats des autres joueurs, groupés par résultat** (ma réponse n'y est pas répétée) : titre « X joueurs sur Y ont trouvé » (Y = tous les destinataires, moi compris), puis « Ont trouvé » (rond, prénom, pastille jaune avec coche et la réponse), « Se sont trompés » (pastille rose avec la réponse, **pas barrée** ; l'écart en dessous du prénom pour une année ou un nombre), « N'ont pas répondu » (rond grisé, « compté faux »). Les pastilles passent à la ligne pour une réponse longue. Réponses « annulées » (après une correction acceptée) : à afficher dans un groupe à part ou avec la mention « annulée » (pas maquetté).
- **« Tous les souvenirs de <prénom> »** (tuile rose) : ouvre l'arbre centré sur la personne, récapitulatif ouvert (`/family-tree?person=<id>&recap=1`, existe déjà), avec « Celui-ci vient de s'y ajouter ».
- « Retour à l'accueil » (bouton brun), puis un lien discret « Une erreur dans la réponse ? Proposer une correction » (formulaire de correction inchangé dans son fonctionnement, à restyler ; la carte de correction en attente garde « Accepter » / « Refuser » pour l'auteur).
- **Score cumulé** : toujours pas affiché, il viendra avec l'écran Historique (écran 12).
- **Côté serveur** : `get_revealed_question` renvoie les participants sans identifiant ; il faudra y ajouter `personId` (ou un indicateur « c'est moi ») pour isoler ma réponse et afficher les ronds avec la bonne couleur.

**Version actuelle (avant la refonte)** :

Affiche :
- la question et la bonne réponse
- l'auteur du fait, son anecdote ou contexte, et ses pièces jointes le cas échéant (hors MVP)
- qui a eu juste, qui a eu faux, qui n'a pas répondu
- la réponse donnée par chaque joueur, y compris les fausses (souvent drôles, elles lancent la discussion)
- les scores de la session et le score cumulé (« X bonnes / Y posées »)

Actions :
- Question suivante de la session
- Retour à l'accueil

Hors MVP (roadmap) : réactions et commentaires.

### Déclenchement

**Règles (décisions du 2026-11-10)** :
- **Les joueurs qui n'ont pas répondu ne bloquent jamais la révélation**, ni automatique ni manuelle : leurs réponses manquantes comptent faux.
- **Seules les réponses libres encore à valider bloquent la révélation** (type saisie libre, seul type où une réponse peut être « en attente de validation »). La question attend que l'auteur valide, ou qu'un joueur prenne la main 7 jours après la deadline (voir `concept.md`) : celui qui prend la main veut faire avancer le jeu, on part du principe qu'il validera ou refusera les réponses.
- **Toutes les validations faites avant la deadline** : révélation normale, à la deadline.
- **Toutes les validations faites après la deadline** : la question n'attendait plus que ça, elle est révélée immédiatement, dès la dernière validation (l'app ouvre directement la révélation).

**Révélation automatique** : `auto_reveal_expired_sessions()`, programmée par `pg_cron` toutes les heures (migration `20261109240000_automatic_triggering.sql`), clôture toute session dont la deadline est dépassée et qui n'a plus de réponse à valider. La révélation « à la deadline » a donc lieu au plus tard une heure après celle-ci. La migration programme la tâche dès qu'elle est appliquée : pour rester en manuel pendant les tests, la désactiver (voir « À faire sur l'ordinateur avec Supabase » dans `roadmap.md`).

**Révélation manuelle** : n'existe que pour la phase de test. Bouton « Déclencher la révélation » affiché à l'auteur sur l'écran « Ma question » (voir écran 6), utilisable à tout moment tant qu'il ne reste pas de réponse à valider, même si certains joueurs n'ont pas répondu (l'écran prévient que leurs réponses compteront faux).

**Implémentation** (migrations `20261110100000_reveal_waits_validation_and_answer_lock.sql` et `20261110110000_reveal_timing_rules.sql`) : les trois chemins (automatique, manuel, dernière validation après la deadline) passent par une même fonction de clôture, `close_quiz_session()`. `validate_pending_answers()` renvoie `true` quand la validation a déclenché la révélation. Le blocage des réponses après la deadline est décrit à l'écran 6.

**Simplifié pour l'implémentation initiale** (`src/app/reveal.tsx`) : une seule question par session (voir `concept.md`), donc pas de « question suivante ». Pas de score cumulé inter-sessions (demande d'agréger plusieurs sessions passées, pas construit). Pas de réactions/commentaires (hors MVP).

**Sécurité** : la bonne réponse (`quiz_questions.answer_value_snapshot`) n'est plus jamais envoyée au client avant la révélation — jusqu'ici, `respond.tsx` la recevait dans la réponse de l'API pour comparer côté client, visible par n'importe qui ouvrant les outils réseau du navigateur avant même d'avoir répondu. Le calcul juste/faux se fait maintenant entièrement côté serveur via la fonction `submit_answer` (voir `supabase/migrations/20261109190000_reveal_and_secure_answers.sql`), qui remplace l'écriture directe du joueur sur `question_recipients` (la policy correspondante a été retirée : elle aurait permis à un joueur de s'auto-attribuer « juste » sans vraiment répondre correctement). La révélation elle-même passe par `reveal_current_question` (auteur uniquement, vérifie que tout le monde a répondu, bascule `quiz_sessions.status` à `closed`) et `get_revealed_question` (lisible par toute la famille une fois la session fermée).

### Corrections

Affichée sur l'écran de révélation, qui sert aussi de vue détaillée d'une question depuis les archives (écran 9) : on peut donc proposer une correction juste après la révélation comme plus tard depuis les archives. N'importe quel membre de la famille **sauf l'auteur du fait** peut proposer une correction (nouvelle valeur + commentaire facultatif, même champ guidé que la réponse). L'auteur accepte ou refuse :
- **Acceptée** : la valeur canonique du fait change, l'ancienne reste visible dans l'historique (« Corrigé le [date] : ancienne → nouvelle »), et les scores de **toutes les sessions passées** ayant utilisé ce fait sont recalculés (un même fait peut être repioché plus tard, voir « Pioche et création de session ») : les joueurs ayant répondu l'ancienne valeur passent en « annulée » (ne compte ni pour ni contre), ceux ayant répondu la nouvelle passent en « juste », les autres ne changent pas.
- **Refusée** : les deux versions restent visibles comme une note sur le fait, sans trancher qui a raison.

Implémenté via `propose_correction`/`validate_correction` (`security definer`, voir `supabase/migrations/20261109220000_corrections.sql`). Une seule correction à la fois peut être en attente par fait.

**Simplifié pour l'implémentation initiale** : pas de « sans réponse » automatique (la règle du concept prévoit que l'absence de réponse de l'auteur transforme aussi la proposition en note, mais ça suppose des relances/notifications, pas encore construites) — seule une décision explicite de l'auteur (accepter/refuser) fait sortir une correction de l'état « en attente ».


## 9. Archives (fusionnées dans l'arbre, décision du 2026-11-10)

L'écran « Archives » disparaît en tant que tel. Ses deux usages sont repris ailleurs :
- **les connaissances accumulées sur une personne** : arbre en mode consultation (écran 10) → récapitulatif de la personne (écran 11) ;
- **les questions déjà posées** : Historique (écran 12).

Règle conservée : les mêmes informations pour tout le monde. Les faits pas encore posés n'apparaissent nulle part, y compris pour leur auteur (ils ne sont visibles que dans « Mes faits »).

**Existant** (`src/app/archive.tsx`) : choix de la personne centrale, puis liste des questions révélées la concernant, détail via `src/app/reveal.tsx`. À garder jusqu'à ce que les écrans 10 à 12 le remplacent entièrement : écrans 10 et 11 faits le 2026-11-11, mais l'accès au détail d'une question (et aux propositions de correction sur un fait ancien) n'existe encore que depuis `archive.tsx` — reste l'écran 12 (Historique) pour pouvoir le retirer sans perdre cet accès.

**Repris dans les écrans 11 et 12** (anciennes pistes d'enrichissement des archives) : regroupement par catégorie, auteur et anecdote de chaque fait, taux de bonnes réponses, recherche par mot-clé, frise chronologique de la vie d'une personne.


## 10. Arbre familial

But : **porte d'entrée vers les connaissances** de la famille (bouton « Consulter les connaissances » de l'accueil), et gestion des membres et des relations.

### Deux modes

- **Consultation** (mode d'arrivée) : l'arbre généalogique, épuré. Sur chaque personne, un petit compteur : « 5 souvenirs », plus « 2 à découvrir » pour ses faits pas encore posés (le nombre ne dévoile rien et donne envie de jouer). Toucher une personne → son récapitulatif (écran 11).
- **Modification** (bouton « Modifier » dans l'écran) : ajouter des membres, créer des relations (formulaire existant + nouveaux types ci-dessous). La modification reste dans l'écran de l'arbre, pas dans le menu burger.

### Existant (`src/app/family-tree.tsx`)

- Une carte par personne centrale avec son conjoint, ses parents, ses frères et sœurs et ses enfants, puis la liste des autres membres.
- Un formulaire pour lier deux personnes (« conjoint » ou « parent »), avec création à la volée d'une personne manquante.
- Lecture et ajout seulement : pas de suppression ni de modification d'une relation ou d'une personne.

### Quelle partie de la famille est affichée (décision du 2026-11-10)

La famille de l'appli, ce sont **les descendants d'un ancêtre commun, avec leurs conjoints**. Les conjoints (« pièces rapportées ») n'ont pas d'ascendance dans cette famille : ils l'auront dans leur propre famille.
- **Un couple n'a qu'un seul couple de parents** renseigné. Pas de « + Ajouter ses parents » sur un conjoint.
- **L'arbre affiché** est celui de l'ancêtre commun : on part de la première personne centrale, on remonte de parent en parent jusqu'au plus haut, puis on affiche toute sa descendance avec les conjoints (oncles, tantes, cousins compris). Si l'ancêtre le plus haut a des adelphes liés directement (`sibling_of`, sans parents connus), ils sont sur sa ligne, avec leurs descendants.
- **Tout le reste n'est pas affiché** : personnes sans aucune relation, petits groupes reliés entre eux mais pas à l'arbre principal, personnes centrales sans lien avec la première. Un **bouton avec alerte** (« 3 personnes sans relation ») les signale ; en mode Modifier, un encart les liste avec un bouton « Relier ».
- Cas limite : si les parents des deux conjoints sont quand même renseignés, l'arbre suit ceux du conjoint qui descend de l'ancêtre commun.
- Un seul conjoint par personne pour l'instant (pas de remariage). Rien de particulier pour les personnes décédées pour l'instant.

### Affichage et navigation (décision du 2026-11-10)

**Maquette** : « Quizamily – Arbre familial », lien et charte dans `design.md`, source dans `docs/maquettes/arbre/` (famille fictive sur 4 générations, 5 écrans : ouverture, déplacements, mode Modifier).

- **3 lignes visibles** : la génération centrée au milieu de l'écran (cartes en taille normale, sur une bande blanche), la génération précédente au-dessus et la suivante en dessous (cartes plus petites).
- **Glisser vers le haut ou le bas** change de génération, avec des **crans** : l'écran s'arrête sur une génération bien centrée en hauteur. Des points sur le bord droit indiquent la génération affichée.
- **Glisser à gauche ou à droite** parcourt la génération centrée, avec des crans **personne par personne** : à chaque cran, une personne est au centre de l'écran.
- **La ligne du dessus suit** : les parents de la personne centrée sont centrés au-dessus. Tant qu'on passe d'un adelphe à l'autre, elle ne bouge pas ; en passant à une autre fratrie, elle glisse jusqu'à centrer les nouveaux parents.
- **La ligne du dessous suit** : les enfants de la personne (du couple) centrée sont centrés en dessous.
- **Le conjoint** est juste à côté de la personne. Centrer l'un ou l'autre centre les mêmes parents (ceux du couple).
- **Placement** : tout l'arbre est calculé d'un bloc, chaque couple centré au-dessus de ses enfants, chaque descendance occupant sa propre largeur, même écartement sur toutes les lignes. Conséquence : une génération nombreuse élargit l'arbre et laisse des espaces entre les familles des autres lignes.
- **Traits de filiation** pour **toutes** les familles entre deux lignes visibles, toujours **à angle droit** (descente depuis le couple, barre horizontale, descente vers chaque enfant), **jamais obliques**. Ils sont persistants : tracés même s'ils sortent en partie de l'écran.
- **Amorces** : un petit trait vertical au-dessus de chaque personne ou couple de la ligne du haut qui a des parents, et sous chaque personne ou couple de la ligne du bas qui a des enfants, pour montrer que l'arbre continue.
- **Sur chaque personne** : initiale dans un rond de couleur, prénom, nombre de souvenirs ; sur la ligne centrale, en plus, « N à découvrir » (faits pas encore posés). La personne centrée a un contour bleu ; une personne centrale a une petite étoile bleue.
- **Ouverture** : centrée sur la première personne centrale, puis sur la dernière personne consultée (mémorisée sur l'appareil, par famille ; en changeant d'appareil, on revient sur la première personne centrale).
- **Mode Modifier** : titre « Modifier l'arbre », bouton « Terminé » ; un crayon sur chaque personne (toucher = la modifier) ; boutons en pointillés « + Frère ou sœur » (au bout de la fratrie centrée) et « + Enfant » (au bout des enfants du couple centré) ; encart des personnes à placer en bas.

**À tester en conditions réelles** : une génération de 8 ou 9 enfants, chacun avec un conjoint et plusieurs enfants (largeur de l'arbre, longueur des traits, confort du défilement).

### À faire

**Calcul du placement : fait le 2026-11-10** dans `src/lib/family-tree-layout.ts`, module pur (sans React, Expo ni Supabase), testé par `src/lib/family-tree-layout.test.ts` (`npm run test:layout`, 19 tests : famille d'exemple, personnes non reliées, ascendance d'un conjoint ignorée, adelphes `sibling_of`, relations incohérentes, grande fratrie de 9 enfants avec conjoints et 27 petits-enfants, 200 familles aléatoires, navigation, traits). Il fournit :
- `buildFamilyTree(personnes, relations, personneDeDépart)` : générations, couples, ancêtre commun, personnes non reliées ;
- `layoutFamilyTree(arbre)` : position horizontale de chaque personne et de chaque couple ;
- `rowOffsetsFor(placement, personneCentrée, milieuDeLÉcran)` : décalage de chaque ligne (crans) ;
- `moveFocus(placement, personne, "left" | "right" | "up" | "down")` : personne centrée après un cran ;
- `connectorSegments(placement, lignes, décalages)` : traits de couple, de filiation et amorces, à angle droit.

**Écran réécrit le 2026-11-10** (`src/app/family-tree.tsx`), avec ce module, et type de relation `sibling_of` ajouté en base (migration `20261110120000_sibling_relation.sql`). **Pas encore testé à l'écran** (voir la liste « À faire sur l'ordinateur avec Supabase » dans `roadmap.md`).

Ce qui est fait :
- 3 lignes, bande blanche sous la génération centrée, points de génération à droite, « Haut de l'arbre » en génération 0 ;
- glissement horizontal (crans personne par personne ; un glissement long fait plusieurs crans) et vertical (crans par génération), avec une animation qui repart de la position sous le doigt ;
- traits de couple, de filiation pour toutes les familles visibles et amorces, calculés par le module ;
- compteurs « N souvenirs » (faits révélés) et « N à découvrir » (faits pas encore posés) ;
- dernière personne consultée mémorisée sur l'appareil, par famille ;
- alerte « N personnes sans relation » (ouvre le mode Modifier) ;
- **touche une personne (2026-11-11)** : pas de navigation — l'arbre est poussé sur la gauche (~20 % de l'écran, le reste redevient plein écran en touchant « Modifier » ou en fermant le panneau) et un panneau apparaît à droite avec son récapitulatif (écran 11, voir plus bas), chargé via `get_archive_summary` (`src/lib/recap.ts` pour l'assemblage) ;
  - **À revoir (2026-11-18)** : les ~20 % ont été choisis au hasard ; sur un téléphone (390 px), l'arbre ne ferait plus qu'environ 80 px de large, moins d'une carte. Prévoir une autre présentation sur petit écran (voir « Points à décider » dans `roadmap.md`).
- mode Modifier : toucher une personne la sélectionne (ferme le panneau de consultation s'il était ouvert) ; boutons « + Conjoint·e » (si elle n'en a pas), « + Enfant » (enfant du couple), « + Frère ou sœur » (rattaché aux parents s'ils sont connus, sinon lien `sibling_of` ; pas proposé pour un conjoint), « Relier à une personne… » (conjoint·e / parent / enfant / frère ou sœur de, personnes sans relation en tête) ; encart des personnes à placer.

Écarts avec la maquette, à reprendre si besoin :
- les boutons d'ajout sont dans un panneau sous l'arbre, pas en cartes pointillées dans l'arbre ;
- pendant un glissement horizontal, seule la ligne centrale glisse de façon continue ; les lignes du dessus et du dessous se recalent d'un coup ;
- polices système : Fredoka et Nunito sont dans le projet depuis l'accueil (2026-11-11), mais l'écran de l'arbre ne les utilise pas encore ; icônes en caractères (★, ✎, ⚠, ‹) en attendant de vraies icônes ;
- le bandeau famille (nom, inviter, menu) existe sur l'accueil (2026-11-11) mais pas encore sur l'écran de l'arbre.

La condition « a des frères ou sœurs » du catalogue (écran 5) tient compte des liens `sibling_of` (`src/app/add-fact.tsx`).

**Plus de types de relation à la création** :
- ajouter « enfant » aux choix actuels (« conjoint », « parent »). Le résultat est le même que « parent » dans l'autre sens (`parent_of` avec les deux personnes inversées), mais c'est plus naturel selon la personne depuis laquelle on part ;
- ajouter « frère / sœur » (adelphe), pour lier directement deux personnes dont on ne connaît pas les parents (ex : les frères et sœurs d'une grand-mère). Demande un nouveau type de relation `sibling_of`, symétrique comme `spouse_of`. Dans l'arbre, les adelphes d'une personne sont alors ceux liés directement, plus ceux qui partagent un parent enregistré. La condition « a des frères ou sœurs » du catalogue (écran 5) doit tenir compte des deux cas.


## 11. Récapitulatif d'une personne

But : lire ce que la famille sait d'une personne, sous une forme agréable, et non comme une liste de faits l'un après l'autre.

**Fait le 2026-11-11.** Accès : depuis l'arbre en mode consultation (écran 10), en touchant une personne — panneau latéral, sans changer d'écran (voir écran 10).

**Nouveau comportement décidé et codé le 2026-11-20** (maquette « Coucher de soleil », voir `design.md` ; code dans `src/app/family-tree.tsx`, paramètres d'URL `?person=<id>&recap=1`) — remplace le panneau latéral, en particulier sur petit écran :
- le récapitulatif s'ouvre en **panneau qui monte du bas de l'écran** ; en même temps, la ligne de la personne touchée **remonte d'un cran** (à la place de la génération du dessus, qui sort de l'écran) pour laisser presque les deux tiers de l'écran au texte. C'est un simple décalage d'affichage, pas un défilement : à la fermeture, tout **redescend d'un cran** et on retrouve la disposition de départ ;
- les **traits de filiation restent dessinés** : ceux qui partent de la ligne remontée vers les enfants descendent et passent sous le panneau ; une amorce au-dessus de la ligne montre que l'arbre continue vers les parents ;
- panneau ouvert, **glisser la ligne à gauche ou à droite** change de personne et **met à jour le panneau** (feuilleter une fratrie, un couple) ;
- panneau ouvert, **pas de glissement vers le haut ou le bas** (pas de changement de génération) : on ferme d'abord le panneau, avec la croix ou en touchant en dehors du panneau, puis on navigue ;
- panneau ouvert, **toucher une autre personne visible de la même génération ouvre directement son récapitulatif** (pas besoin de fermer le panneau d'abord) ; **corrigé le 2026-11-23** (signalé par l'utilisateur) : un calque invisible plein écran, posé pour fermer le panneau au toucher d'une zone vide, était par-dessus les cartes de personnes et interceptait aussi leurs touches — cliquer sur une autre personne fermait donc juste le panneau au lieu d'ouvrir le sien. Le calque reste maintenant sous les cartes dans l'ordre d'empilement (`pointerEvents="none"`/`"box-none"` sur les éléments décoratifs ou conteneurs au-dessus, pour que les touches sur une zone vide les traversent) ;
- le texte du panneau **défile** quand la personne a beaucoup de souvenirs ;
- ouvert directement depuis un profil de l'accueil (écran 4), l'arbre arrive centré sur la personne, panneau déjà ouvert.

Affiche :
- en tête : le nom de la personne, bouton pour fermer le panneau ;
- une **mini-biographie rédigée**, regroupée par catégorie du catalogue (naissance et enfance, jeunesse, couple et installation, culture et premières fois, retraite, voyages et loisirs), dans l'ordre du catalogue (`sort_order`, pas la date de révélation). Exemple : « Juliette est née le 12/04/1950. Elle a eu chat comme animal de compagnie pendant son enfance. » ;
- uniquement les faits **déjà révélés** (mêmes informations pour tout le monde) ;
- s'il reste des faits pas encore posés : « N souvenir(s) à découvrir dans les prochains quiz ».

Rédaction sans IA : chaque template du catalogue a une **phrase de récapitulatif** (champ `recap` dans `question-templates.toml`, ex : « {Sujet} est {né|née} le {réponse}. »), et `src/lib/recap.ts` assemble les phrases par catégorie. Accord au féminin géré pour `recap` (`{forme_homme|forme_femme}`, `{Sujet}`/`{sujet}` → « Il »/« il » ou « Elle »/« elle ») ; **simplification actée le 2026-11-11** par rapport à la convention `<sujet>` d'origine : le pronom en tête de la toute première phrase de la bio est remplacé par le prénom (ex : « Juliette est née... » puis « Elle a... » pour la suite), plutôt que de répéter le prénom partout. Les textes de question (`text`) restent au masculin (chantier séparé, voir `question-templates.toml`).

**Questions accordées aussi (2026-11-18)** : les textes de question (`template_text`) utilisent la même notation `{forme_homme|forme_femme}` ; la règle est partagée dans `src/lib/gender.ts` (questions et récapitulatif côté app) et `apply_gender_tokens()` côté base (textes assemblés par `get_revealed_question` et `get_archive_summary`). Masculin si le genre est inconnu.

Actions :
- **Pas encore fait** : toucher une phrase → le détail de la question (même contenu que la révélation, écran 8) : réponses de chacun, auteur, anecdote, et proposition de correction. Pour l'instant, cet accès au détail (et aux propositions de correction sur un fait plus ancien que la dernière révélation) n'existe que via `src/app/archive.tsx`, gardé en attendant que cette action soit reprise ici et que l'écran 12 existe (voir écran 9 et `roadmap.md`).

Pistes pour plus tard : frise chronologique construite à partir des faits de type date et année ; photos et enregistrements (pièces jointes).


## 12. Historique

But : revoir les quiz passés et les scores.

Affiche :
- la liste des **questions déjà posées**, de la plus récente à la plus ancienne : question, bonne réponse, date de révélation, taux de bonnes réponses (« 3 joueurs sur 5 avaient trouvé ») ;
- le **tableau des scores** de la famille : score cumulé de chaque joueur (« 12 bonnes / 18 posées »), et score de contribution (nombre de souvenirs ajoutés).

Actions :
- Ouvrir une question → son détail (écran 8, avec proposition de correction).

**À construire** : le score cumulé sur plusieurs sessions n'existe pas encore (seul le résultat de chaque question est calculé), il demande une agrégation en base.

