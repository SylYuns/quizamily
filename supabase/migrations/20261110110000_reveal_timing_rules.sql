-- Règles de révélation (décisions du 2026-11-10, voir docs/ecrans.md écran 8) :
--
-- 1. Les joueurs qui n'ont pas répondu ne bloquent jamais la révélation, ni automatique ni
--    manuelle : leurs réponses manquantes sont comptées fausses au moment de la clôture.
--    reveal_current_question() n'exige donc plus que tout le monde ait répondu. Seules les
--    réponses libres encore à valider bloquent la révélation.
--
-- 2. Saisie libre, toutes les validations faites :
--    - AVANT la deadline : révélation normale, à la deadline (tâche planifiée
--      auto_reveal_expired_sessions, ou bouton manuel pendant la phase de test) ;
--    - APRÈS la deadline : la question attendait la validation, elle est révélée
--      immédiatement, dès la dernière validation (validate_pending_answers).
--
-- La révélation manuelle (bouton de l'auteur) n'existe que pour la phase de test.
--
-- close_quiz_session() regroupe la clôture commune aux trois chemins.

-- ---------- close_quiz_session (usage interne) ----------

create or replace function close_quiz_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update question_recipients
    set result = 'incorrect'
    where quiz_question_id in (select id from quiz_questions where session_id = p_session_id)
      and result = 'unanswered';

  update quiz_sessions set status = 'closed' where id = p_session_id and status = 'open';
end;
$$;

revoke all on function close_quiz_session(uuid) from public;

-- ---------- reveal_current_question ----------

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
  v_session_status text;
  v_pending_count int;
begin
  select qs.family_id, f.author_person_id, qs.id, qs.status
    into v_family_id, v_author_person_id, v_session_id, v_session_status
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

  if v_session_status <> 'open' then
    raise exception 'Cette question a déjà été révélée.';
  end if;

  select count(*) into v_pending_count
    from question_recipients
    where quiz_question_id = p_quiz_question_id
      and result = 'pending_validation';

  if v_pending_count > 0 then
    raise exception 'Des réponses sont encore en attente de validation.';
  end if;

  perform close_quiz_session(v_session_id);
end;
$$;

revoke all on function reveal_current_question(uuid) from public;
grant execute on function reveal_current_question(uuid) to authenticated;

-- ---------- validate_pending_answers ----------
-- Renvoie maintenant true si la validation a déclenché la révélation (deadline passée et
-- plus aucune réponse en attente), pour que l'app puisse ouvrir directement la révélation.
-- Le type de retour change (void -> boolean) : il faut supprimer la fonction avant de la
-- recréer.

drop function if exists validate_pending_answers(uuid, uuid[], boolean);

create function validate_pending_answers(p_quiz_question_id uuid, p_recipient_ids uuid[], p_accept boolean)
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

  update question_recipients
    set result = case when p_accept then 'correct' else 'incorrect' end,
        validated_by_person_id = v_author_person_id,
        validated_at = now()
    where quiz_question_id = p_quiz_question_id
      and id = any(p_recipient_ids)
      and result = 'pending_validation';

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
    perform close_quiz_session(v_session_id);
  end loop;
end;
$$;

revoke all on function auto_reveal_expired_sessions() from public;
