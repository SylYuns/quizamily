-- Archives (écran 9), version MVP : liste des questions déjà révélées concernant une
-- personne centrale, avec leur réponse. Mêmes informations pour tout le monde (pas de vue
-- spéciale pour l'auteur) : seuls les faits déjà posés ET révélés apparaissent, jamais les
-- faits pas encore posés, même pour leur propre auteur (voir docs/ecrans.md écran 9).
--
-- Le détail d'une question d'archive réutilise get_revealed_question (même contenu que la
-- révélation), donc pas de nouvelle fonction de détail ici.

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
    'questionText', t.template_text,
    'answerInputKind', t.answer_input_kind,
    'answer', f.answer_value
  ) order by qs.created_at desc), '[]'::jsonb)
  into v_result
  from quiz_questions qq
  join quiz_sessions qs on qs.id = qq.session_id
  join facts f on f.id = qq.fact_id
  join question_templates t on t.id = f.template_id
  where f.subject_person_id = p_person_id
    and qs.status = 'closed';

  return v_result;
end;
$$;

revoke all on function get_archive_summary(uuid) from public;
grant execute on function get_archive_summary(uuid) to authenticated;
