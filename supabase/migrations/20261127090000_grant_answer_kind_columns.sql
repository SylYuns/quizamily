-- Corrige une régression introduite par l'étape 6 quater : facts.answer_kind et
-- quiz_questions.answer_kind_snapshot (migration 20261126130000_question_templates_formes.sql)
-- n'avaient jamais été ajoutées à la liste explicite de colonnes lisibles par le rôle
-- authenticated (20261110140000_hide_answers_from_direct_reads.sql, privilèges par colonne,
-- pas par ligne) — Postgres refuse alors TOUTE la requête dès qu'une colonne demandée n'est
-- pas accordée ("permission denied for table facts/quiz_questions"), pas seulement cette
-- colonne. Repéré en testant Répondre avec un compte joueur (pas service_role, qui contourne
-- les privilèges) : aucune question ne s'affichait, la liste "Mes questions"/"Déjà
-- renseignées" d'Ajouter un souvenir était silencieusement vide depuis le même commit.

grant select (answer_kind) on facts to authenticated;
grant select (answer_kind_snapshot) on quiz_questions to authenticated;
