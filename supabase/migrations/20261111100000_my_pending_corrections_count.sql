-- Nouvel accueil (écran 4) : badge « Mes faits » quand une correction proposée sur l'un de
-- mes faits attend ma décision. facts.pending_correction n'est plus lisible directement
-- depuis la migration 20261110140000_hide_answers_from_direct_reads.sql : fonction dédiée,
-- même esprit que get_my_fact_answers.

create or replace function get_my_pending_corrections_count(p_family_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from facts f
  where f.family_id = p_family_id
    and is_family_member(p_family_id)
    and f.author_person_id = my_person_id(p_family_id)
    and f.pending_correction->>'status' = 'pending';
$$;

revoke all on function get_my_pending_corrections_count(uuid) from public;
grant execute on function get_my_pending_corrections_count(uuid) to authenticated;
