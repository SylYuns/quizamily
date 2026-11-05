# Concept

## Pitch

Les joueurs (enfants, petits-enfants...) s'amusent à deviner et enrichir leur connaissance d'une ou plusieurs **personnes centrales** de la famille — typiquement des grands-parents ou arrière-grands-parents, vivants ou décédés, qui n'utilisent pas forcément l'app eux-mêmes. Le jeu produit, comme sous-produit, une archive familiale vivante.

## Rôles

- **Joueurs** : comptes actifs. Ajoutent des infos, répondent aux quiz.
- **Personnes centrales** : 1 à 4 personnes désignées par le créateur de la famille, autour de qui tournent (exclusivement, pour l'instant) toutes les questions. Souvent sans compte (profil géré par les autres membres).
- **Personnes référencées** : mentionnées via une relation (ex: la mère décédée d'une personne centrale), sans profil complet nécessaire.

N'importe quel joueur peut ajouter/modifier une info sur n'importe qui — pas de validation préalable requise, les questions viennent d'un catalogue filtré en amont pour éviter le sensible (donc pas besoin d'un système de consentement explicite).

## Catalogue de questions

Les questions ne sont pas libres : elles viennent d'un **catalogue de templates** édité par nous (pas par les familles), avec un type de réponse déjà défini par template (date, année, pays, ville, prénom, nombre, liste personnalisée, saisie libre). Avantages :
- Résout le problème de la page blanche au démarrage (prompts suggérés plutôt que formulaire vide).
- Évite les questions gênantes (filtrage en amont, pas de modération a posteriori nécessaire).
- Simplifie la saisie : champ guidé (date picker, dropdown, autocomplétion) quand le type s'y prête, donc la correction automatique est fiable.
- Facilite la génération de leurres pour les QCM (piochés parmi les valeurs déjà utilisées dans la famille pour ce type de champ).

Certaines informations ne peuvent être saisies que librement (ex : un nom de jeune fille). Pour ces templates de type **saisie libre**, les joueurs répondent eux aussi par saisie libre, et les réponses sont validées par l'auteur du fait (voir Validation des réponses libres).

## Arbre familial léger

Un fait peut porter sur une personne seule, ou sur une **relation entre deux personnes** (mariage, filiation...). On modélise donc de vraies "Personnes" (joueur, personne centrale passive, ou simplement référencée/décédée) reliées par des relations simples (parent / conjoint / enfant), réutilisables entre plusieurs faits, avec une mini vue arbre dans l'archive. On reste volontairement à ce niveau "léger" (pas de moteur généalogique complet avec génération automatique de questions de parenté — gardé pour une v2 éventuelle).

## Boucle de jeu

```
Catalogue de prompts (centré sur les personnes centrales) → ajout d'une info (champ guidé)
   → pioche hebdomadaire pondérée (fraîcheur + répartition par auteur)
   → questions envoyées aux joueurs (jamais à l'auteur du fait)
   → réponses pendant ~7 jours
   → saisie libre uniquement : validation des réponses par l'auteur du fait
   → révélation à la deadline (ou dès la fin des validations) : scores + anecdote + réactions/commentaires ouverts
   → l'archive et l'arbre familial s'enrichissent
```

## Pioche des questions

Priorité : jamais posé > posé il y a longtemps > posé récemment (fraîcheur), avec répartition entre auteurs différents pour que la contribution de chacun ait une vraie chance d'être jouée. **En V1, 100% des questions portent sur les personnes centrales** (pas de mix avec d'autres membres pour l'instant).

## Scoring

4 états par joueur/question : **juste / faux / pas répondu / annulée**, plus un état transitoire **en attente de validation** pour les réponses libres (voir ci-dessous).

Destinataires : l'**auteur du fait** ne reçoit jamais la question. Le **sujet** la reçoit comme les autres joueurs s'il a un compte et n'est pas l'auteur du fait.

La révélation est automatique à la deadline, peu importe qui n'a pas répondu (pas de blocage par les retardataires). Seule exception : une question en saisie libre n'est révélée qu'une fois toutes ses réponses validées.

## Validation des réponses libres

Pour les templates de type saisie libre :
1. Chaque réponse est comparée à la bonne réponse **après normalisation** (majuscules, accents, espaces, tirets, apostrophes). Si elle est identique, elle est validée automatiquement comme juste.
2. Les autres réponses passent **en attente de validation** : l'auteur du fait accepte (juste) ou refuse (faux) chacune d'elles. Il peut valider au fil de l'eau, dès qu'une réponse arrive.
3. **Notifications à l'auteur**, tant qu'il reste des réponses à valider :
   - dès que tous les destinataires ont répondu, ou au plus tard 24 h avant la deadline ;
   - 24 h après la deadline ;
   - 6 jours après la deadline, pour le prévenir que les autres joueurs pourront prendre la main s'il ne valide pas.
4. La question **n'est pas révélée** tant que des réponses restent à valider. Les autres questions de la session sont révélées normalement à la deadline.
5. **1 h après la deadline**, s'il reste des validations, les joueurs sont prévenus que la révélation attend l'auteur (ce qui les incite à le relancer eux-mêmes).
6. **7 jours après la deadline**, les joueurs sont prévenus qu'ils peuvent **prendre la main** : le premier qui le fait peut valider les réponses à la place de l'auteur. Tout joueur peut prendre la main, y compris s'il a lui-même répondu à la question. Il ne devient pas l'auteur du fait : la prise de main ne porte que sur la validation de cette question.

Les scores sont affichés en "X bonnes / Y posées" (ou en %) plutôt qu'en chiffre brut cumulé, pour absorber les écarts créés par les annulations (voir Corrections).

## Réactions et commentaires

Chaque fait révélé a un fil de réactions (emoji) et commentaires ouvert à toute la famille, **indéfiniment** (pas seulement pendant la semaine du quiz) — transforme l'archive en déclencheur de conversation plutôt qu'en base de données morte, et donne une raison de revenir dans l'app en dehors du rythme hebdomadaire.

## Corrections

Une correction est une action distincte d'un simple commentaire ("Je pense que ce n'est pas exact") :
1. Le membre propose une valeur alternative + un commentaire optionnel.
2. **L'auteur original du fait** est notifié et valide (accepte/refuse).
3. Si acceptée : la valeur canonique change, l'ancienne valeur reste visible dans l'historique du fait ("Corrigé le [date] : ancienne → nouvelle").
4. Si refusée (ou sans réponse) : les deux versions restent affichées comme une "note" sur le fait, sans qu'on tranche qui a raison.
5. **Recalcul rétroactif des scores**, sur toutes les sessions passées ayant utilisé ce fait :
   - Joueurs ayant répondu l'**ancienne** valeur → recalculés en **"annulée"** (ne compte ni pour ni contre, exclu de leur total).
   - Joueurs ayant répondu la **nouvelle** valeur → recalculés en **"juste"**.
   - Les autres (ni l'une ni l'autre) → restent "faux", rien ne change.
   - Les annulations restent visibles dans l'historique du joueur concerné (pas de disparition silencieuse).

## Onboarding / cold start

Le créateur de la famille (N) :
1. Renseigne ses propres infos de base (devient un Person node comme les autres).
2. Désigne la ou les **personnes centrales** (1 à 4), en précisant son lien de parenté avec elles (amorce l'arbre de relations).
3. Pour chaque personne centrale : envoie le lien d'invitation (si elle est susceptible d'utiliser l'app) ou crée directement son profil passif.
4. Partage le lien d'invitation aux autres membres.
5. Chaque membre (fondateur ou nouveau) reçoit un flux de **prompts suggérés** (pas un formulaire vide) pour ajouter rapidement quelques infos.
6. Un indicateur de progression accompagne l'attente ("3 souvenirs ajoutés, encore 1 personne à inviter").
7. Le **premier quiz se déclenche automatiquement** dès que le seuil minimum est atteint — **au moins 3 joueurs actifs** (pas 2 : à 2 ça devient un duel, pas la bonne ambiance) + quelques faits exploitables sur la/les personne(s) centrale(s) — sans attendre le cycle hebdomadaire normal.

## Contribution continue

Le pool de faits est fini (surtout avec seulement 1-4 personnes centrales), donc il faut encourager la contribution dans la durée :
- Un petit **score de contribution** par membre (nombre de souvenirs ajoutés), affiché en parallèle du score de bonnes réponses.
- Relances douces si un membre n'a encore rien ajouté, ou si le pool de faits disponibles devient bas.

## Terminologie

Le terme officiel retenu pour désigner la ou les personnes autour de qui le jeu est centré est **"personne centrale"** (pluriel : "personnes centrales"). D'autres termes ont été envisagés puis écartés ("personne fondatrice", "pivot", "vedette", "invité(e) d'honneur"...).

## Hypothèses non encore tranchées

- Pas de maximum technique strict sur le nombre de personnes centrales (juste une recommandation UI de rester à 1-4).
- Ajouter une nouvelle personne centrale en cours de route est possible à tout moment, sans gatekeeper, via les réglages de la famille.
- Les templates du catalogue sont gérés par nous (contenu éditorial), pas par les familles elles-mêmes, en V1.