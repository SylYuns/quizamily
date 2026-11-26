# Modèle de données

```
families
  id, name, created_by, created_at
  emblem_symbol           -- À AJOUTER (2026-11-24) : symbole dessiné ('vache', 'lezard'…, liste fermée côté appli)
  emblem_color            -- À AJOUTER : une des 8 couleurs ('bleu', 'rouge', 'jaune', 'vert', 'orange', 'rose', 'violet', 'brun')
  emblem_letters          -- À AJOUTER : 2 lettres en majuscules, par défaut les 2 premières du nom
  invite_policy           -- À AJOUTER (2026-11-26) : 'admin_only' (par défaut) | 'all_members' — qui peut créer/partager le lien
  entry_question          -- À AJOUTER : question d'entrée (null = désactivée, par défaut)
  entry_answer            -- À AJOUTER : sa réponse (comparée après normalisation, comme les réponses libres) ;
                          -- jamais renvoyée au client : vérifiée par une fonction security definer
-- invites.expires_at : rempli à la création (48 h), plus de lien sans expiration ; « Générer un nouveau lien » expire l'ancien

family_bans                -- À AJOUTER (2026-11-26) : comptes bloqués par l'admin (« Retirer et bloquer »)
  family_id, user_id, banned_by, created_at
  primary key (family_id, user_id)
                          -- join_family / claim_person_with_invite refusent un compte bloqué

member_joined_events       -- À AJOUTER (ou dérivé de persons.joined_at + invites.created_by) : pour l'alerte
                          -- « Claire a rejoint la famille, invitée par Bernard » à toute la famille

persons
  id, family_id
  kind                   -- 'player' | 'profile' (sans compte) | 'referenced' (juste mentionnée)
  user_id                -- nullable, rempli si kind='player'
  first_name, last_name   -- stockés séparément (pas juste display_name) pour rester faciles à
                           -- corriger/trier individuellement ; last_name peut être vide ('') si
                           -- pas encore connu, jamais null
  display_name            -- colonne générée (first_name || ' ' || last_name, trim) : toujours
                           -- à jour automatiquement, en lecture seule (ne pas l'écrire dans un
                           -- insert/update, Postgres refuse)
  relationship_label
  gender                   -- 'homme' | 'femme' ; nullable (pas toujours connu, ex: personne juste référencée)
  is_central              -- true si "personne centrale"
  is_deceased
  created_by, created_at

relationships
  id, family_id, person_a_id, person_b_id
  relation_type            -- 'parent_of' (person_a = parent, person_b = enfant) | 'spouse_of' | 'sibling_of'
                           -- sibling_of (2026-11-10) : lien direct entre adelphes dont on ne connaît pas les
                           -- parents ; symétrique comme spouse_of (une ligne par paire, sens quelconque)
  created_by, created_at

invites
  id, family_id, token, created_by, expires_at
  -- lien partagé avec plusieurs membres (pas à usage unique), donc pas de suivi "utilisé par X"

question_templates         -- catalogue global, édité par nous (pas par les familles)
  id, category, template_text, slot_config, answer_input_kind
  -- answer_input_kind: 'date' | 'year' | 'age' | 'number' | 'country' | 'city' | 'place' | 'first_name' | 'list' | 'free_text'
  -- 'place' : l'auteur du fait choisit entre pays et commune ; 'list' : liste de référence enrichissable
  -- list_category : catégorie de list_items proposée (ex : 'musique' pour premier-concert-artiste) ; null = toutes
  -- catalogue source : docs/question-templates.toml
  -- À AJOUTER (décidé le 2026-11-24, « forme de la réponse », voir ecrans.md écran 5) :
  --   answer_forms   text[] : types entre lesquels l'auteur choisit, le premier = answer_input_kind
  --                  (null = un seul type) ; ex : {date,year,age}
  --   template_text_neutral  question sans présumer du type (« Quand… », « Où… »), pour la liste
  --   form_texts     jsonb : {"year": {"text": "...", "recap": "..."}, ...} pour les types autres
  --                  que celui par défaut (TOML : formes, text_neutre, [template.forme.<type>])

list_items                 -- valeurs des listes de référence enrichissables (animaux, sports, voitures, metiers, films, personnalites)
  id, list_name, value
  category                  -- sous-liste (ex : 'musique', 'politique' pour personnalites) ; null pour les listes non découpées
  search_key                -- normalize_answer_text(value), rempli par trigger ; sert à search_list_items()
  -- sources : data/listes/ (voir data/listes/LISEZMOI.md), migration générée par scripts/build-list-items.mjs
  -- recherche : search_list_items(list_name, query, category, family_id, limit) — droits de l'appelant (RLS)
  status                    -- 'pending' (visible seulement dans la famille qui l'a ajoutée) | 'approved' (global, visible de toutes les familles)
  family_id                 -- rempli si status='pending' ; null une fois 'approved'
  created_by_person_id, created_at

facts
  id, family_id, template_id
  subject_person_id, related_person_id   -- related_person_id nullable (si le template implique une relation)
  slot_values                             -- jsonb nullable : éléments choisis par l'auteur (ex : {"pays": "Italie"})
  author_person_id
  answer_value, answer_history           -- jsonb: historique des corrections
  answer_kind                             -- À AJOUTER (2026-11-24) : type de réponse choisi par l'auteur parmi
                                          -- question_templates.answer_forms ; null = answer_input_kind du template.
                                          -- Modifiable tant que le fait n'est pas posé (comme la réponse).
  pending_correction                      -- jsonb nullable: proposition en attente de validation
  context_text
  status, created_at

fact_attachments
  id, fact_id, kind        -- 'image' | 'audio'
  url, author_person_id, created_at

quiz_sessions
  id, family_id, status, opens_at, closes_at
  revealed_at              -- À AJOUTER (2026-11-24, Historique) : moment réel de la révélation, rempli au passage
                           -- status 'open' → 'closed' (3 fonctions : révélation manuelle, automatique, règles de
                           -- délai) ; reprise = closes_at pour les semaines déjà terminées. closes_at est la date
                           -- limite prévue, pas le moment de la révélation (qui peut être plus tôt). Sert à savoir
                           -- dans quel mois compte une question (fuseau Europe/Paris).

quiz_questions
  id, session_id, fact_id
  answer_value_snapshot    -- valeur correcte au moment de la pioche (sert au recalcul si correction ultérieure)
  -- À AJOUTER (2026-11-24) : answer_kind_snapshot, le type de réponse du fait au moment de la pioche
  -- (sert à submit_answer pour comparer, à Répondre pour afficher le bon champ, à la révélation)
  validator_person_id      -- free_text : auteur du fait, ou membre ayant pris la main
  validation_completed_at  -- nullable ; free_text : la question n'est révélée qu'une fois rempli
  taken_over_at            -- nullable, rempli si un autre membre a pris la main

question_recipients
  id, quiz_question_id, person_id
  answer_given, result      -- 'correct' | 'incorrect' | 'unanswered' | 'voided' | 'pending_validation'
  answered_at
  validated_by_person_id, validated_at   -- nullable ; null si validation automatique (réponse identique après normalisation)

-- À AJOUTER (2026-11-26) : rattrapage des questions posées avant l'arrivée d'un membre (ecrans.md, « Arriver en
-- cours de route »). Table à part de question_recipients pour que ces réponses ne comptent dans AUCUNE statistique.
catchup_answers
  id, quiz_question_id, person_id
  answer_given             -- nullable (null si passée)
  result                   -- 'correct' | 'incorrect' | 'shown' (saisie libre identique à aucune réponse déjà jugée :
                           --  réponse affichée, ni gagné ni perdu ; si elle est identique à une réponse acceptée ou
                           --  refusée par l'auteur, même décision → 'correct' / 'incorrect')
                           -- | 'skipped' (« Passer et voir la réponse » ou « Tout dévoiler »)
  answered_at
  unique (quiz_question_id, person_id)
-- et sur persons (par famille) :
--   joined_at              -- À AJOUTER : moment où le joueur a réellement rejoint la famille (accepté) ; les questions
--                             révélées avant cette date sont « d'avant son arrivée »
--   catchup_mode           -- À AJOUTER : null (pas encore choisi / rien à rattraper) | 'rattrapage' | 'tout_voir'
-- Les bonnes réponses des questions déjà révélées restent lisibles par tous les membres : le masquage en mode
-- rattrapage est une règle de jeu côté appli, pas une protection (contrairement aux questions en cours).

-- À AJOUTER (2026-11-24) : archive des stats du mois pour l'Historique (écran 12), figée le 1er de chaque mois
-- pour le mois précédent par une tâche planifiée (pg_cron, comme la pioche et la révélation). Le mois en cours est
-- calculé en direct ; une fois figé, un mois ne bouge plus (une correction acceptée après coup ne le modifie pas).
monthly_person_stats       -- une ligne par joueur et par mois
  family_id, month (date : 1er jour du mois), person_id
  correct_count            -- bonnes réponses (result = 'correct') aux questions révélées dans le mois
  received_count           -- questions reçues (l'auteur d'un fait ne reçoit pas sa propre question)
  answered_count           -- réponses données (≠ 'unanswered')
  facts_added_count        -- souvenirs ajoutés dans le mois (facts.created_at)
  authored_count           -- questions du mois dont il était l'auteur (« Les auteurs du mois »)
  best_streak              -- plus longue suite de bonnes réponses d'affilée dans le mois, dans l'ordre des révélations
  podium_rank              -- 1, 2, 3 ou null (égalités : même rang, la marche est partagée)
  titles                   -- text[] : 'coup_de_maitre' | 'plume_or' | 'toujours_present'
  primary key (family_id, month, person_id)

monthly_family_stats       -- une ligne par famille et par mois
  family_id, month
  questions_revealed       -- nombre de questions révélées dans le mois
  correct_total, expected_total   -- jauge « Ensemble, N bonnes réponses sur M »
  primary key (family_id, month)

fact_reactions              -- existe déjà (migration init) ; à compléter (2026-11-25) :
  id, fact_id, person_id, emoji, created_at
                           -- emoji limité aux 6 de l'appli (check : 😮 😂 ❤️ 👏 🤔 👍) ; unique (fact_id, person_id, emoji) :
                           -- plusieurs emojis différents par personne, chacun une fois ; toucher = ajouter/retirer

fact_comments               -- existe déjà ; à compléter (2026-11-25) :
  id, fact_id, person_id, body, created_at
  updated_at                -- À AJOUTER : modification de son propre commentaire (« modifié »)
                           -- suppression : seulement son propre commentaire ; texte seul (pas de photo : les photos iront
                           -- sur le souvenir lui-même, fact_attachments)

fact_comment_reads          -- À AJOUTER (2026-11-25) : pour signaler les nouveaux commentaires (accueil, Historique)
  person_id, fact_id, last_read_at
  primary key (person_id, fact_id)
                           -- mis à jour quand le joueur ouvre la discussion ; « nouveaux » = commentaires des autres
                           -- créés après last_read_at (ou tous, s'il n'y a pas de ligne)
```

## Notes de conception

- **Réactions et commentaires (conçu le 2026-11-25)** : réagir et commenter seulement sur un souvenir **déjà révélé** dans la famille (vérifié côté serveur : la question est dans une session `closed`), par un membre de la famille (`is_family_member`) ; pas de limite de temps. Détail de l'écran : `ecrans.md`, écran 8.
- **Historique : stats du mois (décidé le 2026-11-24)** : mois **calendaire** (fuseau Europe/Paris), d'après `quiz_sessions.revealed_at`. Mois en cours : calculé en direct par une fonction serveur ; mois terminés : lus dans `monthly_person_stats` / `monthly_family_stats`, **figées le 1er du mois** (choix de Sylvain, plutôt que tout recalculer : le palmarès ne change plus après coup). Règles de calcul : podium = **bonnes réponses seulement** (ni souvenirs ajoutés ni participation, ni point compensatoire pour les auteurs — refusé par Sylvain : « ça n'a pas de sens ») ; comptes faits sur les **questions reçues** ; Coup de maître = seul joueur à avoir trouvé une question du mois ; Plume d'or = le plus de souvenirs ajoutés ; Toujours présent = a répondu à toutes les questions reçues ; égalités partagées partout. Lecture : membres de la famille (RLS `is_family_member`) ; écriture : seulement la tâche planifiée (fonction `security definer`).
- **Emblème de la famille (décidé le 2026-11-24, à coder)** : `families.emblem_symbol`, `emblem_color`, `emblem_letters`, remplis à la création (tirage au hasard proposé, modifiable). Les familles existantes reçoivent un emblème au hasard dans la migration. **Seul le créateur (`families.created_by`) peut les modifier** : fonction `security definer` dédiée (ou policy `update` limitée à `created_by = auth.uid()` et à ces 3 colonnes), les autres membres ne peuvent que les lire. Voir `ecrans.md`, « Règles communes ».
- **`answer_input_kind`** détermine le widget de saisie (date picker, dropdown pays, autocomplétion ville/prénom basée sur `SELECT DISTINCT answer_value` de la famille, etc.). Pour les types guidés, la validation est entièrement automatique.
- **`free_text`** : l'auteur du fait et les joueurs saisissent librement. Une réponse identique à la bonne réponse après normalisation (minuscules, sans accents, sans espaces superflus, tirets ni apostrophes) est validée automatiquement ; les autres passent en `pending_validation` jusqu'à la décision du validateur.
- **Réponse des joueurs** : les joueurs répondent avec le même widget que l'auteur du fait (déterminé par `answer_input_kind`), pas de QCM en V1.
- **Risque identifié (2026-11-09), corrigé le 2026-11-10** : sur l'écran de réponse, `AnswerInput` (option `hideFamilyItems`) ne propose plus que les valeurs validées de la liste globale. Constat d'origine : pour le type `list`, le widget de réponse propose en autocomplétion les valeurs déjà connues (`list_items`), exactement comme à la création du fait. Si peu de valeurs existent pour une liste donnée dans une famille (cas extrême : une seule, celle que l'auteur vient d'ajouter en créant le fait), la suggestion révèle trivialement la bonne réponse avant même de répondre. Pas un problème avec peu de testeurs, mais à surveiller avant une ouverture plus large — pistes possibles : mélanger les suggestions avec d'autres valeurs de la liste globale, ou ne pas distinguer visuellement "la seule option" comme suspecte.
- **Unicité des faits** : un seul fait par combinaison (`template_id`, `subject_person_id`, `related_person_id`, valeur des éléments choisis comme `<pays>`). Les éléments choisis doivent donc être stockés sur `facts` (ex : colonne jsonb `slot_values`).
- **Destinataires** : `question_recipients` n'inclut jamais l'auteur du fait ; il inclut le sujet s'il a un compte (`kind='player'`).
- **`answer_value_snapshot`** sur `quiz_questions` permet de recalculer le résultat de chaque `question_recipients` après une correction : comparer `answer_given` à la fois à l'ancienne valeur (snapshot) et à la nouvelle valeur (`facts.answer_value` courant).
- **`contribution_stats`** (score de contribution par membre) est une vue calculée à partir de `facts.author_person_id`, pas une table dédiée.
- **`list_items` (état au 2026-11-19)** : listes préparées (`data/listes/`, voir « Feuille de route », étape 2, point 5 dans `roadmap.md`) ; films et personnalités restent à générer depuis Wikidata. Aucun mécanisme ne fait encore passer une valeur `pending` d'une famille en `approved` (liste globale). En réponse, un joueur ne voit que les valeurs `approved` : une valeur ajoutée par l'auteur du fait n'est donc pas proposée aux joueurs tant qu'elle n'est pas validée (ils doivent la taper en entier).
- **`gender`** sert à filtrer les templates à condition (`femme`/`homme`) et à l'accord grammatical des questions et du récapitulatif (notation `{forme_homme|forme_femme}`, `src/lib/gender.ts` côté app et `apply_gender_tokens()` côté base, 2026-11-18 ; masculin si non renseigné). Si non renseigné, un template conditionné par le genre n'est simplement pas proposé (défaut permissif, pas de blocage).
- **`fact_attachments`** : un fait peut avoir plusieurs pièces jointes (photo d'archive, enregistrement audio), affichées à la révélation comme le contexte texte. Fonctionnalité repoussée après le MVP (voir `roadmap.md`), mais le modèle de données la supporte dès maintenant.
- **RLS en place, mais incomplet par design pour l'instant** (voir `supabase/migrations/20261106130000_rls_policies.sql`, `20261109170000_question_recipients_answer_policy.sql` et `20261109190000_reveal_and_secure_answers.sql`) : l'accès est scopé par famille partout, mais des points restent volontairement en dehors de la RLS générique :
  - **Résolu (2026-11-09)** : `facts.answer_value` / `quiz_questions.answer_value_snapshot` ne sont plus envoyés au client avant la révélation. Pas via une policy RLS (qui filtre par ligne, pas par colonne) : via des fonctions `security definer` dédiées — `submit_answer` calcule juste/faux côté serveur sans jamais renvoyer la bonne réponse, `reveal_current_question` déclenche la révélation (auteur uniquement, une fois tout le monde répondu), `get_revealed_question` expose tout une fois la session fermée. La policy d'écriture directe sur `question_recipients` (ajoutée avec l'écran "répondre") a été retirée : elle aurait permis à un joueur de s'auto-attribuer "juste" sans passer par `submit_answer`. **Complété le 2026-11-10** (migration `20261110140000_hide_answers_from_direct_reads.sql`) : `facts.answer_value`, `answer_history`, `pending_correction` et `quiz_questions.answer_value_snapshot` ne sont plus lisibles du tout par le rôle `authenticated` (privilèges par colonne : `revoke select` sur la table, `grant select` sur les autres colonnes). L'appli lit ces valeurs par `get_fact_answer(fact)` (auteur du fait, ou tout membre une fois le fait révélé) et `get_my_fact_answers(famille)` (« Mes faits »). L'écriture par l'auteur et les fonctions `security definer` ne sont pas concernées. Conséquence : ne jamais faire de `select *` (ni d'embed `facts (*)`) sur ces deux tables côté client, la requête serait refusée.
  - `question_recipients` ne laisse chacun voir que sa propre réponse tant que la session est `open` ; une fois `closed` (révélée), `get_revealed_question` expose les réponses de tout le monde (toujours pas une policy RLS élargie, pour les mêmes raisons).
  - **Résolu (2026-11-09)** : validation des réponses libres (écran 7, `src/app/validate.tsx`) via `get_pending_validations`/`validate_pending_answers` (`security definer`, voir `supabase/migrations/20261109200000_validate_free_text_answers.sql`), auteur uniquement — ces fonctions ne renvoient jamais qui a donné quelle réponse (anonymat du concept), seulement la valeur groupée et son nombre d'occurrences. `reveal_current_question` refuse désormais de révéler tant qu'il reste des réponses "en attente de validation" (avant, elles étaient silencieusement comptées incorrectes). Pas encore de "prise de main" (un autre joueur reprenant la validation après 7 jours) ni de notifications/relances à l'auteur.
  - **Résolu (2026-11-09, suite)** : fuite d'anonymat repérée par l'utilisateur — `get_pending_validations` exposait ses groupes en temps réel, ce qui, combiné à "qui a répondu" (visible par nom sur l'écran "Ma question"), rendait un groupe de taille 1 trivialement attribuable à la personne dont le ✓ venait d'apparaître. Corrigé (`supabase/migrations/20261109210000_gate_validation_anonymity.sql`) : la fonction ne renvoie des groupes (en attente et auto-validés) que si plus des 2/3 des destinataires ont répondu, ou si on est à moins de 24h de la deadline (même calcul que la première relance prévue dans `concept.md`, pas encore de vraies notifications).
  - **Résolu (2026-11-09, suite)** : corrections (écran 8, voir `ecrans.md`) via `propose_correction`/`validate_correction` (`security definer`, voir `supabase/migrations/20261109220000_corrections.sql`) — n'importe quel membre sauf l'auteur propose, l'auteur valide, et une correction acceptée recalcule rétroactivement `question_recipients.result` ('voided' pour ceux qui avaient répondu l'ancienne valeur et étaient comptés "correct", 'correct' pour ceux qui avaient répondu la nouvelle) sur **toutes** les sessions ayant utilisé ce fait, pas que la dernière. `facts.answer_value` change ; `quiz_questions.answer_value_snapshot` ne change jamais (reste la valeur affichée au moment de la pioche, sert de référence "ancienne valeur" pour le recalcul).
- **Rejoindre une famille** se fait via deux fonctions `security definer` (`supabase/migrations/20261106150000_invite_join_flow.sql`), pas directement par des policies sur `invites`/`families` : un visiteur pas encore membre ne peut pas les lire via RLS normale.
  - `get_invite_family_name(token)` : aperçu du nom de la famille avant de rejoindre.
  - `join_family_with_invite(token, first_name, last_name, gender)` : crée la fiche `persons` (`kind='player'`) du nouvel arrivant. Ne redemande pas son lien de parenté avec chaque personne centrale : `relationship_label` reste pour l'instant un champ simple posé par le créateur de la famille sur sa propre perception (ex: "Grand-mère" = grand-mère du créateur), pas une relation par paire (créateur, joueur, personne centrale) — un vrai arbre par paires existe maintenant via `relationships` (arbre familial, voir `ecrans.md`), mais `relationship_label` lui-même n'a pas été migré vers ce modèle.
- **`persons.first_name`/`last_name` séparés (2026-11-10)** : jusqu'ici un seul champ `display_name` texte libre, rempli en concaténant prénom/nom côté client dès la création. Migré vers deux colonnes stockées (`last_name` peut être `''`, jamais `null`) + `display_name` devenu une colonne générée (`first_name || ' ' || last_name`, stored). Toute lecture existante de `display_name` continue de fonctionner sans changement ; un insert/update ne peut plus fournir `display_name` directement (Postgres le refuse), il faut écrire `first_name`/`last_name`. Permet de corriger un nom de famille manquant (ex: "Dédé") directement dans Table Editor sans retaper le prénom.