# Listes de référence

Ce dossier contient les valeurs proposées dans les champs « liste » des questions
(`kind = "list"` dans `docs/question-templates.toml`) : animal de compagnie, sport, voiture,
métier, film, personnalité. Ces valeurs sont stockées en base dans la table `list_items`.

## Comment ça marche dans l'app

- **Recherche au fil de la frappe.** L'utilisateur tape quelques lettres et l'app propose les
  8 valeurs les plus proches : d'abord la valeur exacte, puis celles qui commencent par ce qui
  est tapé, puis celles qui le contiennent. Les accents, majuscules, espaces, tirets et
  apostrophes ne comptent pas (« citroen x » trouve « Citroën XM »). La recherche se fait sur
  le serveur (fonction `search_list_items`), pour ne pas charger des milliers de valeurs sur
  le téléphone.
- **Auteur d'un fait** : il voit la liste globale et les valeurs déjà ajoutées par sa famille.
  Si la valeur tapée n'existe pas, elle est ajoutée telle quelle pour sa famille à
  l'enregistrement du fait (statut `pending`). Elle est visible tout de suite dans la famille
  et n'entre dans la liste globale qu'après validation par nous (pas encore construit, prévu
  plus tard : voir « Points à décider » dans `docs/roadmap.md`).
- **Joueur qui répond** : il ne voit que la liste globale (statut `approved`), jamais les
  ajouts de la famille, sinon la valeur que l'auteur vient d'ajouter trahirait la réponse. Si
  la bonne réponse n'est pas dans les propositions, il la tape en entier ; elle est comparée
  à la bonne réponse après normalisation (mêmes règles que la recherche).
- **Catégories.** Une liste peut être découpée en catégories (aujourd'hui seulement
  `personnalites`). Une question peut limiter ses propositions à une catégorie avec le champ
  `list_category` de son template (ex : premier concert → `musique`, pour ne proposer que des
  artistes). Sans ce champ, toutes les catégories sont proposées.

## Les fichiers

Format : une valeur par ligne. Les lignes vides et celles qui commencent par `#` sont
ignorées (commentaires). Modifiable avec n'importe quel éditeur de texte.

| Liste | Fichier | Source | Valeurs |
|---|---|---|---|
| animaux | `animaux.txt` | écrit à la main | 42, dont « aucun » |
| sports | `sports.txt` | écrit à la main | 97 |
| metiers | `metiers.txt` | écrit à la main | 325, métiers anciens compris, forme « Instituteur / institutrice » |
| voitures | `voitures.txt` | écrit à la main | 248 : marques seules (« Renault ») et modèles « Marque Modèle » (« Renault 4L ») |
| films | `films.txt` | généré depuis Wikidata | « Titre (année) », ~1500 prévus |
| personnalites | `personnalites/<catégorie>.txt` | généré depuis Wikidata | une catégorie par fichier |

Catégories de personnalités : `musique` (chanteurs, musiciens, compositeurs, groupes),
`politique`, `sport`, `cinema` (acteurs, réalisateurs), `television` (animateurs, humoristes,
journalistes), `litterature` (écrivains, poètes, auteurs de BD), `arts` (peintres, sculpteurs,
photographes, stylistes), `sciences` (scientifiques, explorateurs, astronautes, inventeurs).
Une même personne peut apparaître dans plusieurs catégories (ex : chanteur et acteur).

**Fichiers générés** (`films.txt`, `personnalites/*.txt`) : ils sont **écrasés** à chaque
lancement du script Wikidata, donc ne pas les modifier à la main. Pour ajouter des valeurs à
la main, utiliser un fichier `.ajouts.txt` à côté : `films.ajouts.txt`,
`personnalites/musique.ajouts.txt`, etc. Il est lu comme la même liste ou catégorie et
n'est jamais écrasé.

## Mettre à jour la base, étape par étape

À faire depuis l'ordinateur relié à Supabase, à la racine du projet.

### 1. Générer films et personnalités depuis Wikidata

```
node scripts/wikidata-listes.mjs
```

- Besoin : Node 18 ou plus récent (`node --version`) et une connexion internet. Aucun compte
  ni clé n'est nécessaire.
- Durée : quelques minutes (18 requêtes à Wikidata, avec une pause de 2 s entre chacune).
- Ce qu'il affiche : une ligne par liste, par exemple
  `-> data/listes/films.txt : 1650 valeurs`, puis « Terminé ».
- On peut ne relancer qu'une partie : `node scripts/wikidata-listes.mjs films musique`.
- **Le script n'a jamais pu être testé** (Wikidata est inaccessible depuis l'environnement où
  il a été écrit) : une erreur au premier lancement est possible. Dans ce cas, copier le
  message à Claude. Les listes qui ont réussi sont quand même écrites.

**Comment il choisit.** Wikidata est la base de données qui alimente Wikipédia. La popularité
y est estimée par le nombre de « sitelinks », c'est-à-dire le nombre de Wikipédias (français,
anglais, allemand…) qui ont un article sur le film ou la personne. Pour chaque liste, le script
fait deux passes :

- une **passe mondiale** avec un seuil élevé (ex : films présents dans au moins 30 Wikipédias) ;
- une **passe France** avec un seuil plus bas (films d'origine française, personnes de
  nationalité française), pour garder ce qui est connu en France mais peu ailleurs.

Les deux sont fusionnées sans doublons et triées par ordre alphabétique.

**Vérifier le résultat.** Ouvrir quelques fichiers produits et regarder : la quantité
(trop ou pas assez ?), des noms attendus (Johnny Hallyday, Édith Piaf, Charles de Gaulle,
Zinédine Zidane, « La Grande Vadrouille (1966) »…), et d'éventuelles valeurs bizarres.

**Régler les quantités.** En tête de `scripts/wikidata-listes.mjs`, l'objet `CONFIG` contient
pour chaque liste et chaque passe :

- `minLinks` : nombre minimum de Wikipédias. Le monter donne moins de valeurs, plus connues ;
  le baisser en donne plus, moins connues.
- `max` : nombre maximum de valeurs gardées pour cette passe (les plus populaires d'abord).

Si une liste manque de noms français connus, baisser `minLinks` de sa passe `france`. Si elle
contient trop d'inconnus, le monter.

**Problèmes possibles.**

- « délai dépassé côté Wikidata » : la requête est trop lourde. Monter `minLinks` de la passe
  indiquée dans le message, puis relancer seulement cette liste.
- « HTTP 429 » ou « HTTP 5xx » : Wikidata est surchargé ou limite le nombre de requêtes. Le
  script réessaie tout seul 3 fois ; si ça échoue encore, relancer plus tard.
- `fetch is not defined` : Node trop ancien, installer Node 18 ou plus récent.

### 2. Transformer les fichiers en migration

```
node scripts/build-list-items.mjs
```

- Lit tous les fichiers de ce dossier (y compris les `.ajouts.txt`) et écrit une nouvelle
  migration `supabase/migrations/<date et heure>_list_items_data.sql`, qui insère toutes les
  valeurs dans `list_items` comme valeurs validées (liste globale).
- Affiche le nombre de valeurs par liste et signale les doublons ignorés (deux valeurs
  identiques après normalisation dans la même liste, ex : « Citroen 2CV » et « Citroën 2 CV »).
- La migration est **sans risque à rejouer** : une valeur déjà présente en base n'est pas
  réinsérée. On peut donc relancer le script après chaque modification des fichiers ; chaque
  lancement crée une nouvelle migration qui contient toutes les valeurs.
- **Retirer** une valeur d'un fichier ne la retire pas de la base : il faut la supprimer à la
  main dans Supabase (table `list_items`).
- La migration `20261119093355_list_items_data.sql` (animaux, sports, métiers, voitures) est
  déjà dans le dépôt : la garder, elle ne gêne pas la suivante.

### 3. Envoyer dans Supabase

```
npx supabase db push
```

Applique les migrations pas encore passées, dans l'ordre :

1. `20261119090000_list_items_search.sql` : ajoute à `list_items` les colonnes `category`
   (catégorie) et `search_key` (valeur normalisée pour la recherche, remplie automatiquement),
   crée la fonction de recherche `search_list_items`, ajoute `list_category` aux templates et
   le règle à `musique` pour la question du premier concert ;
2. les migrations de valeurs `..._list_items_data.sql`.

### 4. Vérifier

- Dans Supabase, table `list_items` : le nombre de lignes par `list_name` correspond à ce
  qu'a affiché le script de l'étape 2.
- Dans l'app : `npx tsc --noEmit` et `npx expo lint` sans nouvelle erreur, puis à l'écran
  (voir la liste à cocher dans `docs/roadmap.md`, « À faire sur l'ordinateur avec Supabase »).
