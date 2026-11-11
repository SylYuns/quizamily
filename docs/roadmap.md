# Roadmap

## État actuel (2026-11-10)

Le MVP fonctionne de bout en bout en version simple, testé avec des comptes jetables et avec un deuxième vrai compte. Construit : auth, création/rejoindre une famille (avec « réclamer un profil existant »), ajout de faits (32/32 templates, y compris personne liée `<conjoint>` et élément choisi `<pays>`), « Mes faits » (modifier/supprimer, statut posé/révélé correct), mini arbre familial (lecture + ajout de relations), pioche (manuelle + automatique hebdomadaire), réponse, validation des réponses libres (anonyme), révélation (manuelle + automatique à la deadline), correction d'un fait avec recalcul rétroactif des scores, et archives en version simple — étapes 1 à 6, 8, 9, 11 et 12 (version simple) de la liste ci-dessous. Pas commencé : étapes 7, 10, 13.

**Pour reprendre le travail (ex. depuis un autre ordinateur)** : voir « À faire sur l'ordinateur avec Supabase » juste en dessous, puis « Points à décider » et « Prochains sujets » plus bas sur cette page.

## À faire sur l'ordinateur avec Supabase

**Fait le 2026-11-11** (revu et exécuté par Claude depuis l'ordinateur relié à Supabase) :

- [x] **Récupérer les derniers commits** : `git pull` (874152d, puis un correctif de lint en c0eaf91 — voir plus bas).
- [x] **Appliquer les migrations en attente** : les 5 migrations du 2026-11-10 sont poussées (`20261110100000` à `20261110140000`).
- [x] **Redéployer l'Edge Function de la pioche** : `create-quiz-session` redéployée avec la règle « jamais posé d'abord ».
- [x] **Tâches planifiées désactivées pendant la phase de test** (décision prise le 2026-11-11) : `auto-create-quiz-sessions` et `auto-reveal-expired-sessions` retirées de `cron.job`. Pour les réactiver, voir les commandes `cron.schedule` dans la migration `20261109240000_automatic_triggering.sql`.
- [x] **Vérifié l'app** : `npx tsc --noEmit` propre, `npx expo lint` a révélé 3 nouvelles erreurs sur `family-tree.tsx` (`react-hooks/refs` sur `pan`/`PanResponder` — faux positif : l'API `Animated` de React Native est conçue pour être lue/mutée hors du rendu React), corrigées avec un commentaire explicatif (commit `c0eaf91`). Seule l'ancienne erreur préexistante et sans rapport (`use-color-scheme.web.ts`) subsiste.
- [x] **Lancé les tests** : `npm run test:layout` (19/19) et `npm run test:pioche` (6/6), tous verts.
- [x] **Vérifié en conditions réelles (comptes jetables, nettoyés ensuite)** :
  - une question en saisie libre avec une réponse en attente de validation ne se révèle pas automatiquement à la deadline (`auto_reveal_expired_sessions` refuse) ; une fois la dernière validation faite après la deadline, `validate_pending_answers` révèle immédiatement (`revealed: true`) ;
  - un joueur qui n'a jamais répondu ne bloque pas la révélation et compte faux ;
  - la lecture directe de `facts.answer_value` est bien rejetée (`permission denied`) même après révélation ; `get_fact_answer`/`get_my_fact_answers` renvoient la bonne valeur au bon moment ;
  - le nouvel écran de l'arbre (`family-tree.tsx`) s'affiche correctement (couple centré, traits à angle droit, compteurs, étoile sur la personne centrale) ; mode Modifier testé : ajout d'un frère/sœur sans parents connus (`sibling_of`), bien positionné sur la ligne de la personne ; toucher une personne ouvre bien ses archives (`/archive?personId=…`).
- [ ] **Pas testé à la main** (clics automatisés, pas de vrais gestes tactiles) : glissements gauche/droite/haut/bas avec les crans, une grande fratrie (8-9 enfants), le rendu sur téléphone. À faire par un humain.

## Étapes de réalisation

1. Setup Expo + Supabase, schéma DB + RLS.
2. Auth + création famille + désignation des personnes centrales + relations de départ.
3. Invitations (lien) + flux de rejoindre une famille.
4. Catalogue de templates + formulaire d'ajout de fait (champs guidés par type) + « Mes faits ». *(fait — 32/32 templates, y compris la résolution d'une personne liée (`<conjoint>` : détection automatique si déjà connue, sinon choix parmi les personnes existantes ou création à la volée) et le choix d'un élément (`<pays>`), voir migration `20261109250000_linked_person_and_slot_templates.sql` ; section « Mes faits » avec modifier/supprimer et statut posé/révélé correct)*
5. Mini arbre familial (vue simple des personnes + relations). *(fait — `src/app/family-tree.tsx` : une carte par personne centrale avec conjoint·e/parents/frères et sœurs/enfants, liste des autres membres, formulaire pour lier deux personnes (conjoint ou parent-enfant), et création d'une personne manquante à la volée dans ce formulaire (ex : la génération intermédiaire entre une personne centrale et ses petits-enfants, si eux seuls ont un compte) ; reste : vraie capture par paire du lien de parenté du créateur avec chaque personne centrale, voir écran 2 dans `docs/ecrans.md`)*
6. Logique de pioche pondérée (fraîcheur + répartition auteurs) + Edge Function de création de session. *(fait : `supabase/functions/create-quiz-session` pour le déclenchement manuel, plus `auto_create_quiz_sessions()` + tâche `pg_cron` hebdomadaire (lundi 8h) pour le déclenchement automatique — voir étape 9 pour le détail du cron)*
7. Emails (nouvelle session, rappel, résultats).
8. Écran de réponse au quiz + logique du seuil de déclenchement du premier quiz. *(écran de réponse fait en version simple — `src/app/respond.tsx` ; seuil appliqué : la pioche automatique ne se déclenche que pour une famille ayant au moins 3 joueurs, voir « Décisions déjà prises » — reste : verrouillage de la réponse après la deadline, actuellement sans effet puisque la révélation auto absorbe ce cas)*
9. Révélation automatique à la deadline, calcul des scores (4 états) + validation des réponses libres par l'auteur (notifications, révélation différée, prise de main). *(fait en version simple — `src/app/reveal.tsx` + `src/app/validate.tsx` pour le déclenchement manuel par l'auteur, plus `auto_reveal_expired_sessions()` + tâche `pg_cron` horaire pour clôturer automatiquement toute session dont la deadline est dépassée (réponses manquantes ou en attente de validation comptées fausses) — reste : prise de main, notifications/relances, score cumulé inter-sessions)*
10. Réactions/commentaires sur les faits révélés.
11. Mécanisme de correction + recalcul rétroactif des scores. *(fait — `propose_correction`/`validate_correction`, voir `docs/ecrans.md` écran 8 ; accessible aussi depuis les archives, qui réutilisent l'écran de révélation pour le détail d'une question au-delà de la dernière révélation)*
12. Archive familiale enrichie (catégories, filtres, recherche) + score de contribution + relances. *(fait en version simple — `src/app/archive.tsx`, choix de la personne centrale puis liste des questions révélées la concernant, détail via `src/app/reveal.tsx` ; reste : regroupement par catégorie, auteur/anecdote/date de révélation/taux de bonnes réponses par fait, recherche, frise chronologique, score de contribution, relances)*
13. Polish, puis phase 2 : push notifications + builds iOS/Android.

## Scope du premier MVP partageable (test avec 2-3 personnes)

Volontairement réduit par rapport à la liste complète ci-dessus :

**Inclus** : auth + création famille + invite, création des personnes centrales (relations simplifiées), un catalogue réduit de ~15-20 templates codés en dur (pas de back-office d'édition), ajout de faits, pioche + session de quiz (version simple au début, pas besoin du roulement pondéré sophistiqué dès le jour 1), réponse, validation des réponses libres par l'auteur (écran de validation + emails de rappel à l'auteur et d'attente aux joueurs ; la prise de main peut attendre), révélation (scores + contexte), emails (nouvelle question + résultats), archives en version simple (liste des questions révélées concernant une personne centrale).

**Reporté après le premier test** : réactions/commentaires, relances de contribution, pièces jointes (photo/audio) sur les faits, notifications push, builds natifs iOS/Android (le web suffit pour tester avec 2-3 personnes). *(mécanisme de correction et vue arbre familial, listés ici à l'origine, sont finalement déjà construits — voir « État actuel » en haut de page.)*

## Estimation de charge (solo, ~1-2 jours/semaine, dev généraliste mais nouveau sur Expo/Supabase)

| Étape | Heures |
|---|---|
| Montée en compétence (petit projet-test Expo + Supabase) | 15-20h |
| Setup réel (projet, schéma, RLS, déploiement) | 4-6h |
| Auth + famille + invite | 8-12h |
| Personnes centrales (simplifié) | 6-10h |
| Catalogue de faits + formulaire guidé | 14-20h |
| Logique de session/pioche (version simple) | 10-14h |
| Flow de réponse | 8-12h |
| Écran de révélation | 8-12h |
| Emails | 8-12h |
| Déploiement web partageable | 2-4h |
| Marge debug/imprévu | 25-35h |
| **Total** | **~110 à 155h, soit ~11 à 16 semaines (3-4 mois)** |

Conseil : commencer par un mini projet jetable (pas le vrai modèle de données) pour apprendre les bases d'Expo + Supabase avant d'attaquer le vrai schéma.

## Validation / audience

Un pilote manuel sans code (Google Form + pioche manuelle + WhatsApp) avait été envisagé pour tester la boucle de jeu avant de coder, mais cette étape a été écartée — on part directement sur la réalisation technique.

Pistes de validation gardées en tête pour plus tard : discuter avec des personnes ayant des parents/grands-parents âgés, sonder des communautés de généalogie, et surtout suivre le **taux de rétention des familles testeuses** (pas juste l'enthousiasme initial) une fois le MVP partageable.

## Points à décider

Décisions de produit ou de sécurité pas encore tranchées — à trancher avant d'avancer sur le sujet concerné, ou à accepter explicitement comme compromis pour l'instant :

- **Emails/notifications** : aucune vraie notification n'existe encore (nouvelle session, rappel, relance de validation, résultats) — le calcul de timing ("24h avant la deadline") existe déjà côté logique (réutilisé pour débloquer la validation anonyme), mais rien n'envoie d'email. Fournisseur : Resend reste actif, en sandbox (pas de domaine vérifié — décision déjà prise de ne pas en acheter un pour l'instant, voir ci-dessous).
- **« Prise de main »** : un joueur reprenant la validation des réponses libres à la place de l'auteur après 7 jours (prévu dans `concept.md`) — pas construit, dépend des notifications ci-dessus.
- **Accord grammatical féminin/masculin** des questions (ex. « il/elle a pris l'avion ») — sujet technique ouvert depuis le début (voir `question-templates.toml`), jamais tranché.
- ~~**Fuite résiduelle, type `list`**~~ : **corrigée le 2026-11-10**. Sur l'écran de réponse, le champ ne propose plus que les valeurs validées de la liste globale, pas celles ajoutées par la famille (dont celle que l'auteur vient d'ajouter en créant le fait) ; le joueur peut toujours taper une valeur. Reste théorique : la liste des valeurs ajoutées par la famille est lisible par une requête directe sur `list_items`, mais sans lien avec un fait.
- ~~**Fuite résiduelle, `facts.answer_value`**~~ : **corrigée le 2026-11-10** (migration `20261110140000_hide_answers_from_direct_reads.sql`). Les colonnes `facts.answer_value`, `answer_history`, `pending_correction` et `quiz_questions.answer_value_snapshot` ne sont plus lisibles par requête directe ; l'appli passe par `get_fact_answer` (auteur, ou tout membre après révélation) et `get_my_fact_answers` (« Mes faits »).
- **Direction visuelle** (coloré/chaleureux, bleu-blanc-rouge — voir `concept.md`) : documentée depuis le début, jamais appliquée. Tous les écrans utilisent encore un style minimal (gris/bleu uni) pour avancer vite sur les fonctionnalités.
- **`relationship_label` pas encore un vrai lien par paire** : reste un champ texte simple posé par le créateur de la famille sur sa propre perception (ex: "Grand-mère" = grand-mère du créateur), pas une relation stockée dans `relationships` entre le créateur et chaque personne centrale — contrairement aux liens que l'arbre familial (étape 5) sait maintenant capturer pour tout le monde. Pas bloquant, juste incohérent avec le reste du modèle.
- **Repiocher un fait déjà posé** : autorisé seulement quand il ne reste plus aucun fait jamais posé, en prévenant les joueurs. Forme de l'avertissement à définir (message dans la question, sur l'accueil, par email ?).
- **Monétisation** (piste ouverte le 2026-11-10, rien de décidé) : voir « Monétisation » dans `concept.md`. À trancher après le premier test, en observant ce que les familles utilisent vraiment.

## Décisions déjà prises (pour éviter de les re-discuter)

- Une session de quiz = **une seule question** (pas un lot), avec une semaine pour y répondre (clarifié le 2026-11-09, voir `concept.md`).
- Terminologie retenue : **« personne centrale »** (pas « personne fondatrice », « vedette », etc.).
- Pas de QCM en V1 : les joueurs répondent avec le même champ guidé que l'auteur du fait.
- Seuil du quiz automatique : au moins 3 joueurs dans la famille, sinon la pioche automatique hebdomadaire ne se déclenche pas pour cette famille (`auto_create_quiz_sessions()`, voir migration `20261109240000_automatic_triggering.sql`).
- Déclenchement automatique (2026-11-10) : pioche hebdomadaire (lundi 8h) et révélation à la deadline (vérifiée toutes les heures, réponses manquantes comptées fausses ; **pas de révélation automatique tant qu'il reste une réponse libre à valider** — décision du 2026-11-10, corrigé par la migration `20261110100000_reveal_waits_validation_and_answer_lock.sql`, qui bloque aussi les réponses après la deadline ou la révélation) tournent via `pg_cron`. Pendant la phase de test, ces tâches sont à désactiver (voir « À faire sur l'ordinateur avec Supabase ») et on utilise les boutons manuels (pioche immédiate, révélation par l'auteur). **La révélation manuelle n'existe que pour la phase de test**, et n'est pas bloquée par les joueurs qui n'ont pas répondu (comptés faux). Saisie libre : validations faites avant la deadline → révélation à la deadline ; faites après → révélation immédiate à la dernière validation (`20261110110000_reveal_timing_rules.sql`).
- Pas de choix entre plusieurs conjoints en cas de remariage (2026-11-10) : `<conjoint>` se résout sur la première relation `spouse_of` trouvée pour la personne centrale. Suffisant pour le MVP, à revoir si un cas réel de remariage se présente.
- Arbre familial en lecture + ajout de relations et de personnes, pas de suppression/modification (2026-11-10) : une relation ou une personne ajoutée par erreur se corrige directement en base pour l'instant. Toute personne créée depuis cet écran est non centrale (`is_central = false`, `kind = 'profile'`) - devenir centrale reste un choix fait ailleurs (pas d'UI pour ça aujourd'hui).
- Resend reste l'envoyeur d'email (sandbox, pas de domaine acheté) — ne pas reproposer de le désactiver.
- Catalogue de templates géré par nous, pas par les familles, en V1.
- Pas de maximum technique sur le nombre de personnes centrales (recommandation UI : 1 à 4). Une nouvelle personne centrale peut être ajoutée à tout moment, sans gatekeeper.

## Prochains sujets (à choisir, ou proposer autre chose)

- Emails/notifications (nouvelle session, rappels, résultats, relances de validation) + « prise de main ».
- Réactions/commentaires sur les faits révélés.
- Score de contribution + relances si un membre n'a rien ajouté.
- Application de la direction visuelle aux autres écrans : charte posée dans `docs/design.md` (2026-11-10), à appliquer écran par écran.
- **Refonte de la navigation (décidée le 2026-11-10)**, détail dans `docs/ecrans.md` (règles communes, écrans 4, 9 à 12). Ordre suggéré :
  1. ~~**Corriger la pioche**~~ : **fait le 2026-11-10** (`pioche.ts` + migration `20261110130000_pioche_never_posed_first.sql`, testés).
  2. **Écran d'accueil (écran 4)** : bandeau famille (bouton famille, bouton « Inviter », menu burger), deux boutons centraux « Participer au quiz » (avec ses 7 états) et « Consulter les connaissances », puis « Ajouter un souvenir » (alerte sous 5 faits jamais posés), « Historique », « Mes faits » (badge corrections). Carte « Lancer votre premier quiz » pour une famille qui démarre. **Maquette validée le 2026-11-10** (7 états, lien et charte dans `docs/design.md`) : reste à coder `src/app/home.tsx`, avec les polices Fredoka et Nunito à ajouter au projet.
  3. **Arbre familial (écran 10)** : **maquette validée le 2026-11-10** (règles complètes dans `docs/ecrans.md`, écran 10). Navigation par générations avec crans verticaux et horizontaux, traits à angle droit pour toutes les familles visibles, amorces, mode consultation à l'arrivée et bouton « Modifier » ; nouveaux types de relation « enfant » et « frère / sœur » (`sibling_of`, migration nécessaire). Module de placement **fait** (`src/lib/family-tree-layout.ts`, `npm run test:layout`), **écran réécrit** (`src/app/family-tree.tsx`) et migration `sibling_of` écrite, le 2026-11-10 : reste à tester à l'écran (écarts avec la maquette listés dans `docs/ecrans.md`, écran 10). À tester à l'écran avec une grande fratrie (8-9 enfants avec conjoints et enfants).
  4. **Récapitulatif d'une personne (écran 11)** : mini-biographie rédigée par catégorie. Demande d'écrire une phrase `recap` pour chacun des 32 templates de `question-templates.toml`.
  5. **Historique (écran 12)** : questions déjà posées + tableau des scores. Demande le **score cumulé** inter-sessions (agrégation en base, pas encore construite).
  6. Supprimer l'écran Archives (`src/app/archive.tsx`) une fois remplacé par les écrans 10 à 12.
  7. Propositions de correction : badge sur « Mes faits », email en attendant les notifications push (phase 2).
- Vraie capture par paire du lien de parenté créateur ↔ personnes centrales (`relationship_label`), voir « Points à décider ».
- Phase 2 : notifications push, builds natifs iOS/Android.
