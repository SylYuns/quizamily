-- Quizamily : policies RLS (accès scopé par appartenance à la famille)
--
-- Portée de cette migration : empêcher toute fuite de données entre familles,
-- et appliquer les règles déjà décidées (un fait non encore posé ne se modifie
-- que par son auteur, etc.).
--
-- Hors scope, à traiter avec les écrans concernés (voir docs/roadmap.md) :
--   - masquer answer_value / answer_value_snapshot avant la révélation d'une question
--     (nécessite une vue ou fonction dédiée, pas juste du RLS par ligne) ;
--   - laisser voir les réponses de tous les joueurs une fois une question révélée
--     (question_recipients ne montre pour l'instant que sa propre réponse) ;
--   - policy de mise à jour pour l'écran "valider les réponses libres" (auteur du
--     fait, puis prise de main après 7 jours).
-- Ces deux points seront ajoutés avec les écrans "répondre" / "révélation" / "valider".

-- ---------- valeurs par défaut pratiques ----------

alter table families alter column created_by set default auth.uid();
alter table persons alter column created_by set default auth.uid();
alter table relationships alter column created_by set default auth.uid();
alter table invites alter column created_by set default auth.uid();

-- ---------- helper : appartenance à une famille ----------

create or replace function is_family_member(p_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from persons
    where persons.family_id = p_family_id
      and persons.user_id = auth.uid()
  );
$$;

-- helper : la personne (kind='player') correspondant à l'utilisateur courant, dans une famille donnée
create or replace function my_person_id(p_family_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from persons
  where persons.family_id = p_family_id
    and persons.user_id = auth.uid()
  limit 1;
$$;

-- ---------- families ----------

create policy "members can select their families" on families
  for select using (is_family_member(id));

create policy "authenticated users can create a family" on families
  for insert with check (created_by = auth.uid());

create policy "members can update their family" on families
  for update using (is_family_member(id));

-- ---------- persons ----------

create policy "members can select persons in their family" on persons
  for select using (is_family_member(family_id));

create policy "members (or the family creator) can add a person" on persons
  for insert with check (
    is_family_member(family_id)
    or exists (select 1 from families f where f.id = family_id and f.created_by = auth.uid())
  );

create policy "members can update persons in their family" on persons
  for update using (is_family_member(family_id));

-- ---------- relationships ----------

create policy "members can select relationships in their family" on relationships
  for select using (is_family_member(family_id));

create policy "members can add relationships in their family" on relationships
  for insert with check (is_family_member(family_id));

create policy "members can update relationships in their family" on relationships
  for update using (is_family_member(family_id));

create policy "members can delete relationships in their family" on relationships
  for delete using (is_family_member(family_id));

-- ---------- invites ----------
-- Rejoindre une famille via un token se fait par une fonction dédiée (sécurisée,
-- à écrire avec l'écran "créer ou rejoindre une famille"), pas par une policy
-- d'update ouverte : ces lignes restent donc en lecture/écriture restreintes.

create policy "members can select invites of their family" on invites
  for select using (is_family_member(family_id));

create policy "members can create invites for their family" on invites
  for insert with check (is_family_member(family_id) and created_by = auth.uid());

create policy "members can revoke invites of their family" on invites
  for delete using (is_family_member(family_id));

-- ---------- question_templates ----------
-- Catalogue public, le même pour toutes les familles, géré par nous (pas de policy d'écriture).

alter table question_templates enable row level security;

create policy "authenticated users can read the template catalog" on question_templates
  for select using (auth.uid() is not null);

-- ---------- list_items ----------

create policy "members can select approved or their own pending list items" on list_items
  for select using (status = 'approved' or is_family_member(family_id));

create policy "members can propose a pending list item for their family" on list_items
  for insert with check (status = 'pending' and is_family_member(family_id));

-- ---------- facts ----------

create policy "members can select facts in their family" on facts
  for select using (is_family_member(family_id));

create policy "members can add a fact as themselves" on facts
  for insert with check (
    is_family_member(family_id)
    and author_person_id = my_person_id(family_id)
  );

create policy "the author can edit their not-yet-posed facts" on facts
  for update using (
    author_person_id = my_person_id(family_id)
    and not exists (select 1 from quiz_questions qq where qq.fact_id = facts.id)
  );

create policy "the author can delete their not-yet-posed facts" on facts
  for delete using (
    author_person_id = my_person_id(family_id)
    and not exists (select 1 from quiz_questions qq where qq.fact_id = facts.id)
  );

-- ---------- fact_attachments ----------

create policy "members can select attachments of facts in their family" on fact_attachments
  for select using (
    exists (select 1 from facts f where f.id = fact_id and is_family_member(f.family_id))
  );

create policy "members can attach a file as themselves" on fact_attachments
  for insert with check (
    exists (
      select 1 from facts f
      where f.id = fact_id
        and is_family_member(f.family_id)
        and author_person_id = my_person_id(f.family_id)
    )
  );

-- ---------- quiz_sessions ----------
-- Créées/closes par une Edge Function (service_role, qui bypass RLS) : lecture seule ici.

create policy "members can select sessions of their family" on quiz_sessions
  for select using (is_family_member(family_id));

-- ---------- quiz_questions ----------
-- Écriture (validation des réponses libres, prise de main) ajoutée avec l'écran correspondant.

create policy "members can select questions of their family" on quiz_questions
  for select using (
    exists (
      select 1 from quiz_sessions qs
      where qs.id = session_id and is_family_member(qs.family_id)
    )
  );

-- ---------- question_recipients ----------
-- Pour l'instant, chacun ne voit que sa propre réponse (pas celles des autres,
-- même après révélation : à élargir avec l'écran "révélation").

create policy "a player can select their own answer" on question_recipients
  for select using (
    exists (select 1 from persons p where p.id = person_id and p.user_id = auth.uid())
  );

-- ---------- fact_reactions ----------

create policy "members can select reactions in their family" on fact_reactions
  for select using (
    exists (select 1 from facts f where f.id = fact_id and is_family_member(f.family_id))
  );

create policy "members can react as themselves" on fact_reactions
  for insert with check (
    exists (
      select 1 from facts f
      where f.id = fact_id
        and is_family_member(f.family_id)
        and person_id = my_person_id(f.family_id)
    )
  );

create policy "members can remove their own reaction" on fact_reactions
  for delete using (
    exists (select 1 from persons p where p.id = person_id and p.user_id = auth.uid())
  );

-- ---------- fact_comments ----------

create policy "members can select comments in their family" on fact_comments
  for select using (
    exists (select 1 from facts f where f.id = fact_id and is_family_member(f.family_id))
  );

create policy "members can comment as themselves" on fact_comments
  for insert with check (
    exists (
      select 1 from facts f
      where f.id = fact_id
        and is_family_member(f.family_id)
        and person_id = my_person_id(f.family_id)
    )
  );

create policy "members can edit or delete their own comment" on fact_comments
  for update using (
    exists (select 1 from persons p where p.id = person_id and p.user_id = auth.uid())
  );

create policy "members can delete their own comment" on fact_comments
  for delete using (
    exists (select 1 from persons p where p.id = person_id and p.user_id = auth.uid())
  );
