# Design

Charte visuelle de Quizamily, posée avec la maquette de l'accueil (2026-11-10). Elle s'applique à tous les écrans au fur et à mesure qu'on les retravaille. Principes généraux dans `concept.md` (Direction visuelle) ; contenu et comportement des écrans dans `ecrans.md`.

**Maquette de référence** : « Quizamily – Accueil » (canvas Claude Design, privé, à ouvrir depuis le compte de Sylvain) — https://claude.ai/artifact/8yprgXLjTHUgu7wiKTE368. Elle montre l'accueil de la famille (écran 4) dans 7 états. Elle n'est pas cliquable : c'est une vue statique de l'organisation et du style.

**Source de la maquette** : copie dans `docs/maquettes/accueil/`, pour référence (valeurs exactes, textes). `Main.dc.html` contient tout l'écran, avec un paramètre `etat` ; les autres fichiers l'importent chacun avec un état différent. Ces fichiers ne s'ouvrent pas seuls dans un navigateur : ils ont besoin de l'éditeur Claude Design. La version qui fait foi est le canvas en ligne ; recopier les fichiers ici s'il est modifié.

## Couleurs

| Rôle | Couleur | Usage |
|---|---|---|
| Fond de l'écran | `#FFFBF6` | blanc chaud |
| Surface (cartes, bandeau) | `#FFFFFF` | |
| Texte principal | `#1B1F3B` | |
| Texte secondaire | `#5B5F73` | sous-titres, aides (contraste suffisant sur blanc) |
| Bordure discrète | `#E2DACE` / `#EDE6DC` | contours des tuiles, séparation du bandeau |
| **Bleu** (principal) | `#2347C5` | bouton d'action principal, icônes, liens, liseré gauche |
| Bleu foncé | `#1A3596` | ombre portée du bouton bleu, survol des liens |
| Bleu clair | `#E7ECFB` | fond des pastilles d'icône, bouton « Inviter » |
| Contour bleu clair | `#C9D4F4` | carte « Ajouter un souvenir », carte de démarrage |
| **Rouge** (accent) | `#D62839` | badges (nombre d'actions en attente), liseré droit |
| Rouge foncé | `#A81E2C` | texte des alertes |
| Rouge clair | `#FDE8EA` | fond des alertes (pioche bientôt vide) |

Le rouge ne sert jamais de fond à un gros bouton : en grande surface, il évoque une alerte ou un problème. Il reste réservé aux badges, aux alertes et au liseré droit.

## Typographie

- **Titres et libellés des gros boutons** : Fredoka, graisse 600 (police ronde et ludique). Tailles de la maquette : 27 px (titre d'état du quiz), 23 px (« Consulter les connaissances »), 20 px (« Ajouter un souvenir »), 17 px (nom de la famille dans le bandeau).
- **Texte** : Nunito, 400 à 800. Corps 15-16 px ; petites capitales d'étiquette (« PARTICIPER AU QUIZ ») 14 px, graisse 700, espacement 0,06 em.
- Les deux polices viennent de Google Fonts (`@expo-google-fonts/fredoka` et `@expo-google-fonts/nunito` côté app, à vérifier selon la version d'Expo).

## Formes et composants

- **Arrondis** : 22 px pour les gros boutons et cartes, 16-18 px pour les tuiles, 14 px pour les boutons secondaires, pilule (22 px) pour les boutons du bandeau.
- **Zones tactiles** : 44 px minimum.
- **Bouton d'action** (bleu plein) : fond `#2347C5`, texte blanc, ombre portée pleine `0 6px 0 #1A3596`. Réservé aux états qui demandent une action.
- **Bouton à liserés** (blanc) : fond blanc, liseré **bleu de 8 px à gauche** et **rouge de 8 px à droite**, bordure haute et basse 1 px `#E2DACE`, ombre douce `0 4px 14px rgba(27,31,59,0.08)`. Utilisé pour « Consulter les connaissances » et pour les états d'attente du quiz.
- **Tuile secondaire** : fond blanc, bordure 1 px `#E2DACE`, icône bleue + libellé en gras (Historique, Mes faits).
- **Badge** : pastille rouge `#D62839`, texte blanc gras, hauteur 24-28 px.
- **Alerte** : bandeau `#FDE8EA`, texte `#A81E2C` gras, icône triangle.
- **Icônes** : traits (stroke) de 2 px, bouts arrondis, pas d'emoji. Dans une pastille carrée arrondie (16 px) quand elles accompagnent un gros bouton.

## Règle des styles du bouton « Participer au quiz »

| Style | États |
|---|---|
| **Bleu plein** (une action t'attend) | Une question t'attend · Réponses à valider · La révélation est là |
| **Blanc à liserés** (rien à faire, on attend) | Réponse envoyée · Ta question est en jeu · Quiz terminé · Pas de prochain quiz |
| Remplacé par la carte « Lancer votre premier quiz » | Famille qui démarre |

Le bouton n'a pas d'icône : elle prenait une ligne à elle seule et grossissait le bouton inutilement. L'étiquette « PARTICIPER AU QUIZ » est sur la première ligne, avec le badge éventuel aligné à droite.
