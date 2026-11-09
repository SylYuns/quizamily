-- Permet à un joueur de répondre à sa propre question (écran "Répondre") : jusqu'ici,
-- question_recipients n'avait qu'une policy de lecture (voir 20261106130000_rls_policies.sql,
-- qui documentait ce manque explicitement en attendant cet écran).
--
-- Volontairement simple pour l'instant : pas de verrou après la deadline ou après validation
-- d'une réponse en saisie libre (la révélation automatique à la deadline, qui gérera ça,
-- n'existe pas encore - voir roadmap.md étape 9).

create policy "a player can answer their own question" on question_recipients
  for update using (
    exists (select 1 from persons p where p.id = person_id and p.user_id = auth.uid())
  );
