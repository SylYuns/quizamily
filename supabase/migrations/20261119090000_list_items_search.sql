-- Listes de référence : recherche et catégories (2026-11-19, voir docs/roadmap.md, Feuille de
-- route, étape 2, et docs/data-model.md).
--
-- 1. Recherche : avec des centaines de valeurs (métiers, voitures) ou des milliers (films),
--    le champ ne peut plus afficher toute la liste. L'appli tape quelques lettres et
--    search_list_items() renvoie les meilleures correspondances, sans tenir compte des
--    accents, majuscules, espaces, tirets et apostrophes (même normalisation que la
--    correction des réponses : normalize_answer_text). Colonne search_key tenue à jour par
--    un déclencheur.
-- 2. Catégories : une liste peut être découpée en catégories (personnalités : musique,
--    politique, sport…). Une question peut limiter la recherche à une catégorie
--    (question_templates.list_category, ex : « artiste du premier concert » → musique).
--    Une même valeur peut exister dans deux catégories (un chanteur aussi acteur).

-- ---------- list_items : search_key, category ----------

alter table list_items add column if not exists category text;
alter table list_items add column if not exists search_key text;

create or replace function list_items_set_search_key()
returns trigger
language plpgsql
as $$
begin
  new.search_key := normalize_answer_text(new.value);
  return new;
end;
$$;

drop trigger if exists list_items_search_key on list_items;
create trigger list_items_search_key
  before insert or update of value on list_items
  for each row execute function list_items_set_search_key();

update list_items set search_key = normalize_answer_text(value) where search_key is null;
alter table list_items alter column search_key set not null;

-- Unicité par catégorie (une même valeur peut être dans deux catégories).
drop index if exists list_items_approved_value_idx;
drop index if exists list_items_pending_value_idx;
create unique index list_items_approved_value_idx
  on list_items (list_name, coalesce(category, ''), lower(value)) where status = 'approved';
create unique index list_items_pending_value_idx
  on list_items (list_name, coalesce(category, ''), family_id, lower(value)) where status = 'pending';
create index if not exists list_items_search_idx on list_items (list_name, category, search_key);

-- ---------- question_templates : catégorie de liste ----------

alter table question_templates add column if not exists list_category text;

-- ---------- search_list_items ----------
-- Fonction ordinaire (pas security definer) : la RLS de list_items s'applique, donc chacun
-- ne voit que les valeurs validées et celles de sa propre famille.
-- p_family_id : null = valeurs validées seulement (écran de réponse, pour ne pas trahir une
-- valeur que l'auteur vient d'ajouter) ; sinon, valeurs validées + ajouts de cette famille.
-- Classement : valeur identique, puis commençant par la recherche, puis la contenant ;
-- à égalité, la plus courte d'abord (« Renault » avant « Renault 4L »), puis l'ordre alphabétique.

create or replace function search_list_items(
  p_list_name text,
  p_query text,
  p_category text default null,
  p_family_id uuid default null,
  p_limit int default 12
)
returns table (value text, category text, is_family_item boolean)
language sql
stable
set search_path = public
as $$
  with q as (select normalize_answer_text(p_query) as key)
  select li.value, li.category, li.status = 'pending' as is_family_item
  from list_items li, q
  where li.list_name = p_list_name
    and (p_category is null or li.category = p_category)
    and (li.status = 'approved' or (p_family_id is not null and li.family_id = p_family_id))
    and length(q.key) > 0
    and li.search_key like '%' || q.key || '%'
  order by
    case when li.search_key = q.key then 0 when li.search_key like q.key || '%' then 1 else 2 end,
    length(li.value),
    li.value
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

grant execute on function search_list_items(text, text, text, uuid, int) to authenticated;

-- Le premier concert ne propose que des artistes de musique.
update question_templates set list_category = 'musique' where id = 'premier-concert-artiste';
