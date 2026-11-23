-- Comble un trou repéré en recodant « Mes faits » (écran 5, voir docs/ecrans.md) : la doc
-- prévoit que l'auteur y voie le détail des corrections proposées sur ses faits et les
-- accepte/refuse, et l'accueil affiche déjà un badge « Mes faits » dans ce sens
-- (get_my_pending_corrections_count), mais rien ne renvoyait jusqu'ici le détail à afficher —
-- facts.pending_correction n'est plus lisible directement par une requête du client depuis
-- la migration 20261110140000_hide_answers_from_direct_reads.sql (colonnes retirées des
-- privilèges de lecture), même si le commentaire de 20261109220000_corrections.sql, écrit
-- avant cette migration, dit encore le contraire.
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
    substitute_question_text(t.template_text, t.related_role, sp.display_name, rp.display_name, f.slot_values, sp.gender),
    t.answer_input_kind,
    f.answer_value,
    f.pending_correction -> 'proposedValue',
    f.pending_correction ->> 'comment',
    (f.pending_correction ->> 'proposedAt')::timestamptz
  from facts f
  join question_templates t on t.id = f.template_id
  join persons sp on sp.id = f.subject_person_id
  left join persons rp on rp.id = f.related_person_id
  where f.family_id = p_family_id
    and is_family_member(p_family_id)
    and f.author_person_id = my_person_id(p_family_id)
    and f.pending_correction ->> 'status' = 'pending';
$$;

revoke all on function get_my_pending_corrections(uuid) from public;
grant execute on function get_my_pending_corrections(uuid) to authenticated;
