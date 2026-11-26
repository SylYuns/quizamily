-- Emblème de la famille (2026-11-24, voir docs/design.md et docs/roadmap.md, étape 6 quinquies) :
-- symbole dessiné + couleur + 2 lettres, affiché dans le nouvel en-tête partagé de tous les
-- écrans d'une famille. emblem_symbol n'a pas de contrainte ici : la liste des symboles dessinés
-- (vache, lézard, chien aujourd'hui, une vingtaine à terme) est fermée côté appli, pas en base,
-- pour ne pas redemander une migration à chaque nouveau symbole dessiné.

alter table families add column if not exists emblem_symbol text;
alter table families add column if not exists emblem_color text
  check (emblem_color in ('bleu', 'rouge', 'jaune', 'vert', 'orange', 'rose', 'violet', 'brun'));
alter table families add column if not exists emblem_letters text;

create or replace function families_set_emblem_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.emblem_symbol is null then
    new.emblem_symbol := (array['vache', 'lezard', 'chien'])[1 + floor(random() * 3)];
  end if;
  if new.emblem_color is null then
    new.emblem_color := (array['bleu', 'rouge', 'jaune', 'vert', 'orange', 'rose', 'violet', 'brun'])[1 + floor(random() * 8)];
  end if;
  if new.emblem_letters is null then
    new.emblem_letters := upper(substring(regexp_replace(new.name, '[^[:alpha:]]', '', 'g') from 1 for 2));
  end if;
  return new;
end;
$$;

drop trigger if exists families_emblem_defaults on families;
create trigger families_emblem_defaults
  before insert on families
  for each row execute function families_set_emblem_defaults();

-- Backfill des familles déjà créées.
update families set
  emblem_symbol = (array['vache', 'lezard', 'chien'])[1 + floor(random() * 3)],
  emblem_color = (array['bleu', 'rouge', 'jaune', 'vert', 'orange', 'rose', 'violet', 'brun'])[1 + floor(random() * 8)],
  emblem_letters = upper(substring(regexp_replace(name, '[^[:alpha:]]', '', 'g') from 1 for 2))
where emblem_symbol is null;

alter table families alter column emblem_symbol set not null;
alter table families alter column emblem_color set not null;
alter table families alter column emblem_letters set not null;

-- ---------- modification réservée au créateur ----------
-- Remplace "members can update their family" (toute modif par tout membre, posée avant qu'il
-- n'y ait rien à modifier) : seul le créateur peut modifier sa famille (ex: changer l'emblème).

drop policy if exists "members can update their family" on families;

create policy "the creator can update their family" on families
  for update using (created_by = auth.uid());
