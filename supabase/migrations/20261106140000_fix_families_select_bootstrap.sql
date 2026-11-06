-- Corrige le blocage d'amorçage : juste après avoir créé une famille, son créateur
-- n'a pas encore de fiche persons dedans, donc is_family_member() renvoie faux et
-- le `.select().single()` qui suit l'insert ne retrouve pas la ligne.

alter policy "members can select their families" on families
  using (is_family_member(id) or created_by = auth.uid());
