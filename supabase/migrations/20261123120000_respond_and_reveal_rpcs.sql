-- Nouvelles fonctions serveur pour la refonte « Répondre » et « Révélation » (décidée et
-- maquettée le 2026-11-23, voir docs/ecrans.md, écrans 6 et 8, et docs/roadmap.md, étape 6 ter).

-- ---------- get_question_progress ----------
-- Vue du joueur (écran 6) : un compteur de réponses reçues, et les noms des retardataires
-- seulement une fois qu'au moins 65 % des destinataires ont répondu — jamais avant, et jamais
-- la liste de ceux qui ont déjà répondu : l'auteur ne reçoit pas sa propre question, il serait
-- sinon la seule personne absente de cette liste, donc immédiatement identifiable.
-- Le nom du joueur qui appelle est remplacé par "toi" s'il fait partie des retardataires,
-- plutôt que de lui laisser deviner si son propre nom est dans la liste.
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
    select array_agg(missing.label order by missing.sort_name)
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

-- ---------- update_fact_context ----------
-- Vue de l'auteur (« Ma question ») : modifier son anecdote pendant que sa question est en jeu,
-- pour lui donner quelque chose à faire pendant la semaine (décision du 2026-11-23). La policy
-- existante ("the author can edit their not-yet-posed facts") n'autorise la mise à jour que tant
-- que le fait n'a jamais été posé ; cette fonction couvre le cas où il est posé mais pas encore
-- révélé, et ne touche jamais qu'à context_text (jamais answer_value ni les autres colonnes).
create or replace function update_fact_context(p_fact_id uuid, p_context_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fact facts%rowtype;
  v_in_play boolean;
begin
  select * into v_fact from facts where id = p_fact_id;

  if v_fact.id is null or v_fact.author_person_id is distinct from my_person_id(v_fact.family_id) then
    raise exception 'Accès refusé.';
  end if;

  select exists (
    select 1
    from quiz_questions qq
    join quiz_sessions qs on qs.id = qq.session_id
    where qq.fact_id = p_fact_id and qs.status = 'open'
  ) into v_in_play;

  if not v_in_play then
    raise exception 'Cette anecdote ne peut plus être modifiée depuis cet écran.';
  end if;

  update facts set context_text = nullif(trim(p_context_text), '') where id = p_fact_id;
end;
$$;

revoke all on function update_fact_context(uuid, text) from public;
grant execute on function update_fact_context(uuid, text) to authenticated;

-- ---------- get_revealed_question : ajoute personId aux participants ----------
-- Jusqu'ici, la révélation (écran 8) ne recevait que le nom et la réponse de chacun. La refonte
-- isole "ma réponse" dans une carte à part et colore chaque rond comme ailleurs dans l'app
-- (calculé côté client à partir de personId, voir avatarColorFor dans src/constants/soleil.ts) :
-- il lui faut donc l'identifiant de la personne, pas seulement son nom.
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
    'subjectPersonId', sp.id,
    'answerInputKind', t.answer_input_kind,
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
  where qq.id = p_quiz_question_id;

  return v_result;
end;
$$;

revoke all on function get_revealed_question(uuid) from public;
grant execute on function get_revealed_question(uuid) to authenticated;
