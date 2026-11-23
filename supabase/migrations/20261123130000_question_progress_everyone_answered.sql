-- Corrige get_question_progress (voir 20261123120000_respond_and_reveal_rpcs.sql) : une fois le
-- seuil des 65 % atteint, array_agg sur zéro ligne (plus personne en retard, tout le monde a
-- répondu) renvoyait null, exactement comme le cas "seuil pas encore atteint" — l'écran affichait
-- alors à tort « Les noms des retardataires s'afficheront quand la plupart auront répondu »
-- (constaté à l'écran) alors que tout le monde avait déjà répondu. On distingue maintenant :
-- null = seuil pas atteint, tableau vide = seuil atteint et personne en retard.
create or replace function get_question_progress(p_quiz_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_my_person_id uuid;
  v_recipients_count int;
  v_answered_count int;
  v_late_names text[];
begin
  select qs.family_id
    into v_family_id
    from quiz_questions qq
    join quiz_sessions qs on qs.id = qq.session_id
    where qq.id = p_quiz_question_id;

  if v_family_id is null or not is_family_member(v_family_id) then
    raise exception 'Accès refusé.';
  end if;

  v_my_person_id := my_person_id(v_family_id);

  select count(*), count(*) filter (where result <> 'unanswered')
    into v_recipients_count, v_answered_count
    from question_recipients
    where quiz_question_id = p_quiz_question_id;

  if v_recipients_count > 0 and v_answered_count::numeric / v_recipients_count >= 0.65 then
    select coalesce(array_agg(missing.label order by missing.sort_name), '{}'::text[])
      into v_late_names
      from (
        select
          case when qr.person_id = v_my_person_id then 'toi' else p.display_name end as label,
          p.display_name as sort_name
        from question_recipients qr
        join persons p on p.id = qr.person_id
        where qr.quiz_question_id = p_quiz_question_id
          and qr.result = 'unanswered'
      ) missing;
  else
    v_late_names := null;
  end if;

  return jsonb_build_object(
    'recipientsCount', v_recipients_count,
    'answeredCount', v_answered_count,
    'lateNames', to_jsonb(v_late_names)
  );
end;
$$;

revoke all on function get_question_progress(uuid) from public;
grant execute on function get_question_progress(uuid) to authenticated;
