# Écrans du MVP

Description fonctionnelle, sans design : ce que chaque écran affiche et ce qu'on peut y faire. L'interface reste volontairement simple, elle sera enrichie au fur et à mesure.

Les points marqués **À décider** sont des questions ouvertes.

## Règles communes

- Dans tous les écrans liés à une famille, le **nom de la famille active** est rappelé en haut.
- Un joueur peut appartenir à plusieurs familles (famille recomposée, belle-famille…). Il a une fiche par famille, avec un lien de parenté propre à chacune.
- Les emails indiquent toujours la famille concernée dans l'objet (ex : « [Famille Chardaire] Nouvelle question »).

## Parcours

```
Connexion
→ Accueil - choix de famille (seulement si le joueur a au moins 2 familles)
→ Accueil - famille
→ Répondre / Ajouter un fait / Valider des réponses / Voir une révélation / Archives
```


## 1. Connexion

But : se connecter sans mot de passe.

Affiche :
- un champ email
- le message « Un lien de connexion vous a été envoyé » après envoi

Actions :
- Recevoir le lien → clic dans l'email → Accueil - choix de famille, ou directement Accueil - famille s'il n'a qu'une famille
- Arrivée par un lien d'invitation → connexion, puis rejoindre la famille (écran 2)
- Aucune famille → Création de famille (écran 2)


## 2. Créer ou rejoindre une famille

But : démarrer une famille, ou rejoindre celle où l'on a été invité.

### Créer une famille

Étapes :
1. Nom de la famille
2. Ses propres infos de base (prénom, nom)
3. La ou les personnes centrales (1 à 4) : prénom, nom, vivante ou décédée, lien de parenté avec soi
4. Pour chaque personne centrale : l'inviter (si elle peut utiliser l'app) ou créer un profil sans compte
5. Lien d'invitation à partager aux autres membres
→ Accueil - famille

### Rejoindre une famille (depuis un lien d'invitation)

Étapes :
1. « Vous êtes invité dans la famille X »
2. Ses infos de base
3. Son lien de parenté avec chaque personne centrale
→ Accueil - famille

**À décider** :
- Le lien de parenté : texte libre (« petit-fils ») ou liste ?
- Le joueur qui rejoint ajoute-t-il ses liens avec les personnes centrales lui-même, ou est-ce le créateur qui les a définis à l'invitation ?


## 3. Accueil - choix de famille

But : choisir dans quelle famille aller. N'existe que si le joueur appartient à au moins 2 familles.

Affiche :
- la liste de ses familles
- mises en avant en tête de liste : les familles où il a des questions à répondre ou des réponses à valider, avec le nombre (« 2 questions à répondre »)

Actions :
- Choisir une famille → Accueil - famille
- Créer une nouvelle famille → écran 2

**À décider** : ouvrir directement la dernière famille utilisée, ou toujours passer par cet écran ?


## 4. Accueil - famille

But : point d'entrée dans une famille, avec accès à toutes les fonctionnalités.

Affiche :
- les questions de la session en cours auxquelles il n'a pas encore répondu, avec la deadline
- les réponses en attente de sa validation (s'il est auteur d'un fait en saisie libre, ou s'il a pris la main)
- les révélations récentes
- son score de contribution (« Vous avez ajouté 5 souvenirs »)
- le seuil de démarrage tant que le premier quiz n'a pas eu lieu (« 3 souvenirs ajoutés, encore 1 joueur à inviter »)

Actions :
- Répondre → écran 6
- Valider des réponses → écran 7
- Voir une révélation → écran 8
- Ajouter un fait → écran 5
- Consulter les archives → écran 9
- Inviter un membre → partage du lien d'invitation
- Changer de famille → écran 3 (si au moins 2 familles)

**À décider** : afficher les scores (« X bonnes / Y posées ») sur cet écran, ou seulement à la révélation ?


## 5. Ajouter un fait

But : renseigner une information sur une personne centrale, et retrouver les faits qu'on a déjà créés.

### Mes faits

Affiche la liste des faits créés par le joueur, avec leur état : pas encore posé, posé dans la session en cours, révélé.

Actions :
- Modifier ou supprimer un fait **pas encore posé** (réponse, personne liée, anecdote)
- Un fait posé ou révélé ne se modifie plus et ne se supprime plus : il passe par le mécanisme de correction (hors MVP)

### Nouveau fait

Étapes :
1. Choisir la personne centrale (étape sautée s'il n'y en a qu'une)
2. Choisir une question dans le catalogue, filtrée selon les conditions (femme, homme, vivant, a un conjoint…)
3. Si la question implique une personne liée (`<conjoint>`) : la choisir, ou la créer si elle n'existe pas encore
4. Si la question a un élément à choisir (`<pays>`) : le choisir
5. Saisir la réponse avec le champ du type de la question
6. Ajouter une anecdote ou un contexte (facultatif), affiché à la révélation
→ Confirmation, puis « Ajouter un autre fait » ou retour à l'accueil

Cas particuliers :
- Type liste : l'entrée n'existe pas → « Ajouter » (visible tout de suite dans la famille, base globale après validation)
- Type lieu : choix entre pays et commune

**À décider** :
- Une question déjà renseignée pour cette personne centrale : la masquer, ou l'afficher comme « déjà renseignée » (et renvoyer vers une correction) ?
- Ordre des questions proposées : par catégorie, ou les plus « faciles » en premier pour lancer les nouveaux ?


## 6. Répondre

But : répondre à une question de la session en cours.

Affiche :
- le texte de la question (« En quelle année Mamie M a-t-elle pris l'avion pour la première fois ? »)
- le champ de réponse du type de la question
- la deadline (« Il reste 3 jours »)

Actions :
- Valider la réponse → question suivante de la session, ou retour à l'accueil
- Passer → la question reste « pas répondu » jusqu'à la deadline

Cas particuliers :
- Type liste : l'entrée n'existe pas → « Ajouter »
- Le joueur est le sujet de la question (personne centrale avec un compte)

**À décider** :
- Afficher l'auteur du fait avant de répondre, ou seulement à la révélation ?
- Pouvoir modifier sa réponse jusqu'à la deadline ?
- Quand le joueur est le sujet : formuler la question à la 2e personne (« En quelle année avez-vous pris l'avion… ») ?


## 7. Valider les réponses libres

But : pour l'auteur d'un fait en saisie libre (ou celui qui a pris la main), accepter ou refuser les réponses non identiques.

Affiche :
- la question et la bonne réponse
- les réponses à valider, **regroupées par valeur identique** (« Durant » : 3 joueurs), pour ne valider qu'une fois
- les réponses déjà validées automatiquement, pour information

Actions :
- Accepter ou refuser chaque réponse (ou groupe de réponses)
- Une fois tout validé → la question sera révélée à la deadline, ou tout de suite si la deadline est passée

**À décider** : le validateur voit-il le nom des joueurs derrière chaque réponse, ou seulement les réponses (validation anonyme, plus impartiale) ?


## 8. Révélation

But : découvrir la bonne réponse et les résultats d'une question.

Affiche :
- la question et la bonne réponse
- l'auteur du fait et son anecdote ou contexte
- qui a eu juste, qui a eu faux, qui n'a pas répondu
- les scores de la session et le score cumulé (« X bonnes / Y posées »)

Actions :
- Question suivante de la session
- Retour à l'accueil

**À décider** : afficher les réponses fausses de chacun ? Elles sont souvent drôles et lancent la discussion, mais certains peuvent ne pas aimer.

Hors MVP (roadmap) : réactions et commentaires, correction d'un fait.


## 9. Archives

But : consulter la base de connaissance de la famille, constituée par toutes les questions posées.

### Version MVP (simple)

Étapes :
1. Choisir la personne centrale (étape sautée s'il n'y en a qu'une)
2. Liste des questions déjà révélées qui la concernent, avec leur réponse

Les archives affichent les mêmes informations pour tout le monde : les faits pas encore posés n'y apparaissent pas, y compris pour leur auteur.

Action : ouvrir une question → son détail (même contenu que la révélation)

### Enrichissements après le MVP

- Regroupement par catégorie (naissance et enfance, jeunesse, couple…) et filtres
- Pour chaque fait : auteur, anecdote, date de révélation, taux de bonnes réponses (« 3 joueurs sur 5 avaient trouvé »)
- Recherche par mot-clé
- **Frise chronologique** de la vie de chaque personne centrale, construite à partir des faits de type date et année
