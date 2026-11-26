-- Forme de la réponse (étape 6 quater, 2/2) : fait résoudre aux fonctions serveur le bon texte
-- et le bon type de réponse selon facts.answer_kind / quiz_questions.answer_kind_snapshot
-- (jusqu'ici elles utilisaient toujours question_templates.template_text/answer_input_kind,
-- ignorant la forme choisie par l'auteur). Ajoute aussi <pays_lieu> (préposition de lieu) au
-- texte assemblé côté serveur — voir src/lib/lieu.ts pour l'équivalent côté client.

-- ---------- lieu_pour_pays ----------
-- Même table que src/lib/lieu.ts (COUNTRY_PHRASES) : à tenir à jour ensemble si la liste des
-- pays change (src/constants/countries.ts).

create or replace function lieu_pour_pays(p_pays text)
returns text
language sql
immutable
as $$
  select case p_pays
    when 'France' then 'en France'
    when 'Allemagne' then 'en Allemagne'
    when 'Belgique' then 'en Belgique'
    when 'Suisse' then 'en Suisse'
    when 'Italie' then 'en Italie'
    when 'Espagne' then 'en Espagne'
    when 'Portugal' then 'au Portugal'
    when 'Royaume-Uni' then 'au Royaume-Uni'
    when 'Irlande' then 'en Irlande'
    when 'Pays-Bas' then 'aux Pays-Bas'
    when 'Luxembourg' then 'au Luxembourg'
    when 'Autriche' then 'en Autriche'
    when 'Grèce' then 'en Grèce'
    when 'Pologne' then 'en Pologne'
    when 'République tchèque' then 'en République tchèque'
    when 'Hongrie' then 'en Hongrie'
    when 'Roumanie' then 'en Roumanie'
    when 'Bulgarie' then 'en Bulgarie'
    when 'Croatie' then 'en Croatie'
    when 'Suède' then 'en Suède'
    when 'Norvège' then 'en Norvège'
    when 'Danemark' then 'au Danemark'
    when 'Finlande' then 'en Finlande'
    when 'Islande' then 'en Islande'
    when 'Russie' then 'en Russie'
    when 'Ukraine' then 'en Ukraine'
    when 'Turquie' then 'en Turquie'
    when 'Maroc' then 'au Maroc'
    when 'Algérie' then 'en Algérie'
    when 'Tunisie' then 'en Tunisie'
    when 'Égypte' then 'en Égypte'
    when 'Sénégal' then 'au Sénégal'
    when 'Côte d''Ivoire' then 'en Côte d''Ivoire'
    when 'Mali' then 'au Mali'
    when 'Cameroun' then 'au Cameroun'
    when 'Madagascar' then 'à Madagascar'
    when 'Liban' then 'au Liban'
    when 'Israël' then 'en Israël'
    when 'États-Unis' then 'aux États-Unis'
    when 'Canada' then 'au Canada'
    when 'Mexique' then 'au Mexique'
    when 'Brésil' then 'au Brésil'
    when 'Argentine' then 'en Argentine'
    when 'Chili' then 'au Chili'
    when 'Pérou' then 'au Pérou'
    when 'Chine' then 'en Chine'
    when 'Japon' then 'au Japon'
    when 'Corée du Sud' then 'en Corée du Sud'
    when 'Inde' then 'en Inde'
    when 'Thaïlande' then 'en Thaïlande'
    when 'Vietnam' then 'au Vietnam'
    when 'Indonésie' then 'en Indonésie'
    when 'Australie' then 'en Australie'
    when 'Nouvelle-Zélande' then 'en Nouvelle-Zélande'
    when 'Maurice' then 'à Maurice'
    when 'Réunion' then 'à La Réunion'
    when 'Guadeloupe' then 'en Guadeloupe'
    when 'Martinique' then 'en Martinique'
    when 'Polynésie française' then 'en Polynésie française'
    when 'Nouvelle-Calédonie' then 'en Nouvelle-Calédonie'
    else 'en ' || p_pays
  end;
$$;

-- ---------- substitute_question_text : <pays_lieu> ----------

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

  if p_slot_values is not null and p_slot_values ? 'pays' then
    v_text := replace(v_text, '<pays_lieu>', lieu_pour_pays(p_slot_values ->> 'pays'));
  end if;

  if p_slot_values is not null then
    for v_key in select jsonb_object_keys(p_slot_values) loop
      v_text := replace(v_text, '<' || v_key || '>', p_slot_values ->> v_key);
    end loop;
  end if;

  return v_text;
end;
$$;

-- ---------- resolve_template_forme ----------
-- Texte/récapitulatif/type de réponse pour une forme donnée (null = celle par défaut du
-- template) — même logique que src/lib/template-forme.ts.

create or replace function resolve_template_forme(p_template_id text, p_answer_kind text)
returns table (resolved_text text, resolved_recap text, resolved_kind text)
language sql
stable
set search_path = public
as $$
  select
    coalesce(t.form_texts -> p_answer_kind ->> 'text', t.template_text),
    coalesce(t.form_texts -> p_answer_kind ->> 'recap', t.recap),
    coalesce(p_answer_kind, t.answer_input_kind)
  from question_templates t
  where t.id = p_template_id;
$$;

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
    'questionText', substitute_question_text(rtf.resolved_text, t.related_role, sp.display_name, rp.display_name, f.slot_values, sp.gender),
    'subjectName', sp.display_name,
    'subjectPersonId', sp.id,
    'answerInputKind', rtf.resolved_kind,
    'correctAnswer', qq.answer_value_snapshot,
    'authorName', ap.display_name,
    'contextText', f.context_text,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'personId', qr.person_id,
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
  cross join lateral resolve_template_forme(t.id, qq.answer_kind_snapshot) rtf
  where qq.id = p_quiz_question_id;

  return v_result;
end;
$$;

revoke all on function get_revealed_question(uuid) from public;
grant execute on function get_revealed_question(uuid) to authenticated;

-- ---------- submit_answer ----------
-- v_kind venait toujours de question_templates.answer_input_kind (type par défaut), jamais de
-- la forme choisie par l'auteur : ne changeait rien tant que seule la validation free_text vs
-- numérique vs texte en dépendait pour les 17 templates concernés, mais devient faux dès qu'une
-- forme différente du type par défaut est choisie (ex: "année" sur un template "date").

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

-- ---------- get_archive_summary (récapitulatif d'une personne, écran 11) ----------

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
    'questionText', substitute_question_text(rtf.resolved_text, t.related_role, sp.display_name, rp.display_name, f.slot_values),
    'answerInputKind', rtf.resolved_kind,
    'answer', f.answer_value,
    'category', t.category,
    'recap', rtf.resolved_recap,
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
  cross join lateral resolve_template_forme(t.id, f.answer_kind) rtf
  where f.subject_person_id = p_person_id
    and qs.status = 'closed';

  return v_result;
end;
$$;

revoke all on function get_archive_summary(uuid) from public;
grant execute on function get_archive_summary(uuid) to authenticated;

-- ---------- get_my_pending_corrections ----------

create or replace function get_my_pending_corrections(p_family_id uuid)
returns table (
  fact_id uuid,
  question_text text,
  answer_input_kind text,
  current_value jsonb,
  proposed_value jsonb,
  comment text,
  proposed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    substitute_question_text(rtf.resolved_text, t.related_role, sp.display_name, rp.display_name, f.slot_values, sp.gender),
    rtf.resolved_kind,
    f.answer_value,
    f.pending_correction -> 'proposedValue',
    f.pending_correction ->> 'comment',
    (f.pending_correction ->> 'proposedAt')::timestamptz
  from facts f
  join question_templates t on t.id = f.template_id
  join persons sp on sp.id = f.subject_person_id
  left join persons rp on rp.id = f.related_person_id
  cross join lateral resolve_template_forme(t.id, f.answer_kind) rtf
  where f.family_id = p_family_id
    and is_family_member(p_family_id)
    and f.author_person_id = my_person_id(p_family_id)
    and f.pending_correction ->> 'status' = 'pending';
$$;

revoke all on function get_my_pending_corrections(uuid) from public;
grant execute on function get_my_pending_corrections(uuid) to authenticated;
