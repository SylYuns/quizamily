-- Les listes déroulantes saisissables (voir docs/ecrans.md, « Règles communes ») affichent
-- des suggestions dès qu'on touche le champ, pas seulement après avoir tapé une lettre.
-- search_list_items() refusait jusqu'ici toute requête vide (`length(q.key) > 0`), ce qui
-- convenait à l'ancien champ (rien ne s'affichait avant la première frappe) mais empêche
-- d'afficher un premier jet de propositions à l'ouverture. Une requête vide renvoie maintenant
-- les valeurs les plus courtes puis l'ordre alphabétique (même tri qu'avant à égalité), sans
-- changer le comportement d'une requête non vide.
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
    and (length(q.key) = 0 or li.search_key like '%' || q.key || '%')
  order by
    case
      when length(q.key) = 0 then 0
      when li.search_key = q.key then 0
      when li.search_key like q.key || '%' then 1
      else 2
    end,
    length(li.value),
    li.value
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

grant execute on function search_list_items(text, text, text, uuid, int) to authenticated;
