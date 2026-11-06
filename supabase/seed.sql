-- Quizamily : données de référence
-- Catalogue de questions (source : docs/question-templates.toml) + valeurs de base des listes.

insert into question_templates (id, category, status, template_text, answer_input_kind, list_name, related_role, slots, condition, note) values

-- ---------- Naissance et enfance ----------
('naissance-date', 'naissance-enfance', 'mvp', 'Quelle est la date de naissance de <sujet> ?', 'date', null, null, null, null, null),
('nom-jeune-fille', 'naissance-enfance', 'mvp', 'Quel est le nom de jeune fille de <sujet> ?', 'free_text', null, null, null, 'femme', null),
('nom-jeune-fille-mere', 'naissance-enfance', 'mvp', 'Quel est le nom de jeune fille de la mère de <sujet> ?', 'free_text', null, null, null, null, null),
('naissance-adresse', 'naissance-enfance', 'mvp', 'À quelle adresse vivait <sujet> à sa naissance ?', 'free_text', null, null, null, null, null),
('naissance-age-aine', 'naissance-enfance', 'mvp', 'Quel âge avait l''aîné de ses frères et sœurs à la naissance de <sujet> ?', 'age', null, null, null, 'a des frères ou sœurs', 'la condition ne vérifie que l''existence d''un frère/sœur enregistré, pas l''ordre de naissance'),
('ecole-age-fin', 'naissance-enfance', 'mvp', 'Jusqu''à quel âge <sujet> est-il allé à l''école ?', 'age', null, null, null, null, null),
('enfance-animal', 'naissance-enfance', 'mvp', 'Quel animal de compagnie <sujet> a-t-il eu pendant son enfance ?', 'list', 'animaux', null, null, null, 'la liste doit contenir « aucun »'),

-- ---------- Jeunesse ----------
('enfance-sport', 'jeunesse', 'mvp', 'Quel était le sport favori de <sujet> pendant son enfance ?', 'list', 'sports', null, null, null, null),
('premiere-voiture-conduite', 'jeunesse', 'mvp', 'Quelle a été la première voiture conduite par <sujet> après avoir passé son permis ?', 'list', 'voitures', null, null, null, null),
('permis-annee', 'jeunesse', 'mvp', 'En quelle année <sujet> a-t-il obtenu son permis de conduire ?', 'year', null, null, null, null, null),
('premier-metier', 'jeunesse', 'mvp', 'Quel a été le premier métier rémunéré de <sujet> ?', 'list', 'metiers', null, null, null, null),
('nage-age', 'jeunesse', 'mvp', 'À quel âge <sujet> a-t-il appris à nager ?', 'age', null, null, null, null, null),
('metier-reve', 'jeunesse', 'mvp', 'Quel métier <sujet> rêvait-il de faire quand il était enfant ?', 'list', 'metiers', null, null, null, null),

-- ---------- Couple et installation ----------
('depart-domicile-age', 'couple-installation', 'mvp', 'À quel âge <sujet> a-t-il quitté le domicile de ses parents ?', 'age', null, null, null, null, null),
('rencontre-annee', 'couple-installation', 'mvp', 'En quelle année <sujet> a-t-il rencontré <conjoint> ?', 'year', null, 'conjoint', null, null, null),
('mariage-date', 'couple-installation', 'mvp', 'Quelle est la date de mariage de <sujet> ?', 'date', null, 'conjoint', null, null, null),
('mariage-commune', 'couple-installation', 'mvp', 'Dans quelle commune <sujet> s''est-il marié ?', 'city', null, 'conjoint', null, null, null),
('voyage-noces', 'couple-installation', 'mvp', 'Où <sujet> et <conjoint> sont-ils partis en voyage de noces ?', 'place', null, 'conjoint', null, null, null),
('mariage-voiture', 'couple-installation', 'mvp', 'Quelle voiture a conduit les mariés le jour du mariage de <sujet> ?', 'list', 'voitures', 'conjoint', null, null, null),
('service-militaire-ville', 'couple-installation', 'mvp', 'Où <sujet> a-t-il fait son service militaire ?', 'place', null, null, null, 'homme', null),
('adresse-actuelle-annee', 'couple-installation', 'mvp', 'En quelle année <sujet> a-t-il emménagé à son adresse actuelle ?', 'year', null, null, null, 'vivant', null),

-- ---------- Culture et premières fois ----------
('premier-concert-annee', 'culture-premieres-fois', 'mvp', 'En quelle année <sujet> est-il allé voir un concert pour la première fois ?', 'year', null, null, null, null, null),
('premier-concert-artiste', 'culture-premieres-fois', 'mvp', 'Quel artiste <sujet> est-il allé voir lors de son premier concert ?', 'list', 'personnalites', null, null, null, null),
('television-annee', 'culture-premieres-fois', 'mvp', 'En quelle année <sujet> a-t-il eu une télévision à la maison ?', 'year', null, null, null, null, null),
('premier-film-cinema', 'culture-premieres-fois', 'mvp', 'Quel film <sujet> a-t-il vu la première fois qu''il est allé au cinéma ?', 'list', 'films', null, null, null, null),
('ordinateur-age', 'culture-premieres-fois', 'mvp', 'À quel âge <sujet> a-t-il utilisé un ordinateur pour la première fois ?', 'age', null, null, null, null, null),

-- ---------- Retraite, voyages et loisirs ----------
('retraite-date', 'retraite-voyages-loisirs', 'mvp', 'À quelle date <sujet> a-t-il officiellement pris sa retraite ?', 'date', null, null, null, null, null),
('premier-pays-etranger', 'retraite-voyages-loisirs', 'mvp', 'Quel pays étranger <sujet> a-t-il visité lors de son premier voyage hors de France ?', 'country', null, null, null, null, null),
('avion-annee', 'retraite-voyages-loisirs', 'mvp', 'En quelle année <sujet> a-t-il pris l''avion pour la première fois ?', 'year', null, null, null, null, null),
('voyage-pays-annee', 'retraite-voyages-loisirs', 'mvp', 'En quelle année <sujet> a-t-il effectué son voyage en <pays> ?', 'year', null, null, '["pays"]', null, 'l''auteur choisit le pays au moment d''ajouter le fait'),
('dernier-pays-etranger', 'retraite-voyages-loisirs', 'mvp', 'Quel est le dernier pays étranger que <sujet> a visité ?', 'country', null, null, null, null, null),
('club-associatif', 'retraite-voyages-loisirs', 'mvp', 'Quel est le nom du club associatif dont <sujet> fait partie ?', 'free_text', null, null, null, null, null)

on conflict (id) do update set
  category = excluded.category,
  status = excluded.status,
  template_text = excluded.template_text,
  answer_input_kind = excluded.answer_input_kind,
  list_name = excluded.list_name,
  related_role = excluded.related_role,
  slots = excluded.slots,
  condition = excluded.condition,
  note = excluded.note;

-- ---------- list_items : valeur de base obligatoire ----------

insert into list_items (list_name, value, status, family_id, created_by_person_id)
values ('animaux', 'aucun', 'approved', null, null)
on conflict do nothing;
