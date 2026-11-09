-- Corrections (voir "Corrections" dans concept.md) : n'importe quel membre de la famille
-- (sauf l'auteur du fait lui-même) peut proposer une valeur alternative sur un fait déjà
-- créé. L'auteur original valide (accepte/refuse). Si acceptée, la valeur canonique change,
-- l'ancienne reste dans l'historique, et les scores de toutes les sessions passées ayant
-- utilisé ce fait sont recalculés rétroactivement. Si refusée, les deux versions restent
-- visibles comme une "note" sur le fait (pas de disparition silencieuse).
--
-- facts.pending_correction (jsonb) : {proposedValue, comment, proposedByPersonId, proposedAt,
-- status: 'pending' | 'refused'}. facts.answer_history (jsonb[]) : {oldValue, newValue,
-- correctedAt, note} par correction acceptée.
--
-- Lecture : facts a déjà une policy SELECT large pour les membres de la famille (voir
-- 20261106130000_rls_policies.sql), donc pending_correction/answer_history sont déjà
-- lisibles sans policy supplémentaire - rien d'aussi sensible que answer_value avant
-- révélation (une correction porte sur un fait déjà créé, potentiellement déjà révélé).

-- ---------- propose_correction ----------

create or replace function propose_correction(p_fact_id uuid, p_proposed_value jsonb, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_author_person_id uuid;
  v_my_person_id uuid;
  v_current_value jsonb;
  v_existing jsonb;
begin
  select family_id, author_person_id, answer_value, pending_correction
    into v_family_id, v_author_person_id, v_current_value, v_existing
    from facts
    where id = p_fact_id;

  if v_family_id is null then
    raise exception 'Fait introuvable.';
  end if;

  if not is_family_member(v_family_id) then
    raise exception 'Accès refusé.';
  end if;

  v_my_person_id := my_person_id(v_family_id);

  if v_my_person_id = v_author_person_id then
    raise exception 'L''auteur du fait ne peut pas proposer de correction sur son propre fait.';
  end if;

  if v_existing is not null and v_existing->>'status' = 'pending' then
    raise exception 'Une correction est déjà en attente de validation.';
  end if;

  if p_proposed_value = v_current_value then
    raise exception 'La valeur proposée est identique à la valeur actuelle.';
  end if;

  update facts
    set pending_correction = jsonb_build_object(
      'proposedValue', p_proposed_value,
      'comment', p_comment,
      'proposedByPersonId', v_my_person_id,
      'proposedAt', now(),
      'status', 'pending'
    )
    where id = p_fact_id;
end;
$$;

revoke all on function propose_correction(uuid, jsonb, text) from public;
grant execute on function propose_correction(uuid, jsonb, text) to authenticated;

-- ---------- validate_correction ----------

create or replace function validate_correction(p_fact_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_author_person_id uuid;
  v_pending jsonb;
  v_old_value jsonb;
  v_new_value jsonb;
  v_comment text;
  v_kind text;
  v_is_numeric boolean;
  rec record;
  v_matches_old boolean;
  v_matches_new boolean;
begin
  select f.family_id, f.author_person_id, f.answer_value, f.pending_correction, t.answer_input_kind
    into v_family_id, v_author_person_id, v_old_value, v_pending, v_kind
    from facts f
    join question_templates t on t.id = f.template_id
    where f.id = p_fact_id;

  if v_family_id is null then
    raise exception 'Fait introuvable.';
  end if;

  if v_author_person_id is distinct from my_person_id(v_family_id) then
    raise exception 'Seul l''auteur du fait peut valider une correction.';
  end if;

  if v_pending is null or v_pending->>'status' is distinct from 'pending' then
    raise exception 'Aucune correction en attente de validation.';
  end if;

  v_new_value := v_pending->'proposedValue';
  v_comment := v_pending->>'comment';

  if not p_accept then
    update facts
      set pending_correction = v_pending || jsonb_build_object('status', 'refused')
      where id = p_fact_id;
    return;
  end if;

  update facts
    set answer_value = v_new_value,
        pending_correction = null,
        answer_history = coalesce(answer_history, '[]'::jsonb) || jsonb_build_object(
          'oldValue', v_old_value,
          'newValue', v_new_value,
          'correctedAt', now(),
          'note', v_comment
        )
    where id = p_fact_id;

  v_is_numeric := v_kind in ('year', 'age', 'number');

  -- Recalcul rétroactif sur toutes les sessions passées ayant utilisé ce fait (pas que la
  -- plus récente : un même fait peut être repioché plus tard, voir pioche.ts).
  for rec in
    select qr.id, qr.answer_given, qr.result
    from question_recipients qr
    join quiz_questions qq on qq.id = qr.quiz_question_id
    where qq.fact_id = p_fact_id
      and qr.answer_given is not null
  loop
    if v_is_numeric then
      v_matches_old := (rec.answer_given #>> '{}')::numeric = (v_old_value #>> '{}')::numeric;
      v_matches_new := (rec.answer_given #>> '{}')::numeric = (v_new_value #>> '{}')::numeric;
    else
      v_matches_old := normalize_answer_text(rec.answer_given #>> '{}') = normalize_answer_text(v_old_value #>> '{}');
      v_matches_new := normalize_answer_text(rec.answer_given #>> '{}') = normalize_answer_text(v_new_value #>> '{}');
    end if;

    if v_matches_old and rec.result = 'correct' then
      update question_recipients set result = 'voided' where id = rec.id;
    elsif v_matches_new and rec.result <> 'correct' then
      update question_recipients set result = 'correct' where id = rec.id;
    end if;
  end loop;
end;
$$;

revoke all on function validate_correction(uuid, boolean) from public;
grant execute on function validate_correction(uuid, boolean) to authenticated;
