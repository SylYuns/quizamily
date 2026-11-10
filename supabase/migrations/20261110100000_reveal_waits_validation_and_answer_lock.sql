-- Deux corrections liées (décision du 2026-11-10, voir docs/ecrans.md écrans 6 et 8) :
--
-- 1. auto_reveal_expired_sessions() : pas de révélation automatique tant qu'il reste une
--    réponse à valider. Jusqu'ici, les réponses "en attente de validation" (saisie libre
--    uniquement) étaient comptées fausses à la deadline, ce qui contredisait concept.md :
--    une question en saisie libre n'est révélée qu'une fois toutes ses réponses validées.
--    Une session dans ce cas reste ouverte après sa deadline, jusqu'à ce que l'auteur (ou,
--    plus tard, le joueur qui prend la main) ait tout validé ; le passage horaire suivant la
--    révèle alors, puisque la deadline est dépassée.
--
-- 2. submit_answer() : ne vérifiait ni la deadline ni l'état de la session. Un joueur pouvait
--    répondre ou modifier sa réponse après la deadline, et même après la révélation, ce qui
--    changeait son score. Désormais :
--    - refus si la session est clôturée ou si la deadline est passée (d'autant plus nécessaire
--      qu'une session peut maintenant rester ouverte après sa deadline, voir point 1) ;
--    - saisie libre : refus de modifier une réponse une fois que tout le monde a répondu et
--      que l'auteur a validé les réponses (verrouillage prévu dans ecrans.md écran 6) ;
--    - une réponse modifiée repart de zéro : on efface validated_by_person_id/validated_at
--      d'une éventuelle validation précédente, devenue caduque.

-- ---------- submit_answer ----------

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
begin
  select qs.family_id, qq.answer_value_snapshot, t.answer_input_kind, qs.status, qs.closes_at
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
    v_result := 'pending_validation';
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

-- ---------- auto_reveal_expired_sessions ----------

create or replace function auto_reveal_expired_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  for v_session_id in
    select qs.id
    from quiz_sessions qs
    where qs.status = 'open'
      and qs.closes_at < now()
      and not exists (
        select 1
        from question_recipients qr
        join quiz_questions qq on qq.id = qr.quiz_question_id
        where qq.session_id = qs.id
          and qr.result = 'pending_validation'
      )
  loop
    update question_recipients
      set result = 'incorrect'
      where quiz_question_id in (select id from quiz_questions where session_id = v_session_id)
        and result = 'unanswered';

    update quiz_sessions set status = 'closed' where id = v_session_id;
  end loop;
end;
$$;

revoke all on function auto_reveal_expired_sessions() from public;
