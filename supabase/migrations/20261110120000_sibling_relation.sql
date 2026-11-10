-- Lien direct entre adelphes (frère / sœur), décision du 2026-11-10 (voir docs/ecrans.md,
-- écran 10). Sert quand on ne connaît pas les parents de deux personnes, par exemple les
-- frères et sœurs d'une grand-mère : sans ce lien, il faudrait créer des parents fictifs.
--
-- sibling_of est symétrique, comme spouse_of : une seule ligne par paire, dans un sens
-- quelconque. Les adelphes d'une personne sont ceux liés directement, plus ceux qui
-- partagent un parent enregistré (parent_of).

alter table relationships drop constraint relationships_relation_type_check;

alter table relationships
  add constraint relationships_relation_type_check
  check (relation_type in ('parent_of', 'spouse_of', 'sibling_of'));
