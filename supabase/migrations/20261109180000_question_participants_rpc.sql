-- Permet à l'auteur d'un fait de voir qui, dans la famille, a déjà répondu ou non à sa
-- question en cours ("Ma question", voir src/app/respond.tsx) — sans jamais exposer le
-- contenu des réponses (answer_given), pour ne pas gâcher la révélation.
--
-- Volontairement une fonction security definer plutôt qu'un assouplissement de la policy
-- RLS sur question_recipients : une policy plus large exposerait aussi answer_given/result,
-- alors qu'on ne veut laisser filtrer que le statut répondu/pas répondu.

create or replace function get_question_participants(p_quiz_question_id uuid)
returns table (person_id uuid, display_name text, answered boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_author_person_id uuid;
begin
  select f.family_id, f.author_person_id
    into v_family_id, v_author_person_id
    from quiz_questions qq
    join facts f on f.id = qq.fact_id
    where qq.id = p_quiz_question_id;

  if v_family_id is null then
    return;
  end if;

  if v_author_person_id is distinct from my_person_id(v_family_id) then
    raise exception 'Seul l''auteur du fait peut voir qui a répondu.';
  end if;

  return query
    select qr.person_id, p.display_name, (qr.result <> 'unanswered') as answered
    from question_recipients qr
    join persons p on p.id = qr.person_id
    where qr.quiz_question_id = p_quiz_question_id
    order by p.display_name;
end;
$$;

revoke all on function get_question_participants(uuid) from public;
grant execute on function get_question_participants(uuid) to authenticated;
