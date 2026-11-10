# Modèle de données

```
families
  id, name, created_by, created_at

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
  -- catalogue source : docs/question-templates.toml

list_items                 -- valeurs des listes de référence enrichissables (animaux, sports, voitures, metiers, films, personnalites)
  id, list_name, value
  status                    -- 'pending' (visible seulement dans la famille qui l'a ajoutée) | 'approved' (global, visible de toutes les familles)
  family_id                 -- rempli si status='pending' ; null une fois 'approved'
  created_by_person_id, created_at

facts
  id, family_id, template_id
  subject_person_id, related_person_id   -- related_person_id nullable (si le template implique une relation)
  slot_values                             -- jsonb nullable : éléments choisis par l'auteur (ex : {"pays": "Italie"})
  author_person_id
  answer_value, answer_history           -- jsonb: historique des corrections
  pending_correction                      -- jsonb nullable: proposition en attente de validation
  context_text
  status, created_at

fact_attachments
  id, fact_id, kind        -- 'image' | 'audio'
  url, author_person_id, created_at

quiz_sessions
  id, family_id, status, opens_at, closes_at

quiz_questions
  id, session_id, fact_id
  answer_value_snapshot    -- valeur correcte au moment de la pioche (sert au recalcul si correction ultérieure)
  validator_person_id      -- free_text : auteur du fait, ou membre ayant pris la main
  validation_completed_at  -- nullable ; free_text : la question n'est révélée qu'une fois rempli
  taken_over_at            -- nullable, rempli si un autre membre a pris la main

question_recipients
  id, quiz_question_id, person_id
  answer_given, result      -- 'correct' | 'incorrect' | 'unanswered' | 'voided' | 'pending_validation'
  answered_at
  validated_by_person_id, validated_at   -- nullable ; null si validation automatique (réponse identique après normalisation)

fact_reactions
  id, fact_id, person_id, emoji, created_at

fact_comments
  id, fact_id, person_id, body, created_at
```

## Notes de conception

- **`answer_input_kind`** détermine le widget de saisie (date picker, dropdown pays, autocomplétion ville/prénom basée sur `SELECT DISTINCT answer_value` de la famille, etc.). Pour les types guidés, la validation est entièrement automatique.
- **`free_text`** : l'auteur du fait et les joueurs saisissent librement. Une réponse identique à la bonne réponse après normalisation (minuscules, sans accents, sans espaces superflus, tirets ni apostrophes) est validée automatiquement ; les autres passent en `pending_validation` jusqu'à la décision du validateur.
- **Réponse des joueurs** : les joueurs répondent avec le même widget que l'auteur du fait (déterminé par `answer_input_kind`), pas de QCM en V1.
- **Risque identifié (2026-11-09), corrigé le 2026-11-10** : sur l'écran de réponse, `AnswerInput` (option `hideFamilyItems`) ne propose plus que les valeurs validées de la liste globale. Constat d'origine : pour le type `list`, le widget de réponse propose en autocomplétion les valeurs déjà connues (`list_items`), exactement comme à la création du fait. Si peu de valeurs existent pour une liste donnée dans une famille (cas extrême : une seule, celle que l'auteur vient d'ajouter en créant le fait), la suggestion révèle trivialement la bonne réponse avant même de répondre. Pas un problème avec peu de testeurs, mais à surveiller avant une ouverture plus large — pistes possibles : mélanger les suggestions avec d'autres valeurs de la liste globale, ou ne pas distinguer visuellement "la seule option" comme suspecte.
- **Unicité des faits** : un seul fait par combinaison (`template_id`, `subject_person_id`, `related_person_id`, valeur des éléments choisis comme `<pays>`). Les éléments choisis doivent donc être stockés sur `facts` (ex : colonne jsonb `slot_values`).
- **Destinataires** : `question_recipients` n'inclut jamais l'auteur du fait ; il inclut le sujet s'il a un compte (`kind='player'`).
- **`answer_value_snapshot`** sur `quiz_questions` permet de recalculer le résultat de chaque `question_recipients` après une correction : comparer `answer_given` à la fois à l'ancienne valeur (snapshot) et à la nouvelle valeur (`facts.answer_value` courant).
- **`contribution_stats`** (score de contribution par membre) est une vue calculée à partir de `facts.author_person_id`, pas une table dédiée.
- **`gender`** sert à filtrer les templates à condition (`femme`/`homme`) et à l'accord grammatical des questions (solution technique à définir, voir `question-templates.toml`). Si non renseigné, un template conditionné par le genre n'est simplement pas proposé (défaut permissif, pas de blocage).
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