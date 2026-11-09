-- Déclenchement automatique (voir "Points à décider" dans docs/roadmap.md) : jusqu'ici, la
-- pioche et la révélation étaient 100 % manuelles (boutons dans l'app). Ici :
--
-- 1. auto_create_quiz_sessions() : à lancer chaque semaine par pg_cron. Pour chaque famille
--    ayant au moins 3 joueurs (seuil déjà acté, voir roadmap.md "Décisions déjà prises") et
--    pas de session ouverte, pioche un fait pondéré et crée une session - même algorithme que
--    supabase/functions/create-quiz-session/pioche.ts (fraîcheur + bonus personne centrale),
--    porté en SQL ici pour être appelable directement par pg_cron sans passer par une Edge
--    Function (pas de secret à gérer). À garder synchronisé si l'algorithme de pioche.ts change.
--    La sélection pondérée utilise l'astuce Efraimidis-Spirakis (order by random()^(1/poids)
--    desc limit 1), équivalente au tirage pondéré classique.
--
-- 2. auto_reveal_expired_sessions() : à lancer chaque heure par pg_cron. Pour toute session
--    ouverte dont la deadline est dépassée, compte "faux" les réponses manquantes ou en
--    attente de validation (même choix que celui déjà fait pour la révélation manuelle, voir
--    docs/ecrans.md écran 8) puis clôture - sans attendre que tout le monde ait répondu, par
--    définition puisque la deadline est passée.
--
-- Les boutons manuels (pioche, révélation) restent utilisables en complément : la pioche
-- manuelle permet de ne pas attendre la prochaine tâche planifiée, et la révélation manuelle
-- permet de révéler dès que tout le monde a répondu sans attendre la deadline.

create extension if not exists pg_cron;

-- ---------- create_quiz_session_for_family ----------

create or replace function create_quiz_session_for_family(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_session_duration_days constant int := 7;
  v_fact_id uuid;
  v_author_person_id uuid;
  v_answer_value jsonb;
  v_kind text;
  v_session_id uuid;
  v_question_id uuid;
  v_closes_at timestamptz;
  v_recipients_created int;
begin
  if exists (select 1 from quiz_sessions where family_id = p_family_id and status = 'open') then
    return jsonb_build_object('error', 'session_already_open');
  end if;

  select f.id, f.author_person_id, f.answer_value, t.answer_input_kind
    into v_fact_id, v_author_person_id, v_answer_value, v_kind
  from facts f
  join question_templates t on t.id = f.template_id
  join persons sp on sp.id = f.subject_person_id
  left join lateral (
    select max(qq.created_at) as last_posed_at, bool_or(qs.status = 'open') as has_open
    from quiz_questions qq
    join quiz_sessions qs on qs.id = qq.session_id
    where qq.fact_id = f.id
  ) posed on true
  where f.family_id = p_family_id
    and f.status = 'active'
    and coalesce(posed.has_open, false) = false
  order by power(
    random(),
    1.0 / (
      greatest(1, least(90, coalesce(extract(epoch from (v_now - posed.last_posed_at)) / 86400.0, 100)))
      * (case when sp.is_central then 1.5 else 1 end)
    )
  ) desc
  limit 1;

  if v_fact_id is null then
    return jsonb_build_object('error', 'no_facts_available');
  end if;

  v_closes_at := v_now + (v_session_duration_days || ' days')::interval;

  insert into quiz_sessions (family_id, status, opens_at, closes_at)
    values (p_family_id, 'open', v_now, v_closes_at)
    returning id into v_session_id;

  insert into quiz_questions (session_id, fact_id, answer_value_snapshot, validator_person_id)
    values (
      v_session_id,
      v_fact_id,
      v_answer_value,
      case when v_kind = 'free_text' then v_author_person_id else null end
    )
    returning id into v_question_id;

  insert into question_recipients (quiz_question_id, person_id, result)
  select v_question_id, p.id, 'unanswered'
  from persons p
  where p.family_id = p_family_id
    and p.kind = 'player'
    and p.id <> v_author_person_id;

  select count(*) into v_recipients_created from question_recipients where quiz_question_id = v_question_id;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'closesAt', v_closes_at,
    'factId', v_fact_id,
    'recipientsCreated', v_recipients_created
  );
end;
$$;

revoke all on function create_quiz_session_for_family(uuid) from public;

-- ---------- auto_create_quiz_sessions ----------

create or replace function auto_create_quiz_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  for v_family_id in
    select f.id
    from families f
    where (select count(*) from persons p where p.family_id = f.id and p.kind = 'player') >= 3
      and not exists (select 1 from quiz_sessions qs where qs.family_id = f.id and qs.status = 'open')
  loop
    perform create_quiz_session_for_family(v_family_id);
  end loop;
end;
$$;

revoke all on function auto_create_quiz_sessions() from public;

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
    select id from quiz_sessions where status = 'open' and closes_at < now()
  loop
    update question_recipients
      set result = 'incorrect'
      where quiz_question_id in (select id from quiz_questions where session_id = v_session_id)
        and result in ('unanswered', 'pending_validation');

    update quiz_sessions set status = 'closed' where id = v_session_id;
  end loop;
end;
$$;

revoke all on function auto_reveal_expired_sessions() from public;

-- ---------- tâches planifiées ----------

select cron.schedule('auto-create-quiz-sessions', '0 8 * * 1', $$select auto_create_quiz_sessions();$$);
select cron.schedule('auto-reveal-expired-sessions', '0 * * * *', $$select auto_reveal_expired_sessions();$$);
