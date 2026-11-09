-- Corrige une fuite d'anonymat repérée par l'utilisateur : l'auteur voyait "qui a répondu"
-- (par nom, en temps réel) sur l'écran "Ma question" ET les groupes de réponses en attente
-- de validation au fil de l'eau — un groupe de taille 1 apparaissant juste après qu'un ✓
-- s'affiche pour une personne était trivialement attribuable à cette personne.
--
-- Solution retenue (proposée par l'utilisateur) : ne montrer les groupes (en attente comme
-- déjà auto-validés - même risque de corrélation sur les deux) que lorsque plus des 2/3 des
-- destinataires ont répondu, OU que le moment de la première relance à l'auteur est atteint
-- (pas de vraies notifications encore, mais le même calcul : "dès que tous ont répondu, ou au
-- plus tard 24h avant la deadline", voir concept.md "Validation des réponses libres").
-- Avec un petit nombre de destinataires, les 2/3 arrondissent de fait à "tout le monde" (donc
-- la fuite est fermée complètement) ; avec une famille plus nombreuse, la validation "au fil
-- de l'eau" reste possible un peu plus tôt, avec un groupe suffisamment grand pour rester
-- anonyme.

create or replace function get_pending_validations(p_quiz_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_author_person_id uuid;
  v_closes_at timestamptz;
  v_total_recipients int;
  v_answered_recipients int;
  v_ready boolean;
  v_result jsonb;
begin
  select qs.family_id, f.author_person_id, qs.closes_at
    into v_family_id, v_author_person_id, v_closes_at
    from quiz_questions qq
    join facts f on f.id = qq.fact_id
    join quiz_sessions qs on qs.id = qq.session_id
    where qq.id = p_quiz_question_id;

  if v_family_id is null then
    raise exception 'Question introuvable.';
  end if;

  if v_author_person_id is distinct from my_person_id(v_family_id) then
    raise exception 'Seul l''auteur du fait peut valider les réponses.';
  end if;

  select count(*), count(*) filter (where result <> 'unanswered')
    into v_total_recipients, v_answered_recipients
    from question_recipients
    where quiz_question_id = p_quiz_question_id;

  v_ready := (v_total_recipients > 0 and v_answered_recipients::numeric / v_total_recipients > 2.0 / 3.0)
    or (now() >= v_closes_at - interval '24 hours');

  select jsonb_build_object(
    'readyToValidate', v_ready,
    'autoValidated', case when not v_ready then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('value', g.answer_given, 'count', g.cnt) order by g.cnt desc)
      from (
        select answer_given, count(*) as cnt
        from question_recipients
        where quiz_question_id = p_quiz_question_id and result = 'correct'
        group by answer_given
      ) g
    ), '[]'::jsonb) end,
    'pending', case when not v_ready then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('value', g.answer_given, 'count', g.cnt, 'recipientIds', g.ids) order by g.cnt desc)
      from (
        select answer_given, count(*) as cnt, jsonb_agg(id) as ids
        from question_recipients
        where quiz_question_id = p_quiz_question_id and result = 'pending_validation'
        group by answer_given
      ) g
    ), '[]'::jsonb) end
  )
  into v_result;

  return v_result;
end;
$$;
