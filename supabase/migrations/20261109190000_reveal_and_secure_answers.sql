-- Révélation (écran 8) + fermeture d'une fuite réelle : jusqu'ici, respond.tsx recevait
-- answer_value_snapshot dans la réponse de l'API (pour comparer côté client) avant même que
-- le joueur ait répondu, visible par n'importe qui ouvrant les outils réseau du navigateur.
-- Le calcul du résultat passe donc maintenant entièrement côté serveur (submit_answer),
-- et le client n'a plus jamais besoin de lire answer_value_snapshot avant la révélation.

create extension if not exists unaccent;

-- Normalisation identique à celle documentée dans concept.md (minuscules, sans accents,
-- sans espaces/tirets/apostrophes), appliquée aux types non numériques.
create or replace function normalize_answer_text(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(unaccent(coalesce(p_value, ''))), '[\s\-'']', '', 'g');
$$;

-- ---------- submit_answer ----------
-- Remplace l'écriture directe du joueur sur question_recipients (la policy correspondante
-- est supprimée plus bas) : le calcul du résultat se fait ici, côté serveur, pour ne jamais
-- renvoyer la bonne réponse au client avant la révélation.

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
  v_recipient_id uuid;
  v_is_match boolean;
  v_result text;
begin
  select qs.family_id, qq.answer_value_snapshot, t.answer_input_kind
    into v_family_id, v_snapshot, v_kind
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
    set answer_given = p_answer_given, answered_at = now(), result = v_result
    where id = v_recipient_id;
end;
$$;

revoke all on function submit_answer(uuid, jsonb) from public;
grant execute on function submit_answer(uuid, jsonb) to authenticated;

-- L'écriture directe sur question_recipients n'est plus le chemin voulu (elle laisserait un
-- joueur s'auto-attribuer "correct" sans passer par submit_answer) : on retire la policy
-- ajoutée dans 20261109170000_question_recipients_answer_policy.sql.
drop policy if exists "a player can answer their own question" on question_recipients;

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
  v_unanswered_count int;
begin
  select qs.family_id, f.author_person_id, qs.id
    into v_family_id, v_author_person_id, v_session_id
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

  select count(*) into v_unanswered_count
    from question_recipients
    where quiz_question_id = p_quiz_question_id
      and result = 'unanswered';

  if v_unanswered_count > 0 then
    raise exception 'Tout le monde n''a pas encore répondu.';
  end if;

  -- Simplification documentée (pas d'écran de validation des réponses libres pour
  -- l'instant, voir roadmap.md étape 7) : une réponse en attente de validation est comptée
  -- incorrecte à la révélation.
  update question_recipients
    set result = 'incorrect'
    where quiz_question_id = p_quiz_question_id
      and result = 'pending_validation';

  update quiz_sessions set status = 'closed' where id = v_session_id;
end;
$$;

revoke all on function reveal_current_question(uuid) from public;
grant execute on function reveal_current_question(uuid) to authenticated;

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
    'questionText', t.template_text,
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
  where qq.id = p_quiz_question_id;

  return v_result;
end;
$$;

revoke all on function get_revealed_question(uuid) from public;
grant execute on function get_revealed_question(uuid) to authenticated;
