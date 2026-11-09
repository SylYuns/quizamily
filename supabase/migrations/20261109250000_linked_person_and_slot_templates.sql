-- Templates restants du catalogue (voir "Points à décider" dans docs/roadmap.md) : les
-- templates avec une personne liée (<conjoint>) ou un élément choisi par l'auteur (<pays>)
-- sont maintenant proposés dans "Ajouter un fait" (src/app/add-fact.tsx), qui résout la
-- personne liée et/ou l'élément avant de créer le fait, et renseigne facts.related_person_id
-- / facts.slot_values (colonnes déjà prévues dans le schéma initial, jusqu'ici jamais
-- remplies). Toutes les lectures de question_templates.template_text doivent donc désormais
-- substituer <conjoint>/<pays> en plus de <sujet> - cette fonction centralise cette logique
-- pour les deux endroits où la substitution se fait côté serveur (get_revealed_question,
-- get_archive_summary) ; côté client, add-fact.tsx/my-facts.tsx/respond.tsx ont leur propre
-- substitution (le fait n'est pas toujours déjà résolu à l'écriture, par ex. pendant la
-- création).

create or replace function substitute_question_text(
  p_template_text text,
  p_related_role text,
  p_subject_name text,
  p_related_name text,
  p_slot_values jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_text text := replace(p_template_text, '<sujet>', p_subject_name);
  v_key text;
begin
  if p_related_role is not null and p_related_name is not null then
    v_text := replace(v_text, '<' || p_related_role || '>', p_related_name);
  end if;

  if p_slot_values is not null then
    for v_key in select jsonb_object_keys(p_slot_values) loop
      v_text := replace(v_text, '<' || v_key || '>', p_slot_values ->> v_key);
    end loop;
  end if;

  return v_text;
end;
$$;

revoke all on function substitute_question_text(text, text, text, text, jsonb) from public;
grant execute on function substitute_question_text(text, text, text, text, jsonb) to authenticated;

-- ---------- get_revealed_question ----------

create or replace function get_revealed_question(p_quiz_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_status text;
  v_result jsonb;
begin
  select qs.family_id, qs.status
    into v_family_id, v_status
    from quiz_questions qq
    join quiz_sessions qs on qs.id = qq.session_id
    where qq.id = p_quiz_question_id;

  if v_family_id is null or not is_family_member(v_family_id) then
    raise exception 'Accès refusé.';
  end if;

  if v_status is distinct from 'closed' then
    raise exception 'Cette question n''a pas encore été révélée.';
  end if;

  select jsonb_build_object(
    'questionText', substitute_question_text(t.template_text, t.related_role, sp.display_name, rp.display_name, f.slot_values),
    'subjectName', sp.display_name,
    'answerInputKind', t.answer_input_kind,
    'correctAnswer', qq.answer_value_snapshot,
    'authorName', ap.display_name,
    'contextText', f.context_text,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'displayName', p.display_name,
        'answerGiven', qr.answer_given,
        'result', qr.result
      ) order by p.display_name)
      from question_recipients qr
      join persons p on p.id = qr.person_id
      where qr.quiz_question_id = p_quiz_question_id
    ), '[]'::jsonb)
  )
  into v_result
  from quiz_questions qq
  join facts f on f.id = qq.fact_id
  join question_templates t on t.id = f.template_id
  join persons sp on sp.id = f.subject_person_id
  join persons ap on ap.id = f.author_person_id
  left join persons rp on rp.id = f.related_person_id
  where qq.id = p_quiz_question_id;

  return v_result;
end;
$$;

revoke all on function get_revealed_question(uuid) from public;
grant execute on function get_revealed_question(uuid) to authenticated;

-- ---------- get_archive_summary ----------

create or replace function get_archive_summary(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_result jsonb;
begin
  select family_id into v_family_id from persons where id = p_person_id;

  if v_family_id is null or not is_family_member(v_family_id) then
    raise exception 'Accès refusé.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'quizQuestionId', qq.id,
    'questionText', substitute_question_text(t.template_text, t.related_role, sp.display_name, rp.display_name, f.slot_values),
    'answerInputKind', t.answer_input_kind,
    'answer', f.answer_value
  ) order by qs.created_at desc), '[]'::jsonb)
  into v_result
  from quiz_questions qq
  join quiz_sessions qs on qs.id = qq.session_id
  join facts f on f.id = qq.fact_id
  join question_templates t on t.id = f.template_id
  join persons sp on sp.id = f.subject_person_id
  left join persons rp on rp.id = f.related_person_id
  where f.subject_person_id = p_person_id
    and qs.status = 'closed';

  return v_result;
end;
$$;

revoke all on function get_archive_summary(uuid) from public;
grant execute on function get_archive_summary(uuid) to authenticated;
