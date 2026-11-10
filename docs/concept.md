# Concept

## Pitch

Les joueurs (enfants, petits-enfants...) s'amusent à deviner et enrichir leur connaissance d'une ou plusieurs **personnes centrales** de la famille — typiquement des grands-parents ou arrière-grands-parents, vivants ou décédés, qui n'utilisent pas forcément l'app eux-mêmes. Le jeu produit, comme sous-produit, une archive familiale vivante.

## Direction visuelle

Coloré et chaleureux, pas minimaliste/froid — c'est un jeu de famille, pas un outil pro. Belles icônes, ambiance fun. Palette à dominante bleu/blanc/rouge quand c'est pertinent. Charte posée le 2026-11-10 avec la maquette de l'accueil, détaillée dans `design.md` : fond blanc chaud, bleu pour les actions, rouge réservé aux badges, alertes et liserés (jamais en grand fond, ça fait alerte), polices Fredoka (titres) et Nunito (texte). À appliquer à chaque écran au fur et à mesure qu'on le retravaille.

## Rôles

- **Joueurs** : comptes actifs. Ajoutent des infos, répondent aux quiz.
- **Personnes centrales** : 1 à 4 personnes désignées par le créateur de la famille, autour de qui tournent (exclusivement, pour l'instant) toutes les questions. Souvent sans compte (profil géré par les autres membres).
- **Personnes référencées** : mentionnées via une relation (ex: la mère décédée d'une personne centrale), sans profil complet nécessaire.

Un joueur peut appartenir à **plusieurs familles** (famille recomposée, belle-famille…). Il a une fiche par famille, avec un lien de parenté propre à chacune, et ses scores sont séparés par famille. S'il appartient à plusieurs familles, il choisit d'abord la famille dans un accueil dédié. Sinon, il arrive directement dans sa famille. La famille active est rappelée sur tous les écrans et dans l'objet des emails.

N'importe quel joueur peut ajouter/modifier une info sur n'importe qui — pas de validation préalable requise, les questions viennent d'un catalogue filtré en amont pour éviter le sensible (donc pas besoin d'un système de consentement explicite).

## Catalogue de questions

Les questions ne sont pas libres : elles viennent d'un **catalogue de templates** édité par nous (pas par les familles), avec un type de réponse déjà défini par template (date, année, âge, nombre, pays, commune, lieu, prénom, liste de référence, saisie libre — détail dans `question-templates.toml`). Avantages :
- Résout le problème de la page blanche au démarrage (prompts suggérés plutôt que formulaire vide).
- Évite les questions gênantes (filtrage en amont, pas de modération a posteriori nécessaire).
- Simplifie la saisie : champ guidé (date picker, dropdown, autocomplétion) quand le type s'y prête, donc la correction automatique est fiable.

Les joueurs répondent avec **le même champ que l'auteur du fait** (même sélecteur de date, même liste, même autocomplétion). Il n'y a donc pas de QCM ni de leurres à générer en V1.

Piste V2 : laisser l'auteur choisir, au moment d'ajouter un fait, de le poser en QCM en saisissant lui-même les fausses réponses. Il dose ainsi la difficulté, puisqu'il connaît sa famille mieux que nous. Ce choix doit rester optionnel : certains se sentiront bloqués s'ils doivent inventer de fausses réponses.

Certaines informations ne peuvent être saisies que librement (ex : un nom de jeune fille). Pour ces templates de type **saisie libre**, les joueurs répondent eux aussi par saisie libre, et les réponses sont validées par l'auteur du fait (voir Validation des réponses libres).

Un fait peut aussi inclure une ou plusieurs **pièces jointes** (photo d'archive, enregistrement audio), affichées à la révélation en complément du contexte texte. Fonctionnalité repoussée après le MVP (voir roadmap), mais déjà prévue dans le modèle de données.

## Arbre familial léger

Un fait peut porter sur une personne seule, ou sur une **relation entre deux personnes** (mariage, filiation...). On modélise donc de vraies "Personnes" (joueur, personne centrale passive, ou simplement référencée/décédée) reliées par des relations simples (parent / conjoint / enfant), réutilisables entre plusieurs faits. L'arbre est la **porte d'entrée vers les connaissances** : en touchant une personne, on lit le récapitulatif de ce que la famille sait d'elle (voir `ecrans.md`, écrans 10 et 11). On reste volontairement à ce niveau "léger" (pas de moteur généalogique complet avec génération automatique de questions de parenté — gardé pour une v2 éventuelle).

## Boucle de jeu

```
Catalogue de prompts (centré sur les personnes centrales) → ajout d'une info (champ guidé)
   → pioche hebdomadaire pondérée (fraîcheur + répartition par auteur) : une seule question
   → la question envoyée aux joueurs (jamais à l'auteur du fait)
   → réponses pendant ~7 jours
   → saisie libre uniquement : validation des réponses par l'auteur du fait
   → révélation à la deadline (ou dès la fin des validations) : scores + anecdote + réactions/commentaires ouverts
   → l'archive et l'arbre familial s'enrichissent
```

**Une session = une seule question** (pas un lot) : chaque pioche sélectionne un seul fait, envoyé à tous les joueurs concernés avec une semaine pour y répondre. C'est ce rythme simple, une question à la fois, qui a toujours été prévu — pas un digest hebdomadaire à plusieurs questions.

## Pioche des questions

**Règle (décision du 2026-11-10)** : la pioche ne repose **jamais** un fait déjà posé. Elle choisit uniquement parmi les faits jamais posés. Un fait déjà posé ne peut être repioché que s'il ne reste plus aucun fait jamais posé, en prévenant les joueurs (forme à définir). Comme une seule question est tirée par semaine, la répartition entre auteurs se fait naturellement dans le temps.

**Les personnes centrales restent prioritaires, mais ne sont plus les seuls sujets possibles** (règle assouplie le 2026-11-09 : au départ, on avait prévu 100% personnes centrales ; on autorise maintenant des faits — et donc des questions — sur n'importe quel membre, avec une pondération qui privilégie les personnes centrales).

La réserve de faits jamais posés peut donc vraiment s'épuiser : l'accueil affiche une **alerte quand il en reste moins de 5** (environ 5 semaines de quiz), pour inciter à ajouter des souvenirs.

Implémentée (2026-11-09, corrigée le même jour pour piocher une seule question par session plutôt qu'un lot) dans l'Edge Function `create-quiz-session` (détail technique dans `docs/ecrans.md`, section « Pioche et création de session ») : un fait par session, pondéré par fraîcheur + bonus personne centrale (×1.5). Corrigée le 2026-11-10 pour respecter la règle ci-dessus, dans l'Edge Function (`pioche.ts`) et dans la fonction SQL de la tâche planifiée (migration `20261110130000_pioche_never_posed_first.sql`). Le résultat d'une pioche indique `reused` (fait déjà posé repioché) et `neverPosedLeft` (faits jamais posés restants). Déclenchement manuel pour l'instant (pas de tâche planifiée hebdomadaire).

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
4. La question **n'est pas révélée** tant que des réponses restent à valider. Si toutes les validations sont faites avant la deadline, la question est révélée normalement à la deadline. Si elles sont faites après, elle est révélée immédiatement, dès la dernière validation.
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
- Relances douces si un membre n'a encore rien ajouté, ou si le pool de faits disponibles devient bas (alerte sur l'accueil sous 5 faits jamais posés).

## Terminologie

Le terme officiel retenu pour désigner la ou les personnes autour de qui le jeu est centré est **"personne centrale"** (pluriel : "personnes centrales"). D'autres termes ont été envisagés puis écartés ("personne fondatrice", "pivot", "vedette", "invité(e) d'honneur"...).

## Monétisation (pistes, rien de décidé)

Ouvert le 2026-11-10. Principe : pas de publicité (elle casserait l'ambiance chaleureuse, rapporterait presque rien vu le faible volume d'usage, gênerait les utilisateurs âgés et imposerait du suivi publicitaire et des demandes de consentement, délicat pour une appli qui stocke des données familiales).

Pistes de Sylvain :
- **Don volontaire** (style Ko-fi). Rapporte peu (très faible part de donateurs), mais colle à l'esprit du projet. Attention aux règles des stores : sur iPhone, un pourboire au développeur doit passer par l'achat intégré d'Apple (commission prélevée), et un lien externe « Tips » peut faire refuser l'appli ; règles comparables chez Google ; assouplissements en Europe pour les liens externes, avec conditions et frais, à vérifier au moment de publier. Sur la version web, un lien Ko-fi suffit.
- **Abonnement par famille, autour de 1 €/mois**, pour régler la fréquence et les jours des révélations. Bon principe : un membre paie, toute la famille en profite. Limites : la fonctionnalité ne parle qu'à l'organisateur de la famille ; sur 1 € TTC, il reste environ 0,70 € après TVA et commission des stores (15 % pour les petits développeurs) ; un paiement annuel (autour de 10 €/an) réduirait les frais et la résiliation.

Autres options payantes envisagées, à combiner ou non :
- **Photos et enregistrements audio** sur les faits (prévus après le MVP) : coût de stockage réel, facile à justifier.
- **Livre souvenir** (imprimé ou PDF) construit à partir du récapitulatif d'une personne : achat à l'unité (ordre d'idée 15-30 €), cadeau évident pour un anniversaire.
- **Paliers** au-delà d'un certain nombre de personnes centrales ou de membres.

Calendrier proposé : premier test gratuit, avec au plus un lien de don sur la version web ; décider après avoir observé l'usage réel. Questions de TVA et de statut (micro-entreprise ou autre) à voir avec un comptable.

## Hypothèses non encore tranchées

- Pas de maximum technique strict sur le nombre de personnes centrales (juste une recommandation UI de rester à 1-4).
- Ajouter une nouvelle personne centrale en cours de route est possible à tout moment, sans gatekeeper, via les réglages de la famille.
- Les templates du catalogue sont gérés par nous (contenu éditorial), pas par les familles elles-mêmes, en V1.