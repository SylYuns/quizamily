-- Forme de la réponse au choix de l'auteur (décidé le 2026-11-24, voir docs/ecrans.md, écran 5,
-- et docs/data-model.md). Colonnes posées une fois, puis remplies pour les 17 templates du
-- catalogue qui ont "formes" (docs/question-templates.toml) — générée par
-- scripts/build-question-templates.mjs, à relancer si le catalogue change.

alter table question_templates add column if not exists answer_forms text[];
alter table question_templates add column if not exists template_text_neutral text;
alter table question_templates add column if not exists form_texts jsonb;

alter table facts add column if not exists answer_kind text;
-- Modifiable tant que le fait n'est pas posé (comme la réponse) : aucune contrainte de
-- clôture ici, la policy "the author can edit their not-yet-posed facts" s'en charge déjà.

alter table quiz_questions add column if not exists answer_kind_snapshot text;

update question_templates set
  answer_forms = array['date', 'year'],
  template_text_neutral = 'Quand <sujet> est-{il|elle} {né|née} ?',
  form_texts = '{"year":{"text":"En quelle année <sujet> est-{il|elle} {né|née} ?","recap":"{Sujet} est {né|née} en {réponse}."}}'::jsonb
where id = 'naissance-date';

update question_templates set
  answer_forms = array['free_text', 'city'],
  template_text_neutral = 'Où vivait <sujet> à sa naissance ?',
  form_texts = '{"city":{"text":"Dans quelle commune vivait <sujet> à sa naissance ?","recap":"À sa naissance, {sujet} vivait {réponse_lieu}."}}'::jsonb
where id = 'naissance-adresse';

update question_templates set
  answer_forms = array['age', 'year'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} quitté l''école ?',
  form_texts = '{"year":{"text":"En quelle année <sujet> a-t-{il|elle} quitté l''école ?","recap":"{Sujet} a quitté l''école en {réponse}."}}'::jsonb
where id = 'ecole-age-fin';

update question_templates set
  answer_forms = array['year', 'age', 'date'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} obtenu son permis de conduire ?',
  form_texts = '{"age":{"text":"À quel âge <sujet> a-t-{il|elle} obtenu son permis de conduire ?","recap":"{Sujet} a obtenu son permis de conduire à {réponse} ans."},"date":{"text":"À quelle date <sujet> a-t-{il|elle} obtenu son permis de conduire ?","recap":"{Sujet} a obtenu son permis de conduire le {réponse}."}}'::jsonb
where id = 'permis-annee';

update question_templates set
  answer_forms = array['age', 'year'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} appris à nager ?',
  form_texts = '{"year":{"text":"En quelle année <sujet> a-t-{il|elle} appris à nager ?","recap":"{Sujet} a appris à nager en {réponse}."}}'::jsonb
where id = 'nage-age';

update question_templates set
  answer_forms = array['age', 'year'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} quitté le domicile de ses parents ?',
  form_texts = '{"year":{"text":"En quelle année <sujet> a-t-{il|elle} quitté le domicile de ses parents ?","recap":"{Sujet} a quitté le domicile de ses parents en {réponse}."}}'::jsonb
where id = 'depart-domicile-age';

update question_templates set
  answer_forms = array['year', 'date', 'age'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} rencontré <conjoint> ?',
  form_texts = '{"date":{"text":"À quelle date <sujet> a-t-{il|elle} rencontré <conjoint> ?","recap":"{Sujet} a rencontré <conjoint> le {réponse}."},"age":{"text":"À quel âge <sujet> a-t-{il|elle} rencontré <conjoint> ?","recap":"{Sujet} a rencontré <conjoint> à {réponse} ans."}}'::jsonb
where id = 'rencontre-annee';

update question_templates set
  answer_forms = array['date', 'year', 'age'],
  template_text_neutral = 'Quand <sujet> s''est-{il|elle} {marié|mariée} avec <conjoint> ?',
  form_texts = '{"year":{"text":"En quelle année <sujet> s''est-{il|elle} {marié|mariée} avec <conjoint> ?","recap":"{Sujet} {s''est marié|s''est mariée} avec <conjoint> en {réponse}."},"age":{"text":"À quel âge <sujet> s''est-{il|elle} {marié|mariée} avec <conjoint> ?","recap":"{Sujet} {s''est marié|s''est mariée} avec <conjoint> à {réponse} ans."}}'::jsonb
where id = 'mariage-date';

update question_templates set
  answer_forms = array['city', 'country'],
  template_text_neutral = 'Où <sujet> s''est-{il|elle} {marié|mariée} ?',
  form_texts = '{"country":{"text":"Dans quel pays <sujet> s''est-{il|elle} {marié|mariée} ?","recap":"{Sujet} {s''est marié|s''est mariée} {réponse_lieu}."}}'::jsonb
where id = 'mariage-commune';

update question_templates set
  answer_forms = array['country', 'city'],
  template_text_neutral = 'Où <sujet> et <conjoint> sont-ils partis en voyage de noces ?',
  form_texts = '{"city":{"text":"Dans quelle ville <sujet> et <conjoint> sont-ils partis en voyage de noces ?","recap":"Leur voyage de noces les a menés {réponse_lieu}."}}'::jsonb
where id = 'voyage-noces';

update question_templates set
  answer_forms = array['city', 'country'],
  template_text_neutral = 'Où <sujet> a-t-{il|elle} fait son service militaire ?',
  form_texts = '{"country":{"text":"Dans quel pays <sujet> a-t-{il|elle} fait son service militaire ?","recap":"{Sujet} a fait son service militaire {réponse_lieu}."}}'::jsonb
where id = 'service-militaire-ville';

update question_templates set
  answer_forms = array['year', 'date'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} emménagé à son adresse actuelle ?',
  form_texts = '{"date":{"text":"À quelle date <sujet> a-t-{il|elle} emménagé à son adresse actuelle ?","recap":"{Sujet} a emménagé à son adresse actuelle le {réponse}."}}'::jsonb
where id = 'adresse-actuelle-annee';

update question_templates set
  answer_forms = array['year', 'age'],
  template_text_neutral = 'Quand <sujet> est-{il|elle} {allé|allée} voir un concert pour la première fois ?',
  form_texts = '{"age":{"text":"À quel âge <sujet> est-{il|elle} {allé|allée} voir un concert pour la première fois ?","recap":"{Sujet} est {allé|allée} à son premier concert à {réponse} ans."}}'::jsonb
where id = 'premier-concert-annee';

update question_templates set
  answer_forms = array['age', 'year'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} utilisé un ordinateur pour la première fois ?',
  form_texts = '{"year":{"text":"En quelle année <sujet> a-t-{il|elle} utilisé un ordinateur pour la première fois ?","recap":"{Sujet} a utilisé un ordinateur pour la première fois en {réponse}."}}'::jsonb
where id = 'ordinateur-age';

update question_templates set
  answer_forms = array['date', 'year', 'age'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} pris sa retraite ?',
  form_texts = '{"year":{"text":"En quelle année <sujet> a-t-{il|elle} officiellement pris sa retraite ?","recap":"{Sujet} a pris sa retraite en {réponse}."},"age":{"text":"À quel âge <sujet> a-t-{il|elle} pris sa retraite ?","recap":"{Sujet} a pris sa retraite à {réponse} ans."}}'::jsonb
where id = 'retraite-date';

update question_templates set
  answer_forms = array['year', 'age'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} pris l''avion pour la première fois ?',
  form_texts = '{"age":{"text":"À quel âge <sujet> a-t-{il|elle} pris l''avion pour la première fois ?","recap":"{Sujet} a pris l''avion pour la première fois à {réponse} ans."}}'::jsonb
where id = 'avion-annee';

update question_templates set
  answer_forms = array['year', 'age'],
  template_text_neutral = 'Quand <sujet> a-t-{il|elle} effectué son voyage <pays_lieu> ?',
  form_texts = '{"age":{"text":"À quel âge <sujet> a-t-{il|elle} effectué son voyage <pays_lieu> ?","recap":"{Sujet} a voyagé <pays_lieu> à {réponse} ans."}}'::jsonb
where id = 'voyage-pays-annee';

