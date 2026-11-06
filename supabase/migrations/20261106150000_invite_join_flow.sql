-- Rejoindre une famille via un lien d'invitation.
--
-- Le lien d'une famille est partagé avec PLUSIEURS membres (pas à usage unique),
-- donc on retire le suivi "utilisé par une seule personne" qui ne correspond pas
-- à ce fonctionnement.
alter table invites drop column if exists used_by_person_id;
alter table invites drop column if exists used_at;

-- Un visiteur qui n'est pas encore membre ne peut pas lire `invites`/`families`
-- directement (RLS scopée par famille). Ces deux fonctions security definer
-- exposent le strict nécessaire pour l'écran "rejoindre une famille" :
-- le nom de la famille (aperçu) et l'action de rejoindre elle-même.

create or replace function get_invite_family_name(p_token uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select f.name
  from invites i
  join families f on f.id = i.family_id
  where i.token = p_token
    and (i.expires_at is null or i.expires_at > now());
$$;

revoke all on function get_invite_family_name(uuid) from public;
grant execute on function get_invite_family_name(uuid) to authenticated;

create or replace function join_family_with_invite(p_token uuid, p_display_name text, p_gender text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_person_id uuid;
begin
  select family_id into v_family_id
  from invites
  where token = p_token
    and (expires_at is null or expires_at > now());

  if v_family_id is null then
    raise exception 'Invitation invalide ou expirée';
  end if;

  select id into v_person_id
  from persons
  where family_id = v_family_id and user_id = auth.uid();

  if v_person_id is not null then
    return v_person_id;
  end if;

  insert into persons (family_id, kind, user_id, display_name, gender)
  values (v_family_id, 'player', auth.uid(), p_display_name, p_gender)
  returning id into v_person_id;

  return v_person_id;
end;
$$;

revoke all on function join_family_with_invite(uuid, text, text) from public;
grant execute on function join_family_with_invite(uuid, text, text) to authenticated;
