-- Corrige un écart repéré en testant l'étape 6 quater à l'écran : question_templates.recap
-- (et template_text pour voyage-pays-annee) n'avait jamais été resynchronisé avec le
-- <pays_lieu>/{réponse_lieu} introduit dans docs/question-templates.toml le 2026-11-24 — ces
-- 4 templates gardaient encore l'ancien texte figé « à »/« en <pays> » (ex : « voyage en
-- (pays à préciser) » au lieu de « voyage en Italie »). docs/question-templates.toml est la
-- seule source à jour : ni cette table ni supabase/seed.sql (qui a le même écart) n'étaient
-- resynchronisés automatiquement.

update question_templates set
  recap = '{Sujet} {s''est marié|s''est mariée} {réponse_lieu}.'
where id = 'mariage-commune';

update question_templates set
  recap = 'Leur voyage de noces les a menés {réponse_lieu}.'
where id = 'voyage-noces';

update question_templates set
  recap = '{Sujet} a fait son service militaire {réponse_lieu}.'
where id = 'service-militaire-ville';

update question_templates set
  template_text = 'En quelle année <sujet> a-t-{il|elle} effectué son voyage <pays_lieu> ?',
  recap = '{Sujet} a voyagé <pays_lieu> en {réponse}.'
where id = 'voyage-pays-annee';
