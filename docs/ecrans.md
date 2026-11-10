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
- Recevoir le lien → clic dans l'email → Accueil - famille (dernière famille consultée), ou Accueil - choix de famille s'il a des questions en attente dans une autre famille (voir écran 3)
- Arrivée par un lien d'invitation → connexion, puis rejoindre la famille (écran 2)
- Aucune famille → Création de famille (écran 2)

Une personne centrale qui a un compte passe par le même parcours que les autres joueurs.


## 2. Créer ou rejoindre une famille

But : démarrer une famille, ou rejoindre celle où l'on a été invité.

### Créer une famille

Étapes :
1. Nom de la famille
2. Ses propres infos de base (prénom, nom, genre — ajouté à l'implémentation, nécessaire pour les conditions femme/homme du catalogue)
3. La ou les personnes centrales (1 à 4) : prénom, nom, genre, vivante ou décédée, lien de parenté avec soi (choisi dans une liste : grand-mère, petit-fils, gendre…)
4. Pour chaque personne centrale : créer un profil sans compte. (**Simplifié pour l'implémentation initiale** : l'option "l'inviter directement" est repoussée — elle demande un mécanisme de rattachement d'un compte à un profil déjà créé, pas encore conçu.)
5. Lien d'invitation à partager aux autres membres — un seul lien, réutilisable par plusieurs personnes (pas à usage unique)
→ Accueil - famille

### Rejoindre une famille (depuis un lien d'invitation)

Étapes :
1. « Vous êtes invité dans la famille X »
2. Ses infos de base (prénom, nom, genre)
→ Accueil - famille

**Simplifié pour l'implémentation initiale** : l'étape "son lien de parenté avec chaque personne centrale" est repoussée — `relationship_label` n'est aujourd'hui qu'un champ simple posé par le créateur de la famille (sa propre perception), pas une relation par paire (créateur, joueur, personne centrale). Une vraie capture par paire attend l'étape "mini arbre familial".


## 3. Accueil - choix de famille

But : choisir dans quelle famille aller. N'existe que si le joueur appartient à au moins 2 familles.

Affiche :
- la liste de ses familles
- mises en avant en tête de liste : les familles où il a des questions à répondre ou des réponses à valider, avec le nombre (« 2 questions à répondre »)

Actions :
- Choisir une famille → Accueil - famille
- Créer une nouvelle famille → écran 2

À la connexion :
- par défaut, le joueur arrive directement sur la dernière famille consultée ;
- s'il a des questions en attente de réponse dans une autre famille, il arrive sur cet écran de choix.


## 4. Accueil - famille

But : point d'entrée dans une famille, avec accès à toutes les fonctionnalités.

Affiche :
- la question de la session en cours, si pas encore répondue, avec la deadline (une session = une seule question, voir `concept.md`)
- les réponses en attente de sa validation (s'il est auteur d'un fait en saisie libre, ou s'il a pris la main)
- les révélations récentes
- son score de réponses (« 12 bonnes / 18 posées ») et son score de contribution (« Vous avez ajouté 5 souvenirs »)
- quelques données sur la famille : nombre de membres, nombre de faits révélés… (liste à préciser)
- le seuil de démarrage tant que le premier quiz n'a pas eu lieu (« 3 souvenirs ajoutés, encore 1 joueur à inviter »)

Actions :
- Répondre → écran 6
- Valider des réponses → écran 7
- Voir une révélation → écran 8
- Ajouter un fait → écran 5
- Consulter les archives → écran 9
- Inviter un membre → partage du lien d'invitation
- Changer de famille → écran 3 (si au moins 2 familles)

**Simplifié pour l'implémentation initiale** : écran minimal pour l'instant (confirmation que la famille existe, liens vers « Ajouter un fait » et « Mes faits »), avec un bouton temporaire « Créer une session de quiz » qui appelle directement l'Edge Function `create-quiz-session` (voir plus bas) — un vrai accueil (question en cours, scores, seuil de démarrage) viendra avec les écrans 6 à 9.

### Pioche et création de session (`create-quiz-session`)

Edge Function (`supabase/functions/create-quiz-session`), appelée par un membre de la famille avec `{ family_id }`. Logique :

1. Vérifie que l'appelant est bien membre de la famille (sinon 403).
2. Refuse si une session est déjà `open` pour cette famille (sinon 409) — une seule session active à la fois.
3. Pioche **un seul fait** parmi ceux de la famille, pondéré par :
   - **fraîcheur** : jamais posé (poids max) > posé il y a longtemps > posé récemment (poids min, mais jamais exclu) ;
   - **personne centrale** : bonus ×1.5 sur le poids si le sujet est une personne centrale (priorité, pas exclusivité).
   - Un fait déjà posé dans une session encore `open` est exclu (pas de double-pioche concurrente).
   - La répartition entre auteurs se fait naturellement dans le temps : une fois un fait posé, sa fraîcheur retombe, laissant la place à d'autres auteurs lors des pioches suivantes (pas besoin d'une pénalité explicite puisqu'une seule question est tirée par pioche).
4. Crée la session (`opens_at` = maintenant, `closes_at` = +7 jours), une `quiz_questions` pour le fait retenu (avec `answer_value_snapshot`, et `validator_person_id` = auteur si le type est `free_text`), et les `question_recipients` associés : tous les joueurs de la famille sauf l'auteur du fait.

**Déclenchement** : deux voies coexistent.
- **Manuelle** (bouton dans l'app, Edge Function `create-quiz-session`) : c'est la voie utilisée pendant la phase de test.
- **Automatique** : `auto_create_quiz_sessions()`, programmée par `pg_cron` chaque lundi à 8 h (migration `20261109240000_automatic_triggering.sql`), ne pioche que pour les familles d'au moins 3 joueurs. La migration programme la tâche dès qu'elle est appliquée : si on veut rester en manuel, il faut la désactiver (`cron.unschedule`), et vérifier ce qui tourne avec `select * from cron.job;`.

**À revoir** : le timing de la tâche planifiée (jour et heure de la pioche).

L'Edge Function utilise la clé `service_role` (`ctx.supabaseAdmin`) pour écrire dans `quiz_sessions`/`quiz_questions`/`question_recipients`, qui n'ont pas de policy RLS d'écriture pour les joueurs (ces tables sont gérées par le système, voir `supabase/migrations/20261106130000_rls_policies.sql`).


## 5. Ajouter un fait

But : renseigner une information sur un membre de la famille, et retrouver les faits qu'on a déjà créés.

### Mes faits

Affiche la liste des faits créés par le joueur (les plus récents en premier), avec leur état : pas encore posé, posé dans la session en cours, révélé.

Pour chaque fait : la question (sujet inclus), la réponse donnée, l'anecdote si renseignée, et la date d'ajout.

Actions :
- Modifier ou supprimer un fait **pas encore posé** (réponse, anecdote) — suppression avec confirmation
- Un fait posé ou révélé ne se modifie plus et ne se supprime plus : il passe par le mécanisme de correction (voir écran 8, Corrections)

**Simplifié pour l'implémentation initiale** : le statut (« pas encore posé » / « posé dans la session en cours » / « révélé ») est calculé en vérifiant l'existence d'une ligne `quiz_questions` liée et le statut de sa session — modifier/supprimer ne sont proposés que pour un fait « pas encore posé » (cohérent avec la RLS, qui bloque déjà l'écriture une fois posé). Modifier la **personne liée** ou l'**élément choisi** d'un fait n'est pas encore possible depuis « Mes faits » : ils sont affichés, mais seules la réponse et l'anecdote se modifient. L'UI de choix d'une personne liée existe maintenant à la création (voir Nouveau fait), elle pourrait être réutilisée ici.

### Nouveau fait

Un seul écran (pas un assistant multi-étapes), avec 4 zones :

1. **Choix du sujet** : des cases représentant des personnes (photo ou, par défaut, un placeholder — initiales/icône), les personnes centrales en premier. La première est présélectionnée à l'arrivée sur l'écran. Une dernière case "autre" ouvre la liste complète de la famille. Le sujet n'est plus limité aux personnes centrales (elles restent juste prioritaires, y compris pour la pioche plus tard — voir `concept.md`). Le dernier sujet et le dernier thème choisis sont mémorisés en local sur l'appareil (par joueur, pas partagé avec le reste de la famille), pour retrouver le même contexte à la prochaine ouverture de l'écran.
2. **Thèmes** : des chips filtrant le catalogue par catégorie, calculées dynamiquement à partir des questions encore disponibles pour le sujet choisi (pas un nombre figé) — les plus pertinentes affichées, un "+" pour voir les autres. Optionnel : sans thème choisi, la recherche porte sur tout le catalogue éligible.
3. **Recherche** : un champ de recherche textuelle dynamique (ex: taper "école" pour trouver les questions liées à l'école), qui filtre en direct la liste des questions (déjà filtrée par thème si un thème est choisi, et par les conditions du sujet : femme/homme/vivant/a des frères et sœurs — et par les questions déjà posées pour ce sujet, qu'on ne peut pas créer deux fois). Un lien « Réinitialiser les filtres » apparaît dès qu'un thème ou une recherche est actif. Un bouton « Surprends-moi » choisit une question au hasard parmi les résultats actuellement filtrés, pour réduire le temps de décision. Un compteur rappelle combien de faits ont déjà été ajoutés sur le sujet et combien de questions restent disponibles.
4. **Question + réponse** : une fois une question choisie, l'écran se réduit (sujet/thèmes/recherche se replient derrière un bouton « Modifier les filtres », qui les rouvre sans perdre la sélection en cours) pour mettre en avant la question, son champ de réponse adapté au type (y compris un vrai sélecteur calendrier pour les dates), et l'anecdote/contexte optionnelle juste en dessous (+ pièce jointe, hors MVP).
→ Confirmation, puis « Ajouter un autre fait » (le sujet et le thème restent sélectionnés) ou retour à l'accueil

Cas particuliers :
- Type liste : l'entrée n'existe pas → « Ajouter » (visible tout de suite dans la famille, base globale après validation)
- Type lieu : choix entre pays et commune

**Unicité** : une question ne peut être créée qu'une fois pour la combinaison question + sujet + personne liée ou élément choisi. Par exemple, « voyage en <pays> » peut être créée une fois par pays, et « date de mariage » une fois par conjoint en cas de remariage.

**État de l'implémentation** : les 32 templates sont proposés, y compris ceux avec une personne liée (`<conjoint>` : détectée automatiquement si déjà connue, sinon choisie parmi les personnes existantes ou créée à la volée), avec un élément à choisir (`<pays>`) et les types commune et lieu (migration `20261109250000_linked_person_and_slot_templates.sql`).

**À tester** : les questions avec personne liée, élément à choisir, commune ou lieu n'ont pas encore été testées en conditions réelles.

Photos des personnes : placeholder pour l'instant, le vrai upload est un chantier séparé.


## 6. Répondre

But : répondre à une question de la session en cours.

Affiche :
- le texte de la question (« En quelle année Mamie M a-t-elle pris l'avion pour la première fois ? »)
- le champ de réponse du type de la question
- la deadline (« Il reste 3 jours »)

L'auteur du fait n'est pas affiché : il n'est dévoilé qu'à la révélation.

Actions :
- Valider la réponse → question suivante de la session, ou retour à l'accueil
- Passer → la question reste « pas répondu » jusqu'à la deadline
- Modifier sa réponse jusqu'à la deadline. Exception : pour une question en saisie libre, si tout le monde a répondu avant la deadline et que l'auteur a validé les réponses, elles sont verrouillées.

Cas particuliers :
- Type liste : l'entrée n'existe pas → « Ajouter »
- Le joueur est le sujet de la question (personne centrale avec un compte) : dans l'idéal, la question est formulée à la 2e personne (« En quelle année avez-vous pris l'avion… »). Pas prioritaire, même chantier technique que l'accord au féminin.

**Simplifié pour l'implémentation initiale** (`src/app/respond.tsx`) : pas de notion de « question suivante » (une session n'a qu'une seule question, voir `concept.md`) — après validation, retour à l'accueil. Type liste : pas encore de bouton « Ajouter » pour une nouvelle valeur côté réponse (le champ réutilise `AnswerInput`, qui le permet déjà — à vérifier/activer). Pas de notification. Pas de retour immédiat juste/faux : le résultat n'est connu qu'à la révélation (écran 8).

**À corriger** : `submit_answer` ne vérifie ni la deadline ni l'état de la session. Un joueur peut donc répondre ou modifier sa réponse après la deadline, et même après la révélation, ce qui change son score. Il faut refuser toute réponse une fois la deadline passée ou la session clôturée, et refuser la modification d'une réponse libre déjà validée (verrouillage prévu plus haut). La fermeture automatique des sessions existe (révélation automatique, écran 8), mais elle ne bloque pas ce cas.

### Vue de l'auteur (« Ma question »)

L'auteur du fait posé n'est pas un destinataire (il ne répond jamais à sa propre question), mais accède depuis l'accueil à un lien « Voir ma question » (plutôt que « Répondre ») qui affiche :
- la question et sa réponse (lecture seule, pas de modification ni suppression possible une fois posée)
- l'anecdote, si renseignée
- **qui, dans la famille, a déjà répondu ou non** (juste le statut — jamais le contenu de la réponse de chacun, pour ne pas gâcher la révélation)

Implémenté via une fonction `get_question_participants(p_quiz_question_id)` (`security definer`, voir `supabase/migrations/20261109180000_question_participants_rpc.sql`) plutôt qu'un assouplissement de la policy RLS sur `question_recipients` — une policy plus large aurait aussi exposé `answer_given`/`result` de chacun.


## 7. Valider les réponses libres

But : pour l'auteur d'un fait en saisie libre (ou celui qui a pris la main), accepter ou refuser les réponses non identiques.

La validation est **anonyme** : le validateur ne voit pas qui a donné chaque réponse.

Affiche :
- la question et la bonne réponse
- les réponses à valider, **regroupées par valeur identique** (« Durant » : 3 réponses), pour ne valider qu'une fois
- les réponses déjà validées automatiquement, pour information

Actions :
- Accepter ou refuser chaque réponse (ou groupe de réponses)
- Une fois tout validé → la question sera révélée à la deadline, ou tout de suite si la deadline est passée

Implémenté (`src/app/validate.tsx`) via `get_pending_validations`/`validate_pending_answers` (`security definer`, voir `supabase/migrations/20261109200000_validate_free_text_answers.sql` et `20261109210000_gate_validation_anonymity.sql`) : ces fonctions ne renvoient jamais qui a donné quelle réponse (juste la valeur, son nombre d'occurrences, et les ids de ligne nécessaires pour appliquer la décision), pour respecter l'anonymat documenté ci-dessus. Accessible depuis « Ma question » (écran 6) via un lien « Valider les réponses (N en attente) » dès qu'il y en a ; `reveal_current_question` refuse maintenant explicitement de révéler tant qu'il en reste (plus d'auto-résolution silencieuse en "incorrect").

**Anonymat contre la corrélation temporelle** (2026-11-09, repéré par l'utilisateur) : l'écran « Ma question » montre « qui a répondu » par nom, en temps réel. Si les groupes à valider apparaissaient eux aussi au fil de l'eau, un groupe de taille 1 apparaissant juste après qu'un ✓ s'affiche pour une personne lui serait trivialement attribuable — cassant l'anonymat malgré le regroupement par valeur. Solution retenue : les groupes (en attente **et** déjà auto-validés, même risque sur les deux) ne sont visibles qu'une fois que **plus des 2/3 des destinataires ont répondu**, ou que le moment de la première relance à l'auteur est atteint (pas de vraies notifications encore, mais le même calcul que `concept.md` : dès que tout le monde a répondu, ou au plus tard 24h avant la deadline). Avec un petit nombre de destinataires, les 2/3 arrondissent de fait à « tout le monde » (fuite fermée complètement) ; avec une famille plus nombreuse, la validation « au fil de l'eau » reste possible un peu plus tôt, sur un groupe assez grand pour rester anonyme.

**Simplifié pour l'implémentation initiale** : pas de « prise de main » (un autre joueur prenant le relais après 7 jours si l'auteur ne valide pas) — auteur uniquement pour l'instant. Pas de vraies notifications/relances (le calcul du seuil des 24h avant deadline est réutilisé pour le déblocage de la validation, mais aucun email n'est envoyé).


## 8. Révélation

But : découvrir la bonne réponse et les résultats d'une question.

Affiche :
- la question et la bonne réponse
- l'auteur du fait, son anecdote ou contexte, et ses pièces jointes le cas échéant (hors MVP)
- qui a eu juste, qui a eu faux, qui n'a pas répondu
- la réponse donnée par chaque joueur, y compris les fausses (souvent drôles, elles lancent la discussion)
- les scores de la session et le score cumulé (« X bonnes / Y posées »)

Actions :
- Question suivante de la session
- Retour à l'accueil

Hors MVP (roadmap) : réactions et commentaires.

### Déclenchement

Comme pour la pioche, **manuel pour l'instant** : un bouton « Déclencher la révélation », affiché à l'auteur sur l'écran « Ma question » (voir écran 6), disponible uniquement une fois que **tous les destinataires ont répondu** (vérifié aussi côté serveur, pas seulement par le bouton désactivé côté client). Pour les autres joueurs, une fois la révélation déclenchée, l'accueil ne propose plus « Répondre » mais « La dernière session est terminée → Voir la révélation ».

**Révélation automatique** : `auto_reveal_expired_sessions()`, programmée par `pg_cron` toutes les heures (migration `20261109240000_automatic_triggering.sql`), clôture toute session dont la deadline est dépassée, qu'on ait ou non reçu toutes les réponses (« pas de blocage par les retardataires », voir `concept.md`) : les réponses manquantes sont comptées fausses. Comme pour la pioche, la migration programme la tâche dès qu'elle est appliquée (vérifier avec `select * from cron.job;`, désactiver avec `cron.unschedule` pour rester en manuel pendant les tests).

**Règle (décision du 2026-11-10)** : **pas de révélation automatique tant qu'il reste une réponse à valider**. Seules les questions en saisie libre sont concernées, puisque c'est le seul type où une réponse peut être « en attente de validation ». La question attend que l'auteur valide, ou qu'un joueur prenne la main 7 jours après la deadline (voir `concept.md`) : celui qui prend la main veut faire avancer le jeu, on part du principe qu'il validera ou refusera les réponses. Une fois toutes les réponses traitées, le passage horaire suivant révèle la question, puisque la deadline est dépassée.

**À corriger** : le code actuel ne respecte pas cette règle. `auto_reveal_expired_sessions()` compte les réponses en attente de validation comme fausses et clôture la session. Il faut qu'elle ignore toute session qui a encore une réponse `pending_validation`. Lié : le blocage des réponses après la deadline (voir écran 6, À corriger), d'autant plus nécessaire qu'une session peut maintenant rester ouverte longtemps après sa deadline.

**Simplifié pour l'implémentation initiale** (`src/app/reveal.tsx`) : une seule question par session (voir `concept.md`), donc pas de « question suivante ». `reveal_current_question` refuse de révéler tant qu'il reste des réponses « en attente de validation » (voir écran 7) — l'auteur doit d'abord passer par `src/app/validate.tsx`. Pas de score cumulé inter-sessions (demande d'agréger plusieurs sessions passées, pas construit). Pas de réactions/commentaires (hors MVP).

**Sécurité** : la bonne réponse (`quiz_questions.answer_value_snapshot`) n'est plus jamais envoyée au client avant la révélation — jusqu'ici, `respond.tsx` la recevait dans la réponse de l'API pour comparer côté client, visible par n'importe qui ouvrant les outils réseau du navigateur avant même d'avoir répondu. Le calcul juste/faux se fait maintenant entièrement côté serveur via la fonction `submit_answer` (voir `supabase/migrations/20261109190000_reveal_and_secure_answers.sql`), qui remplace l'écriture directe du joueur sur `question_recipients` (la policy correspondante a été retirée : elle aurait permis à un joueur de s'auto-attribuer « juste » sans vraiment répondre correctement). La révélation elle-même passe par `reveal_current_question` (auteur uniquement, vérifie que tout le monde a répondu, bascule `quiz_sessions.status` à `closed`) et `get_revealed_question` (lisible par toute la famille une fois la session fermée).

### Corrections

Affichée sur l'écran de révélation, qui sert aussi de vue détaillée d'une question depuis les archives (écran 9) : on peut donc proposer une correction juste après la révélation comme plus tard depuis les archives. N'importe quel membre de la famille **sauf l'auteur du fait** peut proposer une correction (nouvelle valeur + commentaire facultatif, même champ guidé que la réponse). L'auteur accepte ou refuse :
- **Acceptée** : la valeur canonique du fait change, l'ancienne reste visible dans l'historique (« Corrigé le [date] : ancienne → nouvelle »), et les scores de **toutes les sessions passées** ayant utilisé ce fait sont recalculés (un même fait peut être repioché plus tard, voir « Pioche et création de session ») : les joueurs ayant répondu l'ancienne valeur passent en « annulée » (ne compte ni pour ni contre), ceux ayant répondu la nouvelle passent en « juste », les autres ne changent pas.
- **Refusée** : les deux versions restent visibles comme une note sur le fait, sans trancher qui a raison.

Implémenté via `propose_correction`/`validate_correction` (`security definer`, voir `supabase/migrations/20261109220000_corrections.sql`). Une seule correction à la fois peut être en attente par fait.

**Simplifié pour l'implémentation initiale** : pas de « sans réponse » automatique (la règle du concept prévoit que l'absence de réponse de l'auteur transforme aussi la proposition en note, mais ça suppose des relances/notifications, pas encore construites) — seule une décision explicite de l'auteur (accepter/refuser) fait sortir une correction de l'état « en attente ».


## 9. Archives

But : consulter la base de connaissance de la famille, constituée par toutes les questions posées.

### Version MVP (simple)

Étapes :
1. Choisir la personne centrale (étape sautée s'il n'y en a qu'une)
2. Liste des questions déjà révélées qui la concernent, avec leur réponse

Les archives affichent les mêmes informations pour tout le monde : les faits pas encore posés n'y apparaissent pas, y compris pour leur auteur.

Action : ouvrir une question → son détail (même contenu que la révélation)

### Enrichissements après le MVP (archives)

- Regroupement par catégorie (naissance et enfance, jeunesse, couple…) et filtres
- Pour chaque fait : auteur, anecdote, date de révélation, taux de bonnes réponses (« 3 joueurs sur 5 avaient trouvé »)
- Recherche par mot-clé
- **Frise chronologique** de la vie de chaque personne centrale, construite à partir des faits de type date et année


## 10. Arbre familial

But : voir qui est qui dans la famille, et créer les relations entre les personnes.

### Existant (`src/app/family-tree.tsx`)

- Une carte par personne centrale avec son conjoint, ses parents, ses frères et sœurs et ses enfants, puis la liste des autres membres.
- Un formulaire pour lier deux personnes (« conjoint » ou « parent »), avec création à la volée d'une personne manquante.
- Lecture et ajout seulement : pas de suppression ni de modification d'une relation ou d'une personne.

### À faire

**Affichage en arbre généalogique** (dans les grandes lignes) :
- l'affichage s'organise selon les relations créées : les enfants sous leurs parents, les conjoints côte à côte ;
- des traits entre les personnes représentent les relations ;
- toute relation ajoutée se répercute immédiatement sur l'arbre.

**Plus de types de relation à la création** :
- ajouter « enfant » aux choix actuels (« conjoint », « parent »). Le résultat est le même que « parent » dans l'autre sens (`parent_of` avec les deux personnes inversées), mais c'est plus naturel selon la personne depuis laquelle on part ;
- ajouter « frère / sœur » (adelphe), pour lier directement deux personnes dont on ne connaît pas les parents (ex : les frères et sœurs d'une grand-mère). Demande un nouveau type de relation `sibling_of`, symétrique comme `spouse_of`. Dans l'arbre, les adelphes d'une personne sont alors ceux liés directement, plus ceux qui partagent un parent enregistré. La condition « a des frères ou sœurs » du catalogue (écran 5) doit tenir compte des deux cas.
