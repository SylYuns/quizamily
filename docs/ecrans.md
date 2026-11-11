# Écrans du MVP

Description fonctionnelle : ce que chaque écran affiche et ce qu'on peut y faire. La charte visuelle (couleurs, polices, styles de boutons) et le lien vers les maquettes sont dans `design.md`. L'interface reste volontairement simple, elle sera enrichie au fur et à mesure.

Les points marqués **À décider** sont des questions ouvertes.

## Règles communes

- **Bandeau collé en haut de l'écran**, dans tous les écrans liés à une famille :
  - le **nom de la famille active**, sous forme de bouton : il ouvre le choix de famille (écran 3) si le joueur en a plusieurs, ou propose « Créer une autre famille » s'il n'en a qu'une ;
  - à côté, un **petit bouton « Inviter »** qui donne le lien à partager pour rejoindre la famille (copie ou partage) ;
  - dans un coin, un **menu burger** : déconnexion, « Créer une session maintenant » (outil de test), et plus tard profil et réglages des notifications.
- Un joueur peut appartenir à plusieurs familles (famille recomposée, belle-famille…). Il a une fiche par famille, avec un lien de parenté propre à chacune.
- Les emails indiquent toujours la famille concernée dans l'objet (ex : « [Famille Chardaire] Nouvelle question »).

## Parcours

```
Connexion
→ Accueil - choix de famille (seulement si le joueur a au moins 2 familles)
→ Accueil - famille
   → Participer au quiz : Répondre / Ma question / Valider des réponses / Voir la révélation
   → Consulter les connaissances : Arbre → Récapitulatif d'une personne
   → Ajouter un souvenir / Historique / Mes faits
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

But : point d'entrée dans une famille. Le but de l'app est de proposer des quiz pour en apprendre plus sur sa famille : l'écran met donc en avant **jouer** et **apprendre**, puis contribuer.

### Organisation (refonte décidée le 2026-11-10)

Du haut vers le bas, par ordre d'importance :

1. **Bandeau** (voir Règles communes) : nom de la famille, bouton « Inviter », menu burger.
2. **Deux gros boutons centraux** :
   - **« Participer au quiz »** : mène à la bonne action selon la phase du jeu (voir États ci-dessous). Son libellé, une icône ou un badge indiquent l'état.
   - **« Consulter les connaissances »** (bouton blanc à liserés bleu et rouge, jamais rouge plein) : ouvre l'arbre familial en mode consultation (écran 10). En touchant une personne, on lit le récapitulatif de ce qu'on sait d'elle (écran 11).
3. **« Ajouter un souvenir »** (écran 5) : moins important, mais mis en avant. **Alerte** quand il reste moins de 5 faits jamais posés dans la pioche (« Plus que 3 questions en réserve : ajoutez des souvenirs ! »).
4. **« Historique »** (écran 12) : les questions déjà posées et le tableau des scores.
5. **« Mes faits »** (écran 5, Mes faits), avec un **badge** quand une proposition de correction attend la décision du joueur sur l'un de ses faits.

### États du bouton « Participer au quiz »

Deux styles (détail dans `design.md`) : **bleu plein** quand une action t'attend, **blanc à liserés bleu et rouge** quand il n'y a rien à faire et qu'on attend. Chaque état est dessiné dans la maquette de l'accueil (lien dans `design.md`).

| État | Style | Ce que le bouton affiche | Où il mène |
|---|---|---|---|
| Une question t'attend | Bleu plein, badge « 1 » | « Une question t'attend » + deadline (« À répondre avant dimanche 15 novembre ») | Répondre (écran 6) |
| Tu as répondu, en attente de la révélation | Blanc à liserés | « Réponse envoyée » + date de la révélation, lien « Voir ou modifier ma réponse » | Répondre (consulter / modifier sa réponse jusqu'à la deadline) |
| Tu es l'auteur de la question en cours | Blanc à liserés | « Ta question est en jeu » + nombre de réponses reçues et date de la révélation, lien « Voir ma question » | Ma question (écran 6, vue de l'auteur) |
| Réponses à valider | Bleu plein, badge du nombre | « N réponses à valider » + rappel de la question | Valider (écran 7) |
| Révélation disponible | Bleu plein, badge « 1 » | « La révélation est là ! » + « Découvre qui avait trouvé » | Révélation (écran 8) |
| Entre deux quiz | Blanc à liserés | « Quiz terminé » + date du prochain quiz (« Prochaine question lundi 16 novembre ») ; en phase de test, sans tâche planifiée : « En attente du prochain quiz » ; lien « Revoir la dernière révélation » | Revoir la dernière révélation (écran 8) |
| Plus aucun fait à piocher | Blanc à liserés | « Pas de prochain quiz » + « Il n'y a plus de souvenirs à piocher », lien « Ajouter des souvenirs » | Ajouter un souvenir (écran 5) |

Le bouton n'a pas d'icône. L'étiquette « PARTICIPER AU QUIZ » est en première ligne, avec le badge éventuel aligné à droite.

Si plusieurs états s'appliquent en même temps (ex : l'auteur doit valider des réponses), le plus urgent l'emporte : valider > répondre > révélation disponible > en attente.

### Famille qui démarre (aucun quiz n'a encore eu lieu)

Le bouton « Participer au quiz » n'est pas affiché. Il est remplacé, au même endroit, par une carte **« Lancer votre premier quiz »** :
- les étapes à franchir, avec leur avancement (ex : « ✓ 2 joueurs sur 3 », « 1 souvenir ajouté ») ;
- deux boutons dans la carte : **« Inviter des membres »** et **« Ajouter un souvenir »**.

Dès le premier quiz, la carte laisse sa place au bouton « Participer au quiz ». « Consulter les connaissances » reste affiché : l'arbre sert aussi à construire la famille au démarrage.

### Existant (`src/app/home.tsx`)

**Fait le 2026-11-11**, d'après la maquette validée (charte dans `docs/design.md`, polices Fredoka/Nunito ajoutées au projet) :
- bandeau : nom de famille (menu déroulant pour changer de famille ou en créer une autre), bouton « Inviter » (copie le lien), menu burger (« Créer une session maintenant » pour les tests, déconnexion) ;
- bouton « Participer au quiz » avec ses 8 états (7 de la maquette + le cas rare « tu as rejoint après la pioche », en style atténué) ; distingue « La révélation est là ! » de « Quiz terminé » via un repère mémorisé sur l'appareil (`AsyncStorage`, posé par `reveal.tsx` à la consultation) — pas de notion de "vu" côté serveur ;
- carte « Lancer votre premier quiz » tant qu'aucune session n'a jamais eu lieu pour la famille ;
- « Consulter les connaissances » (ouvre l'arbre) avec le sous-titre « N souvenirs sur M personnes » ;
- « Ajouter un souvenir » avec l'alerte réserve bientôt vide (moins de 5 faits jamais posés) ;
- tuiles « Historique » (écran 12, pas encore construit — ne fait rien pour l'instant) et « Mes faits » (badge si une correction proposée sur l'un de mes faits attend ma décision, via `get_my_pending_corrections_count`).

**Pas d'icônes vectorielles** (comme pour l'arbre) : glyphes en caractères ou petites formes dessinées (View), en attendant de vraies icônes. Le choix de famille (écran 3) et « Créer une autre famille » sont une liste déroulante simplifiée dans le bandeau, pas un écran dédié.

### Pioche et création de session (`create-quiz-session`)

Edge Function (`supabase/functions/create-quiz-session`), appelée par un membre de la famille avec `{ family_id }`. Logique :

1. Vérifie que l'appelant est bien membre de la famille (sinon 403).
2. Refuse si une session est déjà `open` pour cette famille (sinon 409) — une seule session active à la fois.
3. Pioche **un seul fait** parmi ceux de la famille.
   - **Règle (décision du 2026-11-10)** : seuls les faits **jamais posés** sont piochés. Un fait déjà posé ne peut être repioché que s'il ne reste plus aucun fait jamais posé, et les joueurs en sont alors prévenus (forme à définir).
   - Pondération entre les faits jamais posés : bonus ×1.5 si le sujet est une personne centrale (priorité, pas exclusivité).
   - Un fait déjà posé dans une session encore `open` est exclu (pas de double-pioche concurrente).
   - **Corrigé le 2026-11-10** dans les deux implémentations, gardées alignées : `supabase/functions/create-quiz-session/pioche.ts` (testé par `pioche.test.ts`, `npm run test:pioche`) et `create_quiz_session_for_family()` (migration `20261110130000_pioche_never_posed_first.sql`, testée sur Postgres local). Le résultat renvoie aussi `reused` (fait déjà posé repioché, faute de faits jamais posés) et `neverPosedLeft` (faits jamais posés restants, pour l'alerte de l'accueil sous 5). En attendant la refonte de l'accueil, le message affiché après « Créer une session » le signale.
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

**Propositions de correction** : quand quelqu'un propose une correction sur un de ses faits, le joueur la voit ici (badge sur le bouton « Mes faits » de l'accueil) et l'accepte ou la refuse. Notification par email en attendant les notifications push (phase 2, applis mobiles).

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

**Blocage des réponses** (corrigé le 2026-11-10, migration `20261110100000_reveal_waits_validation_and_answer_lock.sql`) : `submit_answer` refuse toute réponse une fois la deadline passée ou la session clôturée, et refuse la modification d'une réponse libre une fois que tout le monde a répondu et que l'auteur a validé (verrouillage prévu plus haut). Une réponse modifiée avant ce verrouillage repart de zéro : une validation précédente est effacée. Le message de refus du serveur s'affiche tel quel sur l'écran.

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

**Règles (décisions du 2026-11-10)** :
- **Les joueurs qui n'ont pas répondu ne bloquent jamais la révélation**, ni automatique ni manuelle : leurs réponses manquantes comptent faux.
- **Seules les réponses libres encore à valider bloquent la révélation** (type saisie libre, seul type où une réponse peut être « en attente de validation »). La question attend que l'auteur valide, ou qu'un joueur prenne la main 7 jours après la deadline (voir `concept.md`) : celui qui prend la main veut faire avancer le jeu, on part du principe qu'il validera ou refusera les réponses.
- **Toutes les validations faites avant la deadline** : révélation normale, à la deadline.
- **Toutes les validations faites après la deadline** : la question n'attendait plus que ça, elle est révélée immédiatement, dès la dernière validation (l'app ouvre directement la révélation).

**Révélation automatique** : `auto_reveal_expired_sessions()`, programmée par `pg_cron` toutes les heures (migration `20261109240000_automatic_triggering.sql`), clôture toute session dont la deadline est dépassée et qui n'a plus de réponse à valider. La révélation « à la deadline » a donc lieu au plus tard une heure après celle-ci. La migration programme la tâche dès qu'elle est appliquée : pour rester en manuel pendant les tests, la désactiver (voir « À faire sur l'ordinateur avec Supabase » dans `roadmap.md`).

**Révélation manuelle** : n'existe que pour la phase de test. Bouton « Déclencher la révélation » affiché à l'auteur sur l'écran « Ma question » (voir écran 6), utilisable à tout moment tant qu'il ne reste pas de réponse à valider, même si certains joueurs n'ont pas répondu (l'écran prévient que leurs réponses compteront faux).

**Implémentation** (migrations `20261110100000_reveal_waits_validation_and_answer_lock.sql` et `20261110110000_reveal_timing_rules.sql`) : les trois chemins (automatique, manuel, dernière validation après la deadline) passent par une même fonction de clôture, `close_quiz_session()`. `validate_pending_answers()` renvoie `true` quand la validation a déclenché la révélation. Le blocage des réponses après la deadline est décrit à l'écran 6.

**Simplifié pour l'implémentation initiale** (`src/app/reveal.tsx`) : une seule question par session (voir `concept.md`), donc pas de « question suivante ». Pas de score cumulé inter-sessions (demande d'agréger plusieurs sessions passées, pas construit). Pas de réactions/commentaires (hors MVP).

**Sécurité** : la bonne réponse (`quiz_questions.answer_value_snapshot`) n'est plus jamais envoyée au client avant la révélation — jusqu'ici, `respond.tsx` la recevait dans la réponse de l'API pour comparer côté client, visible par n'importe qui ouvrant les outils réseau du navigateur avant même d'avoir répondu. Le calcul juste/faux se fait maintenant entièrement côté serveur via la fonction `submit_answer` (voir `supabase/migrations/20261109190000_reveal_and_secure_answers.sql`), qui remplace l'écriture directe du joueur sur `question_recipients` (la policy correspondante a été retirée : elle aurait permis à un joueur de s'auto-attribuer « juste » sans vraiment répondre correctement). La révélation elle-même passe par `reveal_current_question` (auteur uniquement, vérifie que tout le monde a répondu, bascule `quiz_sessions.status` à `closed`) et `get_revealed_question` (lisible par toute la famille une fois la session fermée).

### Corrections

Affichée sur l'écran de révélation, qui sert aussi de vue détaillée d'une question depuis les archives (écran 9) : on peut donc proposer une correction juste après la révélation comme plus tard depuis les archives. N'importe quel membre de la famille **sauf l'auteur du fait** peut proposer une correction (nouvelle valeur + commentaire facultatif, même champ guidé que la réponse). L'auteur accepte ou refuse :
- **Acceptée** : la valeur canonique du fait change, l'ancienne reste visible dans l'historique (« Corrigé le [date] : ancienne → nouvelle »), et les scores de **toutes les sessions passées** ayant utilisé ce fait sont recalculés (un même fait peut être repioché plus tard, voir « Pioche et création de session ») : les joueurs ayant répondu l'ancienne valeur passent en « annulée » (ne compte ni pour ni contre), ceux ayant répondu la nouvelle passent en « juste », les autres ne changent pas.
- **Refusée** : les deux versions restent visibles comme une note sur le fait, sans trancher qui a raison.

Implémenté via `propose_correction`/`validate_correction` (`security definer`, voir `supabase/migrations/20261109220000_corrections.sql`). Une seule correction à la fois peut être en attente par fait.

**Simplifié pour l'implémentation initiale** : pas de « sans réponse » automatique (la règle du concept prévoit que l'absence de réponse de l'auteur transforme aussi la proposition en note, mais ça suppose des relances/notifications, pas encore construites) — seule une décision explicite de l'auteur (accepter/refuser) fait sortir une correction de l'état « en attente ».


## 9. Archives (fusionnées dans l'arbre, décision du 2026-11-10)

L'écran « Archives » disparaît en tant que tel. Ses deux usages sont repris ailleurs :
- **les connaissances accumulées sur une personne** : arbre en mode consultation (écran 10) → récapitulatif de la personne (écran 11) ;
- **les questions déjà posées** : Historique (écran 12).

Règle conservée : les mêmes informations pour tout le monde. Les faits pas encore posés n'apparaissent nulle part, y compris pour leur auteur (ils ne sont visibles que dans « Mes faits »).

**Existant** (`src/app/archive.tsx`) : choix de la personne centrale, puis liste des questions révélées la concernant, détail via `src/app/reveal.tsx`. À garder jusqu'à ce que les écrans 10 à 12 le remplacent.

**Repris dans les écrans 11 et 12** (anciennes pistes d'enrichissement des archives) : regroupement par catégorie, auteur et anecdote de chaque fait, taux de bonnes réponses, recherche par mot-clé, frise chronologique de la vie d'une personne.


## 10. Arbre familial

But : **porte d'entrée vers les connaissances** de la famille (bouton « Consulter les connaissances » de l'accueil), et gestion des membres et des relations.

### Deux modes

- **Consultation** (mode d'arrivée) : l'arbre généalogique, épuré. Sur chaque personne, un petit compteur : « 5 souvenirs », plus « 2 à découvrir » pour ses faits pas encore posés (le nombre ne dévoile rien et donne envie de jouer). Toucher une personne → son récapitulatif (écran 11).
- **Modification** (bouton « Modifier » dans l'écran) : ajouter des membres, créer des relations (formulaire existant + nouveaux types ci-dessous). La modification reste dans l'écran de l'arbre, pas dans le menu burger.

### Existant (`src/app/family-tree.tsx`)

- Une carte par personne centrale avec son conjoint, ses parents, ses frères et sœurs et ses enfants, puis la liste des autres membres.
- Un formulaire pour lier deux personnes (« conjoint » ou « parent »), avec création à la volée d'une personne manquante.
- Lecture et ajout seulement : pas de suppression ni de modification d'une relation ou d'une personne.

### Quelle partie de la famille est affichée (décision du 2026-11-10)

La famille de l'appli, ce sont **les descendants d'un ancêtre commun, avec leurs conjoints**. Les conjoints (« pièces rapportées ») n'ont pas d'ascendance dans cette famille : ils l'auront dans leur propre famille.
- **Un couple n'a qu'un seul couple de parents** renseigné. Pas de « + Ajouter ses parents » sur un conjoint.
- **L'arbre affiché** est celui de l'ancêtre commun : on part de la première personne centrale, on remonte de parent en parent jusqu'au plus haut, puis on affiche toute sa descendance avec les conjoints (oncles, tantes, cousins compris). Si l'ancêtre le plus haut a des adelphes liés directement (`sibling_of`, sans parents connus), ils sont sur sa ligne, avec leurs descendants.
- **Tout le reste n'est pas affiché** : personnes sans aucune relation, petits groupes reliés entre eux mais pas à l'arbre principal, personnes centrales sans lien avec la première. Un **bouton avec alerte** (« 3 personnes sans relation ») les signale ; en mode Modifier, un encart les liste avec un bouton « Relier ».
- Cas limite : si les parents des deux conjoints sont quand même renseignés, l'arbre suit ceux du conjoint qui descend de l'ancêtre commun.
- Un seul conjoint par personne pour l'instant (pas de remariage). Rien de particulier pour les personnes décédées pour l'instant.

### Affichage et navigation (décision du 2026-11-10)

**Maquette** : « Quizamily – Arbre familial », lien et charte dans `design.md`, source dans `docs/maquettes/arbre/` (famille fictive sur 4 générations, 5 écrans : ouverture, déplacements, mode Modifier).

- **3 lignes visibles** : la génération centrée au milieu de l'écran (cartes en taille normale, sur une bande blanche), la génération précédente au-dessus et la suivante en dessous (cartes plus petites).
- **Glisser vers le haut ou le bas** change de génération, avec des **crans** : l'écran s'arrête sur une génération bien centrée en hauteur. Des points sur le bord droit indiquent la génération affichée.
- **Glisser à gauche ou à droite** parcourt la génération centrée, avec des crans **personne par personne** : à chaque cran, une personne est au centre de l'écran.
- **La ligne du dessus suit** : les parents de la personne centrée sont centrés au-dessus. Tant qu'on passe d'un adelphe à l'autre, elle ne bouge pas ; en passant à une autre fratrie, elle glisse jusqu'à centrer les nouveaux parents.
- **La ligne du dessous suit** : les enfants de la personne (du couple) centrée sont centrés en dessous.
- **Le conjoint** est juste à côté de la personne. Centrer l'un ou l'autre centre les mêmes parents (ceux du couple).
- **Placement** : tout l'arbre est calculé d'un bloc, chaque couple centré au-dessus de ses enfants, chaque descendance occupant sa propre largeur, même écartement sur toutes les lignes. Conséquence : une génération nombreuse élargit l'arbre et laisse des espaces entre les familles des autres lignes.
- **Traits de filiation** pour **toutes** les familles entre deux lignes visibles, toujours **à angle droit** (descente depuis le couple, barre horizontale, descente vers chaque enfant), **jamais obliques**. Ils sont persistants : tracés même s'ils sortent en partie de l'écran.
- **Amorces** : un petit trait vertical au-dessus de chaque personne ou couple de la ligne du haut qui a des parents, et sous chaque personne ou couple de la ligne du bas qui a des enfants, pour montrer que l'arbre continue.
- **Sur chaque personne** : initiale dans un rond de couleur, prénom, nombre de souvenirs ; sur la ligne centrale, en plus, « N à découvrir » (faits pas encore posés). La personne centrée a un contour bleu ; une personne centrale a une petite étoile bleue.
- **Ouverture** : centrée sur la première personne centrale, puis sur la dernière personne consultée (mémorisée sur l'appareil, par famille ; en changeant d'appareil, on revient sur la première personne centrale).
- **Mode Modifier** : titre « Modifier l'arbre », bouton « Terminé » ; un crayon sur chaque personne (toucher = la modifier) ; boutons en pointillés « + Frère ou sœur » (au bout de la fratrie centrée) et « + Enfant » (au bout des enfants du couple centré) ; encart des personnes à placer en bas.

**À tester en conditions réelles** : une génération de 8 ou 9 enfants, chacun avec un conjoint et plusieurs enfants (largeur de l'arbre, longueur des traits, confort du défilement).

### À faire

**Calcul du placement : fait le 2026-11-10** dans `src/lib/family-tree-layout.ts`, module pur (sans React, Expo ni Supabase), testé par `src/lib/family-tree-layout.test.ts` (`npm run test:layout`, 19 tests : famille d'exemple, personnes non reliées, ascendance d'un conjoint ignorée, adelphes `sibling_of`, relations incohérentes, grande fratrie de 9 enfants avec conjoints et 27 petits-enfants, 200 familles aléatoires, navigation, traits). Il fournit :
- `buildFamilyTree(personnes, relations, personneDeDépart)` : générations, couples, ancêtre commun, personnes non reliées ;
- `layoutFamilyTree(arbre)` : position horizontale de chaque personne et de chaque couple ;
- `rowOffsetsFor(placement, personneCentrée, milieuDeLÉcran)` : décalage de chaque ligne (crans) ;
- `moveFocus(placement, personne, "left" | "right" | "up" | "down")` : personne centrée après un cran ;
- `connectorSegments(placement, lignes, décalages)` : traits de couple, de filiation et amorces, à angle droit.

**Écran réécrit le 2026-11-10** (`src/app/family-tree.tsx`), avec ce module, et type de relation `sibling_of` ajouté en base (migration `20261110120000_sibling_relation.sql`). **Pas encore testé à l'écran** (voir la liste « À faire sur l'ordinateur avec Supabase » dans `roadmap.md`).

Ce qui est fait :
- 3 lignes, bande blanche sous la génération centrée, points de génération à droite, « Haut de l'arbre » en génération 0 ;
- glissement horizontal (crans personne par personne ; un glissement long fait plusieurs crans) et vertical (crans par génération), avec une animation qui repart de la position sous le doigt ;
- traits de couple, de filiation pour toutes les familles visibles et amorces, calculés par le module ;
- compteurs « N souvenirs » (faits révélés) et « N à découvrir » (faits pas encore posés) ;
- dernière personne consultée mémorisée sur l'appareil, par famille ;
- alerte « N personnes sans relation » (ouvre le mode Modifier) ;
- toucher une personne ouvre ses souvenirs dans les archives (`/archive?personId=…`), en attendant le récapitulatif (écran 11) ;
- mode Modifier : toucher une personne la sélectionne ; boutons « + Conjoint·e » (si elle n'en a pas), « + Enfant » (enfant du couple), « + Frère ou sœur » (rattaché aux parents s'ils sont connus, sinon lien `sibling_of` ; pas proposé pour un conjoint), « Relier à une personne… » (conjoint·e / parent / enfant / frère ou sœur de, personnes sans relation en tête) ; encart des personnes à placer.

Écarts avec la maquette, à reprendre si besoin :
- les boutons d'ajout sont dans un panneau sous l'arbre, pas en cartes pointillées dans l'arbre ;
- pendant un glissement horizontal, seule la ligne centrale glisse de façon continue ; les lignes du dessus et du dessous se recalent d'un coup ;
- polices système (Fredoka et Nunito pas encore ajoutées au projet), icônes en caractères (★, ✎, ⚠, ‹) en attendant de vraies icônes ;
- le bandeau famille (nom, inviter, menu) n'est pas encore là : il viendra avec la refonte de l'accueil.

La condition « a des frères ou sœurs » du catalogue (écran 5) tient compte des liens `sibling_of` (`src/app/add-fact.tsx`).

**Plus de types de relation à la création** :
- ajouter « enfant » aux choix actuels (« conjoint », « parent »). Le résultat est le même que « parent » dans l'autre sens (`parent_of` avec les deux personnes inversées), mais c'est plus naturel selon la personne depuis laquelle on part ;
- ajouter « frère / sœur » (adelphe), pour lier directement deux personnes dont on ne connaît pas les parents (ex : les frères et sœurs d'une grand-mère). Demande un nouveau type de relation `sibling_of`, symétrique comme `spouse_of`. Dans l'arbre, les adelphes d'une personne sont alors ceux liés directement, plus ceux qui partagent un parent enregistré. La condition « a des frères ou sœurs » du catalogue (écran 5) doit tenir compte des deux cas.


## 11. Récapitulatif d'une personne

But : lire ce que la famille sait d'une personne, sous une forme agréable, et non comme une liste de faits l'un après l'autre.

Accès : depuis l'arbre en mode consultation (écran 10), en touchant une personne.

Affiche :
- en tête : la personne (photo ou placeholder, nom, lien de parenté) ;
- une **mini-biographie rédigée**, regroupée par catégorie du catalogue (naissance et enfance, jeunesse, couple et installation, culture et premières fois, retraite, voyages et loisirs). Exemple : « Marie est née le 3 mars 1936 à Reventin. Elle a quitté l'école à 14 ans et a appris à nager à 10 ans. » ;
- uniquement les faits **déjà révélés** (mêmes informations pour tout le monde) ;
- s'il reste des faits pas encore posés : « 2 souvenirs à découvrir dans les prochains quiz ».

Rédaction sans IA : chaque template du catalogue reçoit une **phrase de récapitulatif** (champ `recap` dans `question-templates.toml`, ex : « <sujet> est né le {réponse} »), et l'écran assemble les phrases par catégorie. L'accord au féminin et la 2e personne sont le même chantier technique que pour les questions.

Actions :
- Toucher une phrase → le détail de la question (même contenu que la révélation, écran 8) : réponses de chacun, auteur, anecdote, et proposition de correction.

Pistes pour plus tard : frise chronologique construite à partir des faits de type date et année ; photos et enregistrements (pièces jointes).


## 12. Historique

But : revoir les quiz passés et les scores.

Affiche :
- la liste des **questions déjà posées**, de la plus récente à la plus ancienne : question, bonne réponse, date de révélation, taux de bonnes réponses (« 3 joueurs sur 5 avaient trouvé ») ;
- le **tableau des scores** de la famille : score cumulé de chaque joueur (« 12 bonnes / 18 posées »), et score de contribution (nombre de souvenirs ajoutés).

Actions :
- Ouvrir une question → son détail (écran 8, avec proposition de correction).

**À construire** : le score cumulé sur plusieurs sessions n'existe pas encore (seul le résultat de chaque question est calculé), il demande une agrégation en base.

