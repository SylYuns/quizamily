# Listes de référence

Valeurs proposées dans les champs « liste » (question de `kind = "list"`) : l'utilisateur tape
quelques lettres et choisit parmi les propositions ; s'il ne trouve pas, il tape la valeur en
entier (ajout visible dans sa famille, base globale après validation, à travailler plus tard).

## Fichiers

Une valeur par ligne, lignes vides et lignes commençant par `#` ignorées.

| Liste | Fichier | Source |
|---|---|---|
| animaux | `animaux.txt` | à la main |
| sports | `sports.txt` | à la main |
| metiers | `metiers.txt` | à la main (forme « masculin / féminin ») |
| voitures | `voitures.txt` | à la main (marques seules + « Marque Modèle ») |
| films | `films.txt` | généré depuis Wikidata (« Titre (année) ») |
| personnalites | `personnalites/<catégorie>.txt` | généré depuis Wikidata |

Catégories de personnalités : musique, politique, sport, cinema, television, litterature, arts,
sciences. Une question ne propose qu'une catégorie si son template a `list_category`
(ex : premier concert → musique) ; sinon toutes.

Les fichiers générés sont écrasés à chaque lancement du script Wikidata. Les ajouts à la main
vont dans un fichier `.ajouts.txt` à côté (`films.ajouts.txt`,
`personnalites/musique.ajouts.txt`…), lu comme la même liste ou catégorie.

## Mettre à jour la base

1. (films, personnalités) `node scripts/wikidata-listes.mjs` — besoin d'internet ; on peut ne
   relancer qu'une partie : `node scripts/wikidata-listes.mjs films musique`.
2. `node scripts/build-list-items.mjs` — écrit une nouvelle migration
   `supabase/migrations/<horodatage>_list_items_data.sql` avec toutes les valeurs.
3. `npx supabase db push`.

La migration générée est idempotente (une valeur déjà présente n'est pas réinsérée), mais
retirer une valeur d'un fichier ne la supprime pas de la base.
