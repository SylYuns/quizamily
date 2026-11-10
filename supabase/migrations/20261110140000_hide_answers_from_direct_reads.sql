-- Fermer la fuite résiduelle des bonnes réponses (voir docs/roadmap.md, « Points à décider »,
-- et docs/data-model.md, RLS).
--
-- Jusqu'ici, n'importe quel membre de la famille pouvait lire, par une requête directe sur
-- les tables (en contournant l'appli) :
-- - facts.answer_value (et answer_history, pending_correction) d'un fait pas encore posé ;
-- - quiz_questions.answer_value_snapshot de la question en cours.
-- La RLS filtre par ligne, pas par colonne : on retire donc le droit de LIRE ces colonnes au
-- rôle authenticated (privilèges par colonne). L'écriture (insert/update par l'auteur) ne
-- change pas, et les fonctions security definer (submit_answer, get_revealed_question, la
-- pioche, les corrections…) continuent de les lire.
--
-- L'appli lit désormais ces valeurs par deux fonctions qui vérifient le droit d'y accéder :
-- - get_fact_answer(fact) : l'auteur du fait, ou tout membre une fois le fait révélé ;
-- - get_my_fact_answers(famille) : les réponses des faits dont on est l'auteur (« Mes faits »).

-- ---------- facts ----------

revoke select on facts from anon, authenticated;
grant select (
  id, family_id, template_id, subject_person_id, related_person_id, slot_values,
  author_person_id, context_text, status, created_at
) on facts to authenticated;

-- ---------- quiz_questions ----------

revoke select on quiz_questions from anon, authenticated;
grant select (
  id, session_id, fact_id, validator_person_id, validation_completed_at, taken_over_at, created_at
) on quiz_questions to authenticated;

-- ---------- get_fact_answer ----------

create or replace function get_fact_answer(p_fact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fact facts%rowtype;
  v_revealed boolean;
begin
  select * into v_fact from facts where id = p_fact_id;

  if v_fact.id is null or not is_family_member(v_fact.family_id) then
    raise exception 'Accès refusé.';
  end if;

  select exists (
    select 1
    from quiz_questions qq
    join quiz_sessions qs on qs.id = qq.session_id
    where qq.fact_id = p_fact_id and qs.status = 'closed'
  ) into v_revealed;

  if v_fact.author_person_id is distinct from my_person_id(v_fact.family_id) and not v_revealed then
    raise exception 'Cette réponse n''a pas encore été révélée.';
  end if;

  return jsonb_build_object(
    'answer_value', v_fact.answer_value,
    'answer_history', v_fact.answer_history,
    'pending_correction', v_fact.pending_correction
  );
end;
$$;

revoke all on function get_fact_answer(uuid) from public;
grant execute on function get_fact_answer(uuid) to authenticated;

-- ---------- get_my_fact_answers ----------

create or replace function get_my_fact_answers(p_family_id uuid)
returns table (fact_id uuid, answer_value jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.answer_value
  from facts f
  where f.family_id = p_family_id
    and is_family_member(p_family_id)
    and f.author_person_id = my_person_id(p_family_id);
$$;

revoke all on function get_my_fact_answers(uuid) from public;
grant execute on function get_my_fact_answers(uuid) to authenticated;
