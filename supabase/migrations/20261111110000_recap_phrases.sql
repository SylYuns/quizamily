-- Récapitulatif d'une personne (écran 11) : une phrase recap par template, assemblée par
-- catégorie côté client (src/lib/recap.ts). Voir docs/question-templates.toml pour la syntaxe
-- ({Sujet}/{sujet}, {réponse}, {forme_homme|forme_femme}, <conjoint>/<pays>).

alter table question_templates add column recap text;

update question_templates set recap = v.recap
from (values
  ('naissance-date', '{Sujet} est {né|née} le {réponse}.'),
  ('nom-jeune-fille', '{Sujet} a pour nom de jeune fille {réponse}.'),
  ('nom-jeune-fille-mere', 'Le nom de jeune fille de sa mère était {réponse}.'),
  ('naissance-adresse', '{Sujet} a vécu, à sa naissance, à {réponse}.'),
  ('naissance-age-aine', 'À sa naissance, l''aîné de ses frères et sœurs avait {réponse} ans.'),
  ('ecole-age-fin', '{Sujet} a quitté l''école à {réponse} ans.'),
  ('enfance-animal', '{Sujet} a eu {réponse} comme animal de compagnie pendant son enfance.'),
  ('enfance-sport', '{Sujet} pratiquait {réponse} pendant son enfance.'),
  ('premiere-voiture-conduite', 'Sa première voiture a été une {réponse}.'),
  ('permis-annee', '{Sujet} a obtenu son permis de conduire en {réponse}.'),
  ('premier-metier', 'Son premier métier rémunéré a été {réponse}.'),
  ('nage-age', '{Sujet} a appris à nager à {réponse} ans.'),
  ('metier-reve', 'Enfant, {sujet} rêvait de devenir {réponse}.'),
  ('depart-domicile-age', '{Sujet} a quitté le domicile de ses parents à {réponse} ans.'),
  ('rencontre-annee', '{Sujet} a rencontré <conjoint> en {réponse}.'),
  ('mariage-date', '{Sujet} {s''est marié|s''est mariée} avec <conjoint> le {réponse}.'),
  ('mariage-commune', '{Sujet} {s''est marié|s''est mariée} à {réponse}.'),
  ('voyage-noces', 'Leur voyage de noces les a menés à {réponse}.'),
  ('mariage-voiture', 'Le jour du mariage, les mariés sont arrivés en {réponse}.'),
  ('service-militaire-ville', '{Sujet} a fait son service militaire à {réponse}.'),
  ('adresse-actuelle-annee', '{Sujet} a emménagé à son adresse actuelle en {réponse}.'),
  ('premier-concert-annee', '{Sujet} est {allé|allée} à son premier concert en {réponse}.'),
  ('premier-concert-artiste', 'Le premier concert de {sujet} était celui de {réponse}.'),
  ('television-annee', '{Sujet} a eu la télévision à la maison en {réponse}.'),
  ('premier-film-cinema', 'Le premier film vu par {sujet} au cinéma était {réponse}.'),
  ('ordinateur-age', '{Sujet} a utilisé un ordinateur pour la première fois à {réponse} ans.'),
  ('retraite-date', '{Sujet} a pris sa retraite le {réponse}.'),
  ('premier-pays-etranger', 'Le premier pays étranger visité par {sujet} a été {réponse}.'),
  ('avion-annee', '{Sujet} a pris l''avion pour la première fois en {réponse}.'),
  ('voyage-pays-annee', '{Sujet} a voyagé en <pays> en {réponse}.'),
  ('dernier-pays-etranger', 'Le dernier pays étranger visité par {sujet} est {réponse}.'),
  ('club-associatif', '{Sujet} fait partie de {réponse}.')
) as v(id, recap)
where question_templates.id = v.id;
