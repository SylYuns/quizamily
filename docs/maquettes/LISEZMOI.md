# Maquettes

Sources des maquettes faites avec Claude (canvas « Claude Design »), gardées ici comme
référence pour le développement. Chaque dossier est la copie d'un canvas :

| Dossier | Contenu | Statut |
|---|---|---|
| `accueil/` | accueil, première charte (2026-11-10) | remplacé par `soleil/` |
| `arbre/` | arbre familial, première charte (2026-11-11) | remplacé par `soleil/` |
| `soleil/` | charte « Coucher de soleil » (2026-11-19/20) : pistes A/B/C de l'accueil, accueil retenu (`Soleil*`), arbre (`Arbre*`), écran « Ajouter un souvenir » (`Fait*`), répondre et vue de l'auteur (`Repondre*`, `MaQuestion`), révélation (`Revelation*`), forme de la réponse (`FaitForme*`), emblème de la famille (`Embleme*`, `Logo`, `AccueilEmbleme`, `AccueilMenu`, `FamilleEmbleme` ; 2026-11-24), parcours d'arrivée en plusieurs pistes (`Connexion*`, `Rejoindre*`, `Creer*` ; 2026-11-24 : retenues ConnexionB, RejoindreA, CreerA), choix de famille (`ChoixFamille*`), historique et bilan du mois (`Historique*`, `BilanMois*`), réactions et discussion (`RevelationDiscussion`, `AccueilDiscussion*` ; 2026-11-25), rattrapage des questions passées (`Rattrapage*`, `*Rattrapage*` ; 2026-11-26) | **référence actuelle** |

Le canvas en ligne (pour les voir rendues) : lien dans `docs/design.md`.

## À savoir pour les lire

- Un fichier `.dc.html` est un écran du canvas : du HTML avec des styles en ligne, des
  `{{trous}}` remplis par la petite classe JavaScript en bas du fichier (`renderVals()`),
  et des balises `<sc-if>` (condition), `<sc-for>` (boucle) et `<dc-import>` (réutilise un
  autre écran avec d'autres paramètres).
- **`support.js` n'est pas dans le dépôt, c'est normal** : c'est le moteur du canvas, fourni
  par l'outil. Ces fichiers ne s'ouvrent donc pas directement dans un navigateur ; on les lit
  comme référence (couleurs, tailles, textes, structure) ou on les regarde sur le canvas.
- Les écrans qui ne contiennent qu'un `<dc-import>` (ex : `FaitSaisie.dc.html`) montrent le
  même écran que le fichier importé avec d'autres paramètres : `Fait.dc.html` avec
  `etat="saisie"`. Les paramètres possibles sont déclarés dans `data-props` en bas du fichier
  importé.
- Animations : les maquettes de révélation utilisent des `@keyframes` CSS (dans `<helmet><style>`) qui tournent en boucle pour être visibles sur le canvas ; dans l'app, elles ne jouent qu'une fois (voir `ecrans.md`, écran 8).
- `canvas.json` : position et titre de chaque écran sur le canvas.
- `ConnexionIntro.dc.html` (intro animée de la connexion) est **générée** par `ConnexionIntro.gen.py` (une animation CSS par élément et par lettre, toutes sur la même boucle de 16 s) : pour changer la chronologie, modifier les temps en haut du script puis `python3 ConnexionIntro.gen.py m ConnexionIntro.dc.html` (lit `ConnexionIntro.mesures.json` : position de la pastille « ? » et du nom dans l'état final, mesurées dans un navigateur).
