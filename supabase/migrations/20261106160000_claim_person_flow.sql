-- Un membre qui rejoint une famille peut "réclamer" une fiche déjà créée par le
-- créateur de la famille (ex: un enfant de la personne centrale) plutôt que de
-- toujours créer une nouvelle fiche vide. Ça établit aussi le lien de parenté
-- sans avoir à le redemander, puisque le créateur l'a déjà renseigné via
-- `relationships` en créant la fiche.

create or replace function get_invite_unclaimed_persons(p_token uuid)
returns table (id uuid, display_name text, is_central boolean, parent_names text[])
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.display_name,
    p.is_central,
    coalesce(
      (select array_agg(parent.display_name order by parent.display_name)
       from relationships r
       join persons parent on parent.id = r.person_a_id
       where r.person_b_id = p.id and r.relation_type = 'parent_of'),
      array[]::text[]
    ) as parent_names
  from persons p
  join invites i on i.family_id = p.family_id
  where i.token = p_token
    and (i.expires_at is null or i.expires_at > now())
    and p.kind = 'profile'
    and p.user_id is null
  order by p.is_central desc, p.display_name;
$$;

revoke all on function get_invite_unclaimed_persons(uuid) from public;
grant execute on function get_invite_unclaimed_persons(uuid) to authenticated;

create or replace function claim_person_with_invite(p_token uuid, p_person_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_claimed_id uuid;
begin
  select family_id into v_family_id
  from invites
  where token = p_token
    and (expires_at is null or expires_at > now());

  if v_family_id is null then
    raise exception 'Invitation invalide ou expirée';
  end if;

  update persons
  set kind = 'player', user_id = auth.uid()
  where id = p_person_id
    and family_id = v_family_id
    and kind = 'profile'
    and user_id is null
  returning id into v_claimed_id;

  if v_claimed_id is null then
    raise exception 'Cette fiche a déjà été réclamée par quelqu''un d''autre, ou n''existe plus.';
  end if;

  return v_claimed_id;
end;
$$;

revoke all on function claim_person_with_invite(uuid, uuid) from public;
grant execute on function claim_person_with_invite(uuid, uuid) to authenticated;
