-- Écran 7 "Valider les réponses libres" : l'auteur accepte/refuse les réponses en saisie
-- libre qui ne correspondaient pas exactement à la bonne réponse après normalisation (voir
-- submit_answer dans 20261109190000_reveal_and_secure_answers.sql). La validation est
-- anonyme (voir concept.md) : les fonctions ci-dessous ne renvoient jamais qui a donné quelle
-- réponse, seulement la valeur, son nombre d'occurrences, et les ids de ligne nécessaires
-- pour appliquer la décision (pas des informations identifiantes pour le validateur).

-- ---------- get_pending_validations ----------

create or replace function get_pending_validations(p_quiz_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_author_person_id uuid;
  v_result jsonb;
begin
  select qs.family_id, f.author_person_id
    into v_family_id, v_author_person_id
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

  select jsonb_build_object(
    'autoValidated', coalesce((
      select jsonb_agg(jsonb_build_object('value', g.answer_given, 'count', g.cnt) order by g.cnt desc)
      from (
        select answer_given, count(*) as cnt
        from question_recipients
        where quiz_question_id = p_quiz_question_id and result = 'correct'
        group by answer_given
      ) g
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('value', g.answer_given, 'count', g.cnt, 'recipientIds', g.ids) order by g.cnt desc)
      from (
        select answer_given, count(*) as cnt, jsonb_agg(id) as ids
        from question_recipients
        where quiz_question_id = p_quiz_question_id and result = 'pending_validation'
        group by answer_given
      ) g
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function get_pending_validations(uuid) from public;
grant execute on function get_pending_validations(uuid) to authenticated;

-- ---------- validate_pending_answers ----------
-- Accepte (correct) ou refuse (incorrect) un groupe de réponses identiques en une fois
-- ("ne valider qu'une fois", voir ecrans.md écran 7).

create or replace function validate_pending_answers(p_quiz_question_id uuid, p_recipient_ids uuid[], p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_author_person_id uuid;
begin
  select qs.family_id, f.author_person_id
    into v_family_id, v_author_person_id
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

  update question_recipients
    set result = case when p_accept then 'correct' else 'incorrect' end,
        validated_by_person_id = v_author_person_id,
        validated_at = now()
    where quiz_question_id = p_quiz_question_id
      and id = any(p_recipient_ids)
      and result = 'pending_validation';
end;
$$;

revoke all on function validate_pending_answers(uuid, uuid[], boolean) from public;
grant execute on function validate_pending_answers(uuid, uuid[], boolean) to authenticated;

-- ---------- reveal_current_question : resserré ----------
-- Jusqu'ici, une réponse encore "en attente de validation" était silencieusement comptée
-- incorrecte à la révélation (il n'y avait pas d'autre choix, l'écran de validation
-- n'existait pas). Maintenant qu'il existe, on applique la vraie règle du concept : la
-- question n'est pas révélable tant qu'il reste des réponses à valider.

create or replace function reveal_current_question(p_quiz_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_author_person_id uuid;
  v_session_id uuid;
  v_unanswered_count int;
  v_pending_count int;
begin
  select qs.family_id, f.author_person_id, qs.id
    into v_family_id, v_author_person_id, v_session_id
    from quiz_questions qq
    join facts f on f.id = qq.fact_id
    join quiz_sessions qs on qs.id = qq.session_id
    where qq.id = p_quiz_question_id;

  if v_family_id is null then
    raise exception 'Question introuvable.';
  end if;

  if v_author_person_id is distinct from my_person_id(v_family_id) then
    raise exception 'Seul l''auteur du fait peut déclencher la révélation.';
  end if;

  select
    count(*) filter (where result = 'unanswered'),
    count(*) filter (where result = 'pending_validation')
    into v_unanswered_count, v_pending_count
    from question_recipients
    where quiz_question_id = p_quiz_question_id;

  if v_unanswered_count > 0 then
    raise exception 'Tout le monde n''a pas encore répondu.';
  end if;

  if v_pending_count > 0 then
    raise exception 'Des réponses sont encore en attente de validation.';
  end if;

  update quiz_sessions set status = 'closed' where id = v_session_id;
end;
$$;
