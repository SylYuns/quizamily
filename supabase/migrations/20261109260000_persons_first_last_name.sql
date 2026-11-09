-- persons.display_name était un seul champ texte libre, alors que tous les formulaires qui le
-- remplissent (création de famille, ajout de personne liée, rejoindre une famille) collectent
-- déjà prénom et nom séparément avant de les concaténer côté client. On garde cette séparation
-- jusqu'en base : plus simple à corriger/trier/afficher plus tard (ex: "Dédé" sans nom de
-- famille se corrige directement sur first_name/last_name dans Table Editor).
--
-- display_name devient une colonne générée (first_name + ' ' + last_name) : tout le code
-- existant qui lit persons.display_name continue de fonctionner sans changement - seuls les
-- formulaires qui CRÉENT une personne doivent écrire first_name/last_name au lieu de
-- display_name (display_name ne peut plus être fourni dans un insert/update, Postgres le
-- recalcule lui-même).

alter table persons add column first_name text;
alter table persons add column last_name text;

-- Backfill : le premier mot devient first_name, le reste last_name (imparfait pour un prénom
-- composé de 3 mots et plus, mais corrigeable à la main ensuite - voir commentaire ci-dessus).
update persons set
  first_name = split_part(display_name, ' ', 1),
  last_name = case
    when position(' ' in display_name) > 0
      then trim(substring(display_name from position(' ' in display_name) + 1))
    else ''
  end;

alter table persons alter column first_name set not null;
alter table persons alter column first_name set default '';
alter table persons alter column last_name set not null;
alter table persons alter column last_name set default '';

alter table persons drop column display_name;
alter table persons add column display_name text generated always as (trim(first_name || ' ' || last_name)) stored;

-- ---------- join_family_with_invite ----------
-- Recevait p_display_name déjà concaténé côté client ; reçoit maintenant prénom/nom séparés,
-- comme le reste de l'app.

create or replace function join_family_with_invite(p_token uuid, p_first_name text, p_last_name text, p_gender text)
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

  insert into persons (family_id, kind, user_id, first_name, last_name, gender)
  values (v_family_id, 'player', auth.uid(), p_first_name, p_last_name, p_gender)
  returning id into v_person_id;

  return v_person_id;
end;
$$;

drop function if exists join_family_with_invite(uuid, text, text);

revoke all on function join_family_with_invite(uuid, text, text, text) from public;
grant execute on function join_family_with_invite(uuid, text, text, text) to authenticated;
