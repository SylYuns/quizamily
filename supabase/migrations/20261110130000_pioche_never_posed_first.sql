-- Pioche : ne jamais repiocher un fait déjà posé tant qu'il reste des faits jamais posés
-- (décision du 2026-11-10, voir docs/concept.md, « Pioche des questions »).
--
-- Jusqu'ici, la pioche pondérait par fraîcheur : un fait posé il y a longtemps pouvait être
-- repioché alors qu'il restait des faits jamais posés. Désormais :
-- - parmi les faits jamais posés : tirage pondéré, priorité (×1,5) aux faits sur une
--   personne centrale ;
-- - seulement s'il n'en reste aucun : un fait déjà posé, en privilégiant ceux posés il y a
--   le plus longtemps ; le résultat porte alors "reused": true, pour prévenir les joueurs
--   (forme de l'avertissement à définir).
-- Le résultat donne aussi "neverPosedLeft" : faits jamais posés restants après la pioche
-- (alerte « réserve bientôt vide » de l'accueil, sous 5).
--
-- Même règle dans supabase/functions/create-quiz-session/pioche.ts (déclenchement manuel) :
-- garder les deux alignées.

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
  v_reused boolean;
  v_never_posed_left int;
  v_session_id uuid;
  v_question_id uuid;
  v_closes_at timestamptz;
  v_recipients_created int;
begin
  if exists (select 1 from quiz_sessions where family_id = p_family_id and status = 'open') then
    return jsonb_build_object('error', 'session_already_open');
  end if;

  select f.id, f.author_person_id, f.answer_value, t.answer_input_kind, posed.last_posed_at is not null
    into v_fact_id, v_author_person_id, v_answer_value, v_kind, v_reused
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
  order by
    -- 1. Les faits jamais posés d'abord, toujours.
    (posed.last_posed_at is not null) asc,
    -- 2. Tirage pondéré (méthode de la clé aléatoire : random()^(1/poids), le plus grand gagne).
    power(
      random(),
      1.0 / (
        case
          when posed.last_posed_at is null then 1
          else greatest(1, least(90, extract(epoch from (v_now - posed.last_posed_at)) / 86400.0))
        end
        * (case when sp.is_central then 1.5 else 1 end)
      )
    ) desc
  limit 1;

  if v_fact_id is null then
    return jsonb_build_object('error', 'no_facts_available');
  end if;

  select count(*) into v_never_posed_left
  from facts f
  where f.family_id = p_family_id
    and f.status = 'active'
    and f.id <> v_fact_id
    and not exists (select 1 from quiz_questions qq where qq.fact_id = f.id);

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
    'recipientsCreated', v_recipients_created,
    'reused', v_reused,
    'neverPosedLeft', v_never_posed_left
  );
end;
$$;

revoke all on function create_quiz_session_for_family(uuid) from public;
