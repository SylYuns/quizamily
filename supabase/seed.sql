-- Quizamily : données de référence
-- Catalogue de questions (source : docs/question-templates.toml) + valeurs de base des listes.

insert into question_templates (id, category, status, template_text, answer_input_kind, list_name, related_role, slots, condition, note, recap, sort_order) values

-- ---------- Naissance et enfance ----------
('naissance-date', 'naissance-enfance', 'mvp', 'Quelle est la date de naissance de <sujet> ?', 'date', null, null, null, null, null, '{Sujet} est {né|née} le {réponse}.', 1),
('nom-jeune-fille', 'naissance-enfance', 'mvp', 'Quel est le nom de jeune fille de <sujet> ?', 'free_text', null, null, null, 'femme', null, '{Sujet} a pour nom de jeune fille {réponse}.', 2),
('nom-jeune-fille-mere', 'naissance-enfance', 'mvp', 'Quel est le nom de jeune fille de la mère de <sujet> ?', 'free_text', null, null, null, null, null, 'Le nom de jeune fille de sa mère était {réponse}.', 3),
('naissance-adresse', 'naissance-enfance', 'mvp', 'À quelle adresse vivait <sujet> à sa naissance ?', 'free_text', null, null, null, null, null, '{Sujet} a vécu, à sa naissance, à {réponse}.', 4),
('naissance-age-aine', 'naissance-enfance', 'mvp', 'Quel âge avait l''aîné de ses frères et sœurs à la naissance de <sujet> ?', 'age', null, null, null, 'a des frères ou sœurs', 'la condition ne vérifie que l''existence d''un frère/sœur enregistré, pas l''ordre de naissance', 'À sa naissance, l''aîné de ses frères et sœurs avait {réponse} ans.', 5),
('ecole-age-fin', 'naissance-enfance', 'mvp', 'Jusqu''à quel âge <sujet> est-il allé à l''école ?', 'age', null, null, null, null, null, '{Sujet} a quitté l''école à {réponse} ans.', 6),
('enfance-animal', 'naissance-enfance', 'mvp', 'Quel animal de compagnie <sujet> a-t-il eu pendant son enfance ?', 'list', 'animaux', null, null, null, 'la liste doit contenir « aucun »', '{Sujet} a eu {réponse} comme animal de compagnie pendant son enfance.', 7),

-- ---------- Jeunesse ----------
('enfance-sport', 'jeunesse', 'mvp', 'Quel était le sport favori de <sujet> pendant son enfance ?', 'list', 'sports', null, null, null, null, '{Sujet} pratiquait {réponse} pendant son enfance.', 8),
('premiere-voiture-conduite', 'jeunesse', 'mvp', 'Quelle a été la première voiture conduite par <sujet> après avoir passé son permis ?', 'list', 'voitures', null, null, null, null, 'Sa première voiture a été une {réponse}.', 9),
('permis-annee', 'jeunesse', 'mvp', 'En quelle année <sujet> a-t-il obtenu son permis de conduire ?', 'year', null, null, null, null, null, '{Sujet} a obtenu son permis de conduire en {réponse}.', 10),
('premier-metier', 'jeunesse', 'mvp', 'Quel a été le premier métier rémunéré de <sujet> ?', 'list', 'metiers', null, null, null, null, 'Son premier métier rémunéré a été {réponse}.', 11),
('nage-age', 'jeunesse', 'mvp', 'À quel âge <sujet> a-t-il appris à nager ?', 'age', null, null, null, null, null, '{Sujet} a appris à nager à {réponse} ans.', 12),
('metier-reve', 'jeunesse', 'mvp', 'Quel métier <sujet> rêvait-il de faire quand il était enfant ?', 'list', 'metiers', null, null, null, null, 'Enfant, {sujet} rêvait de devenir {réponse}.', 13),

-- ---------- Couple et installation ----------
('depart-domicile-age', 'couple-installation', 'mvp', 'À quel âge <sujet> a-t-il quitté le domicile de ses parents ?', 'age', null, null, null, null, null, '{Sujet} a quitté le domicile de ses parents à {réponse} ans.', 14),
('rencontre-annee', 'couple-installation', 'mvp', 'En quelle année <sujet> a-t-il rencontré <conjoint> ?', 'year', null, 'conjoint', null, null, null, '{Sujet} a rencontré <conjoint> en {réponse}.', 15),
('mariage-date', 'couple-installation', 'mvp', 'Quelle est la date de mariage de <sujet> ?', 'date', null, 'conjoint', null, null, null, '{Sujet} {s''est marié|s''est mariée} avec <conjoint> le {réponse}.', 16),
('mariage-commune', 'couple-installation', 'mvp', 'Dans quelle commune <sujet> s''est-il marié ?', 'city', null, 'conjoint', null, null, null, '{Sujet} {s''est marié|s''est mariée} à {réponse}.', 17),
('voyage-noces', 'couple-installation', 'mvp', 'Où <sujet> et <conjoint> sont-ils partis en voyage de noces ?', 'place', null, 'conjoint', null, null, null, 'Leur voyage de noces les a menés à {réponse}.', 18),
('mariage-voiture', 'couple-installation', 'mvp', 'Quelle voiture a conduit les mariés le jour du mariage de <sujet> ?', 'list', 'voitures', 'conjoint', null, null, null, 'Le jour du mariage, les mariés sont arrivés en {réponse}.', 19),
('service-militaire-ville', 'couple-installation', 'mvp', 'Où <sujet> a-t-il fait son service militaire ?', 'place', null, null, null, 'homme', null, '{Sujet} a fait son service militaire à {réponse}.', 20),
('adresse-actuelle-annee', 'couple-installation', 'mvp', 'En quelle année <sujet> a-t-il emménagé à son adresse actuelle ?', 'year', null, null, null, 'vivant', null, '{Sujet} a emménagé à son adresse actuelle en {réponse}.', 21),

-- ---------- Culture et premières fois ----------
('premier-concert-annee', 'culture-premieres-fois', 'mvp', 'En quelle année <sujet> est-il allé voir un concert pour la première fois ?', 'year', null, null, null, null, null, '{Sujet} est {allé|allée} à son premier concert en {réponse}.', 22),
('premier-concert-artiste', 'culture-premieres-fois', 'mvp', 'Quel artiste <sujet> est-il allé voir lors de son premier concert ?', 'list', 'personnalites', null, null, null, null, 'Le premier concert de {sujet} était celui de {réponse}.', 23),
('television-annee', 'culture-premieres-fois', 'mvp', 'En quelle année <sujet> a-t-il eu une télévision à la maison ?', 'year', null, null, null, null, null, '{Sujet} a eu la télévision à la maison en {réponse}.', 24),
('premier-film-cinema', 'culture-premieres-fois', 'mvp', 'Quel film <sujet> a-t-il vu la première fois qu''il est allé au cinéma ?', 'list', 'films', null, null, null, null, 'Le premier film vu par {sujet} au cinéma était {réponse}.', 25),
('ordinateur-age', 'culture-premieres-fois', 'mvp', 'À quel âge <sujet> a-t-il utilisé un ordinateur pour la première fois ?', 'age', null, null, null, null, null, '{Sujet} a utilisé un ordinateur pour la première fois à {réponse} ans.', 26),

-- ---------- Retraite, voyages et loisirs ----------
('retraite-date', 'retraite-voyages-loisirs', 'mvp', 'À quelle date <sujet> a-t-il officiellement pris sa retraite ?', 'date', null, null, null, null, null, '{Sujet} a pris sa retraite le {réponse}.', 27),
('premier-pays-etranger', 'retraite-voyages-loisirs', 'mvp', 'Quel pays étranger <sujet> a-t-il visité lors de son premier voyage hors de France ?', 'country', null, null, null, null, null, 'Le premier pays étranger visité par {sujet} a été {réponse}.', 28),
('avion-annee', 'retraite-voyages-loisirs', 'mvp', 'En quelle année <sujet> a-t-il pris l''avion pour la première fois ?', 'year', null, null, null, null, null, '{Sujet} a pris l''avion pour la première fois en {réponse}.', 29),
('voyage-pays-annee', 'retraite-voyages-loisirs', 'mvp', 'En quelle année <sujet> a-t-il effectué son voyage en <pays> ?', 'year', null, null, '["pays"]', null, 'l''auteur choisit le pays au moment d''ajouter le fait', '{Sujet} a voyagé en <pays> en {réponse}.', 30),
('dernier-pays-etranger', 'retraite-voyages-loisirs', 'mvp', 'Quel est le dernier pays étranger que <sujet> a visité ?', 'country', null, null, null, null, null, 'Le dernier pays étranger visité par {sujet} est {réponse}.', 31),
('club-associatif', 'retraite-voyages-loisirs', 'mvp', 'Quel est le nom du club associatif dont <sujet> fait partie ?', 'free_text', null, null, null, null, null, '{Sujet} fait partie de {réponse}.', 32)

on conflict (id) do update set
  category = excluded.category,
  status = excluded.status,
  template_text = excluded.template_text,
  answer_input_kind = excluded.answer_input_kind,
  list_name = excluded.list_name,
  related_role = excluded.related_role,
  slots = excluded.slots,
  condition = excluded.condition,
  note = excluded.note,
  recap = excluded.recap,
  sort_order = excluded.sort_order;

-- ---------- list_items : valeur de base obligatoire ----------

insert into list_items (list_name, value, status, family_id, created_by_person_id)
values ('animaux', 'aucun', 'approved', null, null)
on conflict do nothing;
