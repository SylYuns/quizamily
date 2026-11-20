# Maquettes

Sources des maquettes faites avec Claude (canvas « Claude Design »), gardées ici comme
référence pour le développement. Chaque dossier est la copie d'un canvas :

| Dossier | Contenu | Statut |
|---|---|---|
| `accueil/` | accueil, première charte (2026-11-10) | remplacé par `soleil/` |
| `arbre/` | arbre familial, première charte (2026-11-11) | remplacé par `soleil/` |
| `soleil/` | charte « Coucher de soleil » (2026-11-19/20) : pistes A/B/C de l'accueil, accueil retenu (`Soleil*`), arbre (`Arbre*`), écran « Ajouter un souvenir » (`Fait*`) | **référence actuelle** |

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
- `canvas.json` : position et titre de chaque écran sur le canvas.
