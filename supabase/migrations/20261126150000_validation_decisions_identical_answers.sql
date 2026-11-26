-- Étape 6 decies (décidé le 2026-11-26, voir docs/ecrans.md écran 7) : une décision de l'auteur
-- (accepter/refuser) sur une réponse libre s'applique à toutes les réponses identiques après
-- normalisation (normalize_answer_text, comme la validation automatique), y compris celles qui
-- arrivent après. Portée : une seule question posée (quiz_question_id), pas besoin d'une table
-- à part — question_recipients porte déjà la décision (result, validated_at).

-- ---------- get_pending_validations : regroupe par valeur normalisée, pas la valeur brute ----------
-- Avant : "Paris", "paris" et "PARIS " formaient 3 groupes à valider séparément. La valeur
-- affichée reste une orthographe brute représentative (la première rencontrée).

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
      select jsonb_agg(jsonb_build_object('value', g.sample_value, 'count', g.cnt) order by g.cnt desc)
      from (
        select (array_agg(answer_given))[1] as sample_value, count(*) as cnt
        from question_recipients
        where quiz_question_id = p_quiz_question_id and result = 'correct'
        group by normalize_answer_text(answer_given #>> '{}')
      ) g
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('value', g.sample_value, 'count', g.cnt, 'recipientIds', g.ids) order by g.cnt desc)
      from (
        select (array_agg(answer_given))[1] as sample_value, count(*) as cnt, jsonb_agg(id) as ids
        from question_recipients
        where quiz_question_id = p_quiz_question_id and result = 'pending_validation'
        group by normalize_answer_text(answer_given #>> '{}')
      ) g
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------- validate_pending_answers : étend la décision à toutes les réponses identiques ----------
-- Reprend la version du 2026-11-10 (renvoie un booléen : la validation a-t-elle déclenché la
-- révélation ? voir 20261110110000_reveal_timing_rules.sql) et y ajoute : p_recipient_ids peut
-- être incomplet (une réponse identique est arrivée entre temps) — la décision s'applique à
-- toute réponse "pending_validation" de cette question dont la valeur normalisée correspond à
-- l'une de celles des lignes données, pas seulement à ces lignes-là.

create or replace function validate_pending_answers(p_quiz_question_id uuid, p_recipient_ids uuid[], p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_author_person_id uuid;
  v_session_id uuid;
  v_session_status text;
  v_closes_at timestamptz;
  v_keys text[];
begin
  select qs.family_id, f.author_person_id, qs.id, qs.status, qs.closes_at
    into v_family_id, v_author_person_id, v_session_id, v_session_status, v_closes_at
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

  if v_session_status <> 'open' then
    raise exception 'Cette question a déjà été révélée.';
  end if;

  select array_agg(distinct normalize_answer_text(answer_given #>> '{}'))
    into v_keys
    from question_recipients
    where quiz_question_id = p_quiz_question_id
      and id = any(p_recipient_ids);

  update question_recipients
    set result = case when p_accept then 'correct' else 'incorrect' end,
        validated_by_person_id = v_author_person_id,
        validated_at = now()
    where quiz_question_id = p_quiz_question_id
      and result = 'pending_validation'
      and normalize_answer_text(answer_given #>> '{}') = any(v_keys);

  -- Deadline passée et plus rien à valider : la question n'attendait que ça, on la révèle.
  if v_closes_at is not null
    and now() > v_closes_at
    and not exists (
      select 1
      from question_recipients qr
      join quiz_questions qq on qq.id = qr.quiz_question_id
      where qq.session_id = v_session_id
        and qr.result = 'pending_validation'
    )
  then
    perform close_quiz_session(v_session_id);
    return true;
  end if;

  return false;
end;
$$;

revoke all on function validate_pending_answers(uuid, uuid[], boolean) from public;
grant execute on function validate_pending_answers(uuid, uuid[], boolean) to authenticated;

-- ---------- submit_answer : une réponse identique à une déjà jugée reprend la même décision ----------
-- S'applique aussi à une réponse qui arrive après la validation (ré-ouverture du champ par un
-- joueur, ou retardataire) : jamais remise en "pending_validation" si son équivalent normalisé
-- a déjà une décision pour cette question.

create or replace function submit_answer(p_quiz_question_id uuid, p_answer_given jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_snapshot jsonb;
  v_kind text;
  v_session_status text;
  v_closes_at timestamptz;
  v_recipient_id uuid;
  v_is_match boolean;
  v_result text;
  v_prior_decision text;
begin
  select qs.family_id, qq.answer_value_snapshot, coalesce(qq.answer_kind_snapshot, t.answer_input_kind),
         qs.status, qs.closes_at
    into v_family_id, v_snapshot, v_kind, v_session_status, v_closes_at
    from quiz_questions qq
    join quiz_sessions qs on qs.id = qq.session_id
    join facts f on f.id = qq.fact_id
    join question_templates t on t.id = f.template_id
    where qq.id = p_quiz_question_id;

  if v_family_id is null or not is_family_member(v_family_id) then
    raise exception 'Accès refusé.';
  end if;

  select id into v_recipient_id
    from question_recipients
    where quiz_question_id = p_quiz_question_id
      and person_id = my_person_id(v_family_id);

  if v_recipient_id is null then
    raise exception 'Tu n''es pas destinataire de cette question.';
  end if;

  if v_session_status <> 'open' then
    raise exception 'Cette question est terminée, il n''est plus possible d''y répondre.';
  end if;

  if v_closes_at is not null and now() > v_closes_at then
    raise exception 'La date limite est passée, il n''est plus possible de répondre.';
  end if;

  if v_kind = 'free_text'
    and not exists (
      select 1 from question_recipients
      where quiz_question_id = p_quiz_question_id
        and result in ('unanswered', 'pending_validation')
    )
    and exists (
      select 1 from question_recipients
      where quiz_question_id = p_quiz_question_id
        and validated_at is not null
    )
  then
    raise exception 'Les réponses ont déjà été validées, elles ne peuvent plus être modifiées.';
  end if;

  if v_kind in ('year', 'age', 'number') then
    v_is_match := (p_answer_given #>> '{}')::numeric = (v_snapshot #>> '{}')::numeric;
  else
    v_is_match := normalize_answer_text(p_answer_given #>> '{}') = normalize_answer_text(v_snapshot #>> '{}');
  end if;

  if v_is_match then
    v_result := 'correct';
  elsif v_kind = 'free_text' then
    select qr.result into v_prior_decision
      from question_recipients qr
      where qr.quiz_question_id = p_quiz_question_id
        and qr.result in ('correct', 'incorrect')
        and normalize_answer_text(qr.answer_given #>> '{}') = normalize_answer_text(p_answer_given #>> '{}')
      limit 1;
    v_result := coalesce(v_prior_decision, 'pending_validation');
  else
    v_result := 'incorrect';
  end if;

  update question_recipients
    set answer_given = p_answer_given,
        answered_at = now(),
        result = v_result,
        validated_by_person_id = null,
        validated_at = null
    where id = v_recipient_id;
end;
$$;

revoke all on function submit_answer(uuid, jsonb) from public;
grant execute on function submit_answer(uuid, jsonb) to authenticated;
