# Modèle de données

```
families
  id, name, created_by, created_at

persons
  id, family_id
  kind                   -- 'player' | 'profile' (sans compte) | 'referenced' (juste mentionnée)
  user_id                -- nullable, rempli si kind='player'
  display_name, relationship_label
  is_central              -- true si "personne centrale"
  is_deceased
  created_by, created_at

relationships
  id, family_id, person_a_id, person_b_id
  relation_type            -- 'parent_of' | 'spouse_of'
  created_by, created_at

invites
  id, family_id, token, created_by, expires_at, used_by_person_id, used_at

question_templates         -- catalogue global, édité par nous (pas par les familles)
  id, category, template_text, slot_config, answer_input_kind
  -- answer_input_kind: 'date' | 'year' | 'age' | 'number' | 'country' | 'city' | 'place' | 'first_name' | 'list' | 'free_text'
  -- 'place' : l'auteur du fait choisit entre pays et commune ; 'list' : liste de référence enrichissable
  -- catalogue source : docs/question-templates.toml

facts
  id, family_id, template_id
  subject_person_id, related_person_id   -- related_person_id nullable (si le template implique une relation)
  author_person_id
  answer_value, answer_history           -- jsonb: historique des corrections
  pending_correction                      -- jsonb nullable: proposition en attente de validation
  context_text, context_media_url
  status, created_at

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
- **`free_text`** : l'auteur du fait et les joueurs saisissent librement. Une réponse identique à la bonne réponse après normalisation (minuscules, sans accents, sans espaces superflus, tirets ni apostrophes) est validée automatiquement ; les autres passent en `pending_validation` jusqu'à la décision du validateur. Pas de leurres QCM pour ce type.
- **Destinataires** : `question_recipients` n'inclut jamais l'auteur du fait ; il inclut le sujet s'il a un compte (`kind='player'`).
- **`answer_value_snapshot`** sur `quiz_questions` permet de recalculer le résultat de chaque `question_recipients` après une correction : comparer `answer_given` à la fois à l'ancienne valeur (snapshot) et à la nouvelle valeur (`facts.answer_value` courant).
- **`contribution_stats`** (score de contribution par membre) est une vue calculée à partir de `facts.author_person_id`, pas une table dédiée.
- Les leurres de QCM sont piochés parmi les `answer_value` déjà utilisées dans la famille pour le même `answer_input_kind` — pas de génération manuelle.
