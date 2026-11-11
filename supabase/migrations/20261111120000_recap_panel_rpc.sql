-- Panneau "connaissances" dans l'arbre familial (écran 10 + 11) : au lieu de naviguer vers
-- /archive, un panneau latéral affiche la mini-biographie rédigée d'une personne sans quitter
-- l'écran. get_archive_summary s'enrichit des champs nécessaires à l'assemblage côté client
-- (src/lib/recap.ts) : category, recap (phrase brute, substituée côté client selon le genre),
-- relatedRole/relatedName, slotValues. Classé par sort_order (ordre narratif du catalogue,
-- voir docs/question-templates.toml) plutôt que par date de révélation.

alter table question_templates add column sort_order int;

update question_templates set sort_order = v.n
from (values
  ('naissance-date', 1), ('nom-jeune-fille', 2), ('nom-jeune-fille-mere', 3),
  ('naissance-adresse', 4), ('naissance-age-aine', 5), ('ecole-age-fin', 6), ('enfance-animal', 7),
  ('enfance-sport', 8), ('premiere-voiture-conduite', 9), ('permis-annee', 10),
  ('premier-metier', 11), ('nage-age', 12), ('metier-reve', 13),
  ('depart-domicile-age', 14), ('rencontre-annee', 15), ('mariage-date', 16),
  ('mariage-commune', 17), ('voyage-noces', 18), ('mariage-voiture', 19),
  ('service-militaire-ville', 20), ('adresse-actuelle-annee', 21),
  ('premier-concert-annee', 22), ('premier-concert-artiste', 23), ('television-annee', 24),
  ('premier-film-cinema', 25), ('ordinateur-age', 26),
  ('retraite-date', 27), ('premier-pays-etranger', 28), ('avion-annee', 29),
  ('voyage-pays-annee', 30), ('dernier-pays-etranger', 31), ('club-associatif', 32)
) as v(id, n)
where question_templates.id = v.id;

alter table question_templates alter column sort_order set not null;

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
