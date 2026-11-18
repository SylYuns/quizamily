-- Accord au féminin dans les questions posées aux joueurs (décision du 2026-11-18, voir
-- docs/question-templates.toml et docs/roadmap.md).
--
-- Les textes de question utilisent maintenant la même notation que les phrases de
-- récapitulatif : {forme_homme|forme_femme} (ex : « a-t-{il|elle} appris »,
-- « est-{il|elle} {allé|allée} »), remplacée selon le genre de la personne, masculin si
-- inconnu. Côté app : src/lib/gender.ts. Côté base (ici) : apply_gender_tokens(), utilisée
-- par substitute_question_text() pour les textes assemblés par get_revealed_question et
-- get_archive_summary. Garder les deux alignées.

-- ---------- apply_gender_tokens ----------

create or replace function apply_gender_tokens(p_text text, p_gender text)
returns text
language sql
immutable
as $$
  select replace(
    replace(
      regexp_replace(
        p_text,
        '\{([^{}|]+)\|([^{}|]+)\}',
        case when p_gender = 'femme' then '\2' else '\1' end,
        'g'
      ),
      '{Sujet}', case when p_gender = 'femme' then 'Elle' else 'Il' end
    ),
    '{sujet}', case when p_gender = 'femme' then 'elle' else 'il' end
  );
$$;

grant execute on function apply_gender_tokens(text, text) to authenticated;

-- ---------- substitute_question_text, avec le genre du sujet ----------
-- Nouvelle version à 6 paramètres. L'ancienne (5 paramètres) est gardée et délègue avec un
-- genre inconnu (masculin), pour ne rien casser chez un appelant oublié.

create or replace function substitute_question_text(
  p_template_text text,
  p_related_role text,
  p_subject_name text,
  p_related_name text,
  p_slot_values jsonb,
  p_subject_gender text
)
returns text
language plpgsql
immutable
as $$
declare
  v_text text := replace(apply_gender_tokens(p_template_text, p_subject_gender), '<sujet>', p_subject_name);
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

revoke all on function substitute_question_text(text, text, text, text, jsonb, text) from public;
grant execute on function substitute_question_text(text, text, text, text, jsonb, text) to authenticated;

create or replace function substitute_question_text(
  p_template_text text,
  p_related_role text,
  p_subject_name text,
  p_related_name text,
  p_slot_values jsonb
)
returns text
language sql
immutable
as $$
  select substitute_question_text(p_template_text, p_related_role, p_subject_name, p_related_name, p_slot_values, null::text);
$$;

-- ---------- get_revealed_question (inchangée, sauf le genre passé au texte) ----------

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
    'questionText', substitute_question_text(t.template_text, t.related_role, sp.display_name, rp.display_name, f.slot_values, sp.gender),
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

-- ---------- get_archive_summary (inchangée, sauf le genre passé au texte) ----------

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
    'questionText', substitute_question_text(t.template_text, t.related_role, sp.display_name, rp.display_name, f.slot_values, sp.gender),
    'answerInputKind', t.answer_input_kind,
    'answer', f.answer_value,
    'category', t.category,
    'recap', t.recap,
    'relatedRole', t.related_role,
    'relatedName', rp.display_name,
    'slotValues', f.slot_values
  ) order by t.sort_order), '[]'::jsonb)
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

-- ---------- Textes des questions ----------

update question_templates set template_text = v.template_text
from (values
  ('ecole-age-fin', 'Jusqu''à quel âge <sujet> est-{il|elle} {allé|allée} à l''école ?'),
  ('enfance-animal', 'Quel animal de compagnie <sujet> a-t-{il|elle} eu pendant son enfance ?'),
  ('permis-annee', 'En quelle année <sujet> a-t-{il|elle} obtenu son permis de conduire ?'),
  ('nage-age', 'À quel âge <sujet> a-t-{il|elle} appris à nager ?'),
  ('metier-reve', 'Quel métier <sujet> rêvait-{il|elle} de faire quand {il|elle} était enfant ?'),
  ('depart-domicile-age', 'À quel âge <sujet> a-t-{il|elle} quitté le domicile de ses parents ?'),
  ('rencontre-annee', 'En quelle année <sujet> a-t-{il|elle} rencontré <conjoint> ?'),
  ('mariage-commune', 'Dans quelle commune <sujet> s''est-{il|elle} {marié|mariée} ?'),
  ('service-militaire-ville', 'Où <sujet> a-t-{il|elle} fait son service militaire ?'),
  ('adresse-actuelle-annee', 'En quelle année <sujet> a-t-{il|elle} emménagé à son adresse actuelle ?'),
  ('premier-concert-annee', 'En quelle année <sujet> est-{il|elle} {allé|allée} voir un concert pour la première fois ?'),
  ('premier-concert-artiste', 'Quel artiste <sujet> est-{il|elle} {allé|allée} voir lors de son premier concert ?'),
  ('television-annee', 'En quelle année <sujet> a-t-{il|elle} eu une télévision à la maison ?'),
  ('premier-film-cinema', 'Quel film <sujet> a-t-{il|elle} vu la première fois qu''{il|elle} est {allé|allée} au cinéma ?'),
  ('ordinateur-age', 'À quel âge <sujet> a-t-{il|elle} utilisé un ordinateur pour la première fois ?'),
  ('retraite-date', 'À quelle date <sujet> a-t-{il|elle} officiellement pris sa retraite ?'),
  ('premier-pays-etranger', 'Quel pays étranger <sujet> a-t-{il|elle} visité lors de son premier voyage hors de France ?'),
  ('avion-annee', 'En quelle année <sujet> a-t-{il|elle} pris l''avion pour la première fois ?'),
  ('voyage-pays-annee', 'En quelle année <sujet> a-t-{il|elle} effectué son voyage en <pays> ?')
) as v(id, template_text)
where question_templates.id = v.id;
